import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  TenderWorkbenchIntentV2Schema,
  type TenderWorkbenchIntentV2,
} from '../../contracts/intents.ts'
import {
  assertTenderActionSkillAvailable,
  type TenderSkillCatalogConnection,
} from '../skill-catalog.ts'
import {
  authorizeTenderWorkbenchIntent,
  type IntentAuthorizationFetch,
} from './intent-authorization.ts'
import { serializeTenderWorkbenchIntent } from './screening-intent.ts'

export class TenderSessionUnavailableError extends Error {
  override readonly name = 'TenderSessionUnavailableError'
}

/**
 * Submit one structured workbench Intent.
 *
 * The Host registers the Intent first and the message is sent only afterwards, so an Intent that
 * the Host refuses to authorize never reaches the Session at all.
 */
export async function sendSessionTenderWorkbenchIntent(
  sessions: Pick<ISessions, 'scope'>,
  connection: TenderSkillCatalogConnection,
  sessionId: SessionId,
  intent: TenderWorkbenchIntentV2,
  fetcher?: IntentAuthorizationFetch,
): Promise<void> {
  const parsed = TenderWorkbenchIntentV2Schema.parse(intent)
  const scoped = sessions.scope(sessionId)
  if (scoped === undefined) throw new TenderSessionUnavailableError(`Tender Session is unavailable: ${sessionId}`)
  const conversation = scoped.get('conversation')
  if (conversation === undefined) throw new TenderSessionUnavailableError(`Tender conversation is unavailable: ${sessionId}`)
  await assertTenderActionSkillAvailable(connection, sessionId, parsed.skill)
  if (fetcher === undefined) await authorizeTenderWorkbenchIntent(sessionId, parsed)
  else await authorizeTenderWorkbenchIntent(sessionId, parsed, fetcher)
  await conversation.send(serializeTenderWorkbenchIntent(parsed))
}
