import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { readDisplayedSession } from './current-session.ts'
import { createTenderProjectionPort, type TenderProjectionRead } from './tender-projection-port.ts'
import { isTenderEntrySessionId } from './tender-session-entry.ts'

/**
 * Reveal the workbench once a business task actually starts.
 *
 * DSH 0.2.0-rc.2 publishes no public "submission admitted" hook, and this plugin does not patch
 * Session internals. It therefore observes its own public projection fact instead: as soon as the
 * displayed tender Session carries a query, the Host has accepted the user's action and the
 * workbench is revealed for that Session — exactly once per business task, and never for a
 * background Session the user is not looking at.
 *
 * @module
 */

type RevealSessions = Pick<ISessions, 'list' | 'binding'>

/** Business-task identity of one projection read; undefined while no task exists. */
function taskIdOf(read: TenderProjectionRead): string | undefined {
  return read.status === 'ready' ? read.projection.query?.querySpec.id : undefined
}

export function installTenderWorkflowReveal(sessions: RevealSessions, reveal: (id: SessionId) => void): () => void {
  const port = createTenderProjectionPort(sessions)
  const revealed = new Map<SessionId, string>()
  let projectionOff = () => {}
  let boundSession: SessionId | undefined
  let disposed = false

  const sync = () => {
    if (disposed) return
    const displayed = readDisplayedSession(sessions)
    if (displayed !== boundSession) {
      projectionOff()
      projectionOff = () => {}
      boundSession = displayed
      if (displayed !== undefined) projectionOff = port.source(displayed).subscribe(sync)
    }
    if (displayed === undefined || !isTenderEntrySessionId(displayed)) return
    const taskId = taskIdOf(port.source(displayed).getSnapshot())
    if (taskId === undefined || revealed.get(displayed) === taskId) return
    revealed.set(displayed, taskId)
    try { reveal(displayed) } catch { /* A reveal failure must never break Host projection delivery. */ }
  }

  // A narrow port without a subscription still gets the initial sync instead of failing the menu.
  const listOff = sessions.list.subscribe?.(sync) ?? (() => {})
  sync()
  return () => {
    disposed = true
    listOff()
    projectionOff()
  }
}
