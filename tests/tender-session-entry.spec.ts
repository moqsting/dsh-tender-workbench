import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import {
  TENDER_ENTRY_SESSION_ID_PREFIX,
  TenderSessionEntryError,
  createTenderEntrySession,
  createTenderEntrySessionId,
  isTenderEntrySessionId,
  resolveTenderEntryWorkspaceId,
} from '../src/client/tender-session-entry.ts'

const firstWorkspaceId = 'workspace-1' as WorkspaceId
const recentWorkspaceId = 'workspace-2' as WorkspaceId

/**
 * DSH 0.2.0-rc.2 publishes the displayed Session through the main-view retention of the list
 * summary, so the fixture models exactly that fact instead of the retired `current` field.
 */
function runtime(current: SessionId | null = 'ordinary-session' as SessionId) {
  const displayed = current ?? undefined
  const byId: Record<string, { cwd?: string; retainedBy: { mainView: number } }> = {}
  if (displayed !== undefined) byId[displayed] = { retainedBy: { mainView: 1 } }
  const sessionSnapshot = {
    ids: displayed === undefined ? [] : [displayed],
    byId,
    phase: 'ready' as const,
    projectionsBySession: {},
  }
  const workspaceSnapshot = {
    items: [
      { workspaceId: firstWorkspaceId, path: 'C:\\one', title: 'one', sessionIds: displayed === undefined ? [] : [displayed] },
      { workspaceId: recentWorkspaceId, path: 'C:\\two', title: 'two', sessionIds: [] },
    ],
    archivedSessionIds: [],
    state: 'idle' as const,
    phase: 'ready' as const,
    error: null,
    baselinesReady: true,
  }
  const create = vi.fn(async ({ sessionId }: { sessionId: SessionId }) => sessionId)
  const sessions = {
    list: { getSnapshot: () => sessionSnapshot },
    create,
  } as unknown as ISessions
  const workspaces = {
    list: { getSnapshot: () => workspaceSnapshot },
    connectWorkspace: vi.fn(),
    startSession: vi.fn(),
  } as unknown as IWorkspaces & { connectWorkspace: ReturnType<typeof vi.fn>; startSession: ReturnType<typeof vi.fn> }
  return { create, sessions, workspaces, workspaceSnapshot, sessionSnapshot }
}

describe('dedicated tender Session entry', () => {
  it('uses the displayed Session workspace and creates a namespaced native Session id', async () => {
    const test = runtime()
    const uuid = '12345678-1234-4234-8234-123456789abc'
    const sessionId = await createTenderEntrySession(test.sessions, test.workspaces, () => uuid)

    expect(sessionId).toBe(`${TENDER_ENTRY_SESSION_ID_PREFIX}${uuid}`)
    expect(isTenderEntrySessionId(sessionId)).toBe(true)
    expect(isTenderEntrySessionId(`${TENDER_ENTRY_SESSION_ID_PREFIX}not-a-uuid`)).toBe(false)
    expect(test.create).toHaveBeenCalledWith({
      workspaceId: firstWorkspaceId,
      sessionId: createTenderEntrySessionId(uuid),
    })
    expect(test.workspaces.connectWorkspace).not.toHaveBeenCalled()
    expect(test.workspaces.startSession).not.toHaveBeenCalled()
  })

  it('ignores a Session that is not displayed', () => {
    const test = runtime()
    test.sessionSnapshot.byId['ordinary-session']!.retainedBy.mainView = 0
    test.sessionSnapshot.ids = []
    expect(resolveTenderEntryWorkspaceId(test.sessions, test.workspaces)).toBe(firstWorkspaceId)
  })

  it('falls back to the first registered workspace when no Session is selected', () => {
    const test = runtime(null)
    expect(resolveTenderEntryWorkspaceId(test.sessions, test.workspaces)).toBe(firstWorkspaceId)
  })

  it('uses explicit membership even when the Session cwd points at another registered path', () => {
    const test = runtime()
    test.workspaceSnapshot.items[0]!.sessionIds = []
    test.workspaceSnapshot.items[1]!.sessionIds = ['ordinary-session' as SessionId]
    test.sessionSnapshot.byId['ordinary-session'] = { cwd: 'C:\\one', retainedBy: { mainView: 1 } }
    expect(resolveTenderEntryWorkspaceId(test.sessions, test.workspaces)).toBe(recentWorkspaceId)
  })

  it('resolves a legacy ungrouped Session by an exact registered path', async () => {
    const test = runtime()
    test.workspaceSnapshot.items[0]!.sessionIds = []
    test.sessionSnapshot.byId['ordinary-session'] = { cwd: 'C:\\two', retainedBy: { mainView: 1 } }
    await createTenderEntrySession(test.sessions, test.workspaces, () => '12345678-1234-4234-8234-123456789abc')
    expect(test.create).toHaveBeenCalledWith({ workspaceId: recentWorkspaceId, sessionId: expect.stringContaining(TENDER_ENTRY_SESSION_ID_PREFIX) })
  })

  it('does not redirect an unregistered selected directory to an unrelated first Workspace', async () => {
    const test = runtime()
    test.workspaceSnapshot.items[0]!.sessionIds = []
    test.sessionSnapshot.byId['ordinary-session'] = { cwd: 'C:\\not-registered', retainedBy: { mainView: 1 } }
    await expect(createTenderEntrySession(test.sessions, test.workspaces)).rejects.toMatchObject({ code: 'workspace-unavailable' })
    expect(test.create).not.toHaveBeenCalled()
  })

  it('rejects a missing workspace and malformed or mismatched ids', async () => {
    const test = runtime(null)
    test.workspaceSnapshot.items = []
    await expect(createTenderEntrySession(test.sessions, test.workspaces))
      .rejects.toMatchObject({ code: 'workspace-unavailable' } satisfies Partial<TenderSessionEntryError>)

    expect(() => createTenderEntrySessionId('not-a-uuid'))
      .toThrow(expect.objectContaining({ code: 'invalid-session-id' }))

    const mismatch = runtime()
    mismatch.create.mockResolvedValue('ordinary-session' as SessionId)
    await expect(createTenderEntrySession(
      mismatch.sessions,
      mismatch.workspaces,
      () => '12345678-1234-4234-8234-123456789abc',
    )).rejects.toMatchObject({ code: 'invalid-session-id' } satisfies Partial<TenderSessionEntryError>)
  })
})
