import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TenderWorkbenchIntentV2Schema, type TenderWorkbenchIntentV2 } from '../../contracts/intents.ts'

/**
 * Client half of workbench Intent authorization.
 *
 * The structured workbench page registers the Intent it is about to submit with the Host before
 * that Intent reaches the Session. Only a registered Intent is accepted by the Host tool
 * authorization gate, so Intent text that merely appears in a message can never trigger a
 * structured action.
 *
 * @module
 */

export const INTENT_AUTHORIZATION_ROUTE = '/dsh-tender-workbench/api/v1/intents'

export type IntentAuthorizationFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** Raised when the Host refuses to register an Intent; the caller must not submit the message. */
export class TenderIntentAuthorizationError extends Error {
  override readonly name = 'TenderIntentAuthorizationError'
  constructor(readonly status: number, message = '工作台动作未获得 Host 授权，已取消提交。') {
    super(message)
  }
}

/** Register one Intent with the Host. Fails closed: an unregistered Intent is never submitted. */
export async function authorizeTenderWorkbenchIntent(
  sessionId: SessionId,
  intent: TenderWorkbenchIntentV2,
  fetcher: IntentAuthorizationFetch = globalThis.fetch,
): Promise<void> {
  const parsed = TenderWorkbenchIntentV2Schema.parse(intent)
  const response = await fetcher(INTENT_AUTHORIZATION_ROUTE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dsh-Tender-Session': String(sessionId),
    },
    body: JSON.stringify(parsed),
    credentials: 'same-origin',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) throw new TenderIntentAuthorizationError(response.status)
}
