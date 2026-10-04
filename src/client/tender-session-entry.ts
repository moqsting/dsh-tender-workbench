import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { displayedSessionIdIn } from './current-session.ts'

/**
 * Session entry for the tender workbench.
 *
 * DSH 0.2.0-rc.2 publishes Session creation as a public Controller method
 * (`ISessions.create({ workspaceId, sessionId })`), so the entry never probes for a private
 * capability any more. The displayed Session comes from the main-view retention fact
 * (see {@link ./current-session.ts}).
 *
 * @module
 */

export const TENDER_ENTRY_SESSION_ID_PREFIX = 'session-dsh-tender-workbench-'

export type TenderSessionEntryErrorCode = 'invalid-session-id' | 'workspace-unavailable'

export class TenderSessionEntryError extends Error {
  constructor(readonly code: TenderSessionEntryErrorCode) {
    super(code)
    this.name = 'TenderSessionEntryError'
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function browserUuid(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new TenderSessionEntryError('invalid-session-id')
  }
  return globalThis.crypto.randomUUID()
}

export function isTenderEntrySessionId(sessionId: string | undefined): boolean {
  return sessionId?.startsWith(TENDER_ENTRY_SESSION_ID_PREFIX) === true
    && UUID_PATTERN.test(sessionId.slice(TENDER_ENTRY_SESSION_ID_PREFIX.length))
}

export function createTenderEntrySessionId(uuid: string): SessionId {
  if (!UUID_PATTERN.test(uuid)) throw new TenderSessionEntryError('invalid-session-id')
  return `${TENDER_ENTRY_SESSION_ID_PREFIX}${uuid}` as SessionId
}

/**
 * Resolve host-owned Workspace identity, not just a directory. Existing membership wins; a
 * legacy ungrouped Session may match a registered path. Never register a new Workspace and never
 * create an ungrouped business Session here.
 */
export function resolveTenderEntryWorkspaceId(
  sessions: Pick<ISessions, 'list'>,
  workspaces: Pick<IWorkspaces, 'list'>,
): WorkspaceId | undefined {
  const sessionSnapshot = sessions.list.getSnapshot()
  const current = displayedSessionIdIn(sessionSnapshot)
  const workspaceSnapshot = workspaces.list.getSnapshot()
  const currentWorkspace = current === undefined
    ? undefined
    : workspaceSnapshot.items.find(workspace => workspace.sessionIds.includes(current))
  if (currentWorkspace !== undefined) return currentWorkspace.workspaceId
  const cwd = current === undefined ? undefined : sessionSnapshot.byId[current]?.cwd
  if (cwd !== undefined) {
    // Do not silently redirect a selected but unregistered directory into an
    // unrelated first Workspace. Ask the user to register/select it instead.
    return workspaceSnapshot.items.find(workspace => workspace.path === cwd)?.workspaceId
  }
  return workspaceSnapshot.items[0]?.workspaceId
}

/**
 * Create a distinct native Session explicitly attached to its Workspace. The namespaced identity
 * keeps the business Session recognisable to this plugin, and the Workspace membership keeps it
 * grouped where the user works.
 */
export async function createTenderEntrySession(
  sessions: ISessions,
  workspaces: IWorkspaces,
  uuid: () => string = browserUuid,
): Promise<SessionId> {
  const workspaceId = resolveTenderEntryWorkspaceId(sessions, workspaces)
  if (workspaceId === undefined) throw new TenderSessionEntryError('workspace-unavailable')
  const requestedId = createTenderEntrySessionId(uuid())
  const createdId = await sessions.create({ workspaceId, sessionId: requestedId })
  if (createdId !== requestedId) throw new TenderSessionEntryError('invalid-session-id')
  return createdId
}
