import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Main-view identity.
 *
 * DSH 0.2.0-rc.2 no longer keeps a `current` field on the Session list: the displayed Session is
 * the one the main view retains, published on the list summary as `retainedBy.mainView`. That is
 * the same fact the official Session adapter reads, so this module stays on the public surface.
 *
 * @module
 */

/** Read the displayed Session id from one list snapshot. */
export function displayedSessionIdIn(snapshot: SessionListState): SessionId | undefined {
  for (const id of snapshot.ids) {
    if (isSessionDisplayed(snapshot, id)) return id
  }
  return undefined
}

/**
 * Whether one Session currently owns the main view.
 *
 * A narrow or partially hydrated list row may carry no retention facts at all; absence therefore
 * means "not displayed" instead of throwing inside the client.
 */
export function isSessionDisplayed(snapshot: SessionListState, sessionId: SessionId | undefined): boolean {
  if (sessionId === undefined) return false
  const summary: { readonly retainedBy?: { readonly mainView?: number } } | undefined = snapshot.byId[sessionId]
  return (summary?.retainedBy?.mainView ?? 0) > 0
}

/** Read the displayed Session from a live Controller list. */
export function readDisplayedSession(sessions: Pick<ISessions, 'list'>): SessionId | undefined {
  return displayedSessionIdIn(sessions.list.getSnapshot())
}

/** Whether one Session owns the main view of a live Controller list. */
export function readIsSessionDisplayed(
  sessions: Pick<ISessions, 'list'>,
  sessionId: SessionId | undefined,
): boolean {
  return isSessionDisplayed(sessions.list.getSnapshot(), sessionId)
}
