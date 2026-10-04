import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TenderClientContext } from './client-context.ts'
import { readDisplayedSession } from './current-session.ts'
import { initializeTenderDraft, type InitialDraftPort, type InitialDraftSnapshot } from './initial-draft.ts'

/**
 * Bind the one-time native tender draft to the DSH 0.2.0-rc.2 composer.
 *
 * The public surface is `conversation.input.for(actx)` (a `SessionInput` exposing `setDraft` and
 * the published `InputState` store). The editor handle of DSH 0.1.x is package-private now, so
 * this module treats it as an OPTIONAL read-only hint: when a legacy shell face is still
 * reachable it refines readiness (root connected) and cancellation (IME composing, DOM input
 * events); otherwise the published store alone decides. Every write goes through the public
 * `setDraft`, and every subscription this module opens is released by its own disposer.
 *
 * @module
 */

/** Optional read-only editor hint; never required for correctness. */
interface EditorHint {
  getRootElement?(): HTMLElement | null
  isComposing?(): boolean
  registerRootListener?(listener: (root: HTMLElement | null) => void): () => void
}

interface InitialDraftState {
  readonly draft: string
  readonly draftRev: number
  readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
  readonly attachmentIds: readonly unknown[]
  readonly occurrences: readonly unknown[]
}

/** The public per-Session input face this module depends on. */
interface SessionInputFace {
  setDraft(text: string): void
  readonly state: {
    getSnapshot(): InitialDraftState
    subscribe(listener: () => void): () => void
  }
}

const EDITOR_HINT_EVENTS = ['beforeinput', 'paste', 'drop', 'compositionstart'] as const

function probeEditorHint(input: unknown, id: SessionId): EditorHint | undefined {
  const shell = (input as { shell?: unknown }).shell
  if (typeof shell !== 'function') return undefined
  try {
    const face = (shell as (sessionId: SessionId) => { editor?: EditorHint } | undefined).call(input, id)
    const editor = face?.editor
    return editor === undefined || editor === null ? undefined : editor
  } catch {
    return undefined
  }
}

function storagePort(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return window.localStorage
  } catch {
    // Unavailable storage must fail closed; `initial-draft.ts` maps a throwing port to "no refill".
    return {
      getItem() { throw new Error('localStorage unavailable') },
      setItem() { throw new Error('localStorage unavailable') },
    }
  }
}

export function initializeTenderHostDraft(ctx: TenderClientContext, id: SessionId): () => void {
  // Missing public capabilities mean "no initial draft", never a broken business menu.
  if (typeof ctx.sessions?.scope !== 'function'
    || typeof ctx.sessions.list?.subscribe !== 'function'
    || typeof ctx.conversation?.input?.for !== 'function') {
    return () => {}
  }
  let disposed = false
  let started = false
  let stopDraft = () => {}
  const listOff = ctx.sessions.list.subscribe(() => { attempt() })
  const timeout = setTimeout(() => { dispose() }, 5_000)

  function dispose(): void {
    if (disposed) return
    disposed = true
    clearTimeout(timeout)
    listOff()
    stopDraft()
  }

  function readSnapshot(input: SessionInputFace, editorHint: EditorHint | undefined): InitialDraftSnapshot {
    const state = input.state.getSnapshot()
    // A reachable editor handle is authoritative: an unmounted or detached root is not ready.
    const connected = editorHint?.getRootElement === undefined
      ? undefined
      : editorHint.getRootElement()?.isConnected === true
    return {
      current: readDisplayedSession(ctx.sessions),
      ready: connected ?? true,
      composing: editorHint?.isComposing?.() === true,
      draft: state.draft,
      revision: state.draftRev,
      attachments: state.attachmentIds.length + state.occurrences.length,
      plain: state.phase === 'plain',
    }
  }

  function createPort(input: SessionInputFace): InitialDraftPort {
    let editorHint: EditorHint | undefined
    return {
      snapshot: () => readSnapshot(input, editorHint),
      subscribe(check, cancel) {
        let detachEditorEvents = () => {}
        let rootOff = () => {}
        const stateOff = input.state.subscribe(check)
        editorHint = probeEditorHint(input, id)
        const hint = editorHint
        if (hint?.registerRootListener !== undefined) {
          rootOff = hint.registerRootListener((root) => {
            detachEditorEvents()
            if (root !== null) {
              EDITOR_HINT_EVENTS.forEach(event => root.addEventListener(event, cancel, true))
              detachEditorEvents = () => {
                EDITOR_HINT_EVENTS.forEach(event => root.removeEventListener(event, cancel, true))
              }
            }
            check()
          })
        }
        check()
        return () => {
          detachEditorEvents()
          rootOff()
          stateOff()
        }
      },
      write(text) {
        // The published draft API is the documented programmatic write path.
        input.setDraft(text)
      },
    }
  }

  function attempt(): void {
    if (disposed || started) return
    const scoped = ctx.sessions.scope(id)
    if (scoped === undefined) return
    let input: SessionInputFace
    try {
      input = ctx.conversation.input.for(scoped) as unknown as SessionInputFace
    } catch {
      return
    }
    if (typeof input.setDraft !== 'function' || typeof input.state?.subscribe !== 'function') return
    started = true
    stopDraft = initializeTenderDraft(id, createPort(input), storagePort())
  }

  attempt()
  return dispose
}
