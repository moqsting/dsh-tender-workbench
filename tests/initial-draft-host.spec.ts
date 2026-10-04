// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TenderClientContext } from '../src/client/client-context.ts'
import { initializeTenderHostDraft } from '../src/client/initial-draft-host.ts'
import { TENDER_INITIAL_DRAFT } from '../src/contracts/initial-draft.ts'

/**
 * The adapter is public-first: the published `InputState` store decides, and a legacy editor handle
 * is only an optional refinement. These tests pin both paths.
 */
const id = 'session-dsh-tender-workbench-33333333-3333-4333-8333-333333333333' as SessionId

beforeEach(() => {
  // Node exposes a non-browser localStorage stub; model the browser storage port explicitly.
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) } })
})
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals() })

function setup(options: {
  attachmentIds?: string[]
  occurrences?: object[]
  composing?: boolean
  connected?: boolean
  displayed?: boolean
  withEditorHint?: boolean
} = {}) {
  const {
    attachmentIds = [], occurrences = [], composing = false,
    connected = true, displayed = true, withEditorHint = true,
  } = options
  const root = document.createElement('div')
  if (connected) document.body.append(root)
  const offRoot = vi.fn(), offState = vi.fn(), offList = vi.fn()
  const input = {
    state: {
      getSnapshot: () => ({ draft: '', draftRev: 0, phase: 'plain', attachmentIds, occurrences }),
      subscribe: vi.fn(() => offState),
    },
    setDraft: vi.fn(),
    // The legacy editor face is an optional read-only hint reachable through the shell probe.
    ...(withEditorHint ? { shell: () => ({ editor: {
      getRootElement: () => (connected ? root : null),
      isComposing: () => composing,
      registerRootListener: vi.fn((listener: (node: HTMLElement | null) => void) => { listener(connected ? root : null); return offRoot }),
    } }) } : {}),
  }
  const ctx = {
    conversation: { input: { for: vi.fn(() => input) } },
    sessions: {
      scope: vi.fn(() => ({})),
      list: {
        getSnapshot: () => ({
          ids: [id],
          byId: { [id]: { retainedBy: { mainView: displayed ? 1 : 0 } } },
        }),
        subscribe: vi.fn(() => offList),
      },
    },
  } as unknown as TenderClientContext
  return { root, input, ctx, offRoot, offState, offList }
}

describe('UX-49 public Host adapter', () => {
  it('writes the template through the published draft API and releases every listener', async () => {
    const h = setup()
    const dispose = initializeTenderHostDraft(h.ctx, id)
    await Promise.resolve()
    expect(h.input.setDraft).toHaveBeenCalledExactlyOnceWith(TENDER_INITIAL_DRAFT.text)
    expect(h.offRoot).toHaveBeenCalled()
    expect(h.offState).toHaveBeenCalled()
    dispose()
    expect(h.offList).toHaveBeenCalled()
  })

  it('writes without any legacy editor handle', async () => {
    const h = setup({ withEditorHint: false })
    const dispose = initializeTenderHostDraft(h.ctx, id)
    await Promise.resolve()
    expect(h.input.setDraft).toHaveBeenCalledExactlyOnceWith(TENDER_INITIAL_DRAFT.text)
    dispose()
  })

  it('does not write while the Session is not displayed', async () => {
    const h = setup({ displayed: false })
    const dispose = initializeTenderHostDraft(h.ctx, id)
    await Promise.resolve()
    expect(h.input.setDraft).not.toHaveBeenCalled()
    dispose()
  })

  it.each([
    { attachmentIds: ['attachment'] },
    { occurrences: [{ source: 'file' }] },
    { composing: true },
    { connected: false },
  ])('preserves native attachments, chips, IME, and an unmounted composer %j', async state => {
    const h = setup(state)
    const dispose = initializeTenderHostDraft(h.ctx, id)
    await Promise.resolve()
    expect(h.input.setDraft).not.toHaveBeenCalled()
    dispose()
  })

  it.each(['beforeinput', 'paste', 'drop', 'compositionstart'])('cancels a queued write on native %s', async event => {
    const h = setup()
    const dispose = initializeTenderHostDraft(h.ctx, id)
    h.root.dispatchEvent(new Event(event))
    await Promise.resolve()
    expect(h.input.setDraft).not.toHaveBeenCalled()
    dispose()
  })

  it('does not fail the business menu when public input capabilities are missing', () => {
    const missingScope = { conversation: { input: { for: vi.fn() } }, sessions: { list: { subscribe: vi.fn() } } } as unknown as TenderClientContext
    expect(() => initializeTenderHostDraft(missingScope, id)()).not.toThrow()
    const missingInput = { conversation: { input: {} }, sessions: { scope: vi.fn(), list: { subscribe: vi.fn() } } } as unknown as TenderClientContext
    expect(() => initializeTenderHostDraft(missingInput, id)()).not.toThrow()
  })
})
