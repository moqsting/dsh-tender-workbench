import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute, WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { loopbackSessionIdentity } from '../http-trust.ts'
import type { IntentAuthorizationGate } from './authorization.ts'

/**
 * Loopback registration route for structured workbench Intents.
 *
 * The workbench page posts the Intent it is about to submit; the host records a short-lived grant
 * that the tool authorization gate later requires. Because the route lives on the `127.0.0.1` Web
 * host, needs a custom header and a same-origin `Sec-Fetch-Site`/`Origin` signal, and is bound to
 * a Session that already exists, arbitrary document text can never mint a grant.
 *
 * @module
 */

export const INTENT_ROUTE = '/dsh-tender-workbench/api/v1/intents'

const MAX_BODY_BYTES = 256 * 1_024
const SAFE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const

interface IntentRouteServices {
  readonly sessions: Pick<SessionStore, 'get'>
  readonly authorizations: IntentAuthorizationGate
}

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.writeHead(status, {
    ...SAFE_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.byteLength),
  })
  res.end(body)
}

/** Read a bounded request body; oversized or aborted requests yield `undefined`. */
async function readBoundedBody(request: IncomingMessage, limit: number): Promise<string | undefined> {
  const chunks: Buffer[] = []
  let total = 0
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      total += buffer.byteLength
      if (total > limit) {
        request.destroy()
        return undefined
      }
      chunks.push(buffer)
    }
  } catch {
    return undefined
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function createIntentRouteHandler(services: IntentRouteServices): WebRoute['handler'] {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    res.on('error', () => undefined)
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      json(res, 405, { error: { code: 'method-not-allowed', message: '只允许 POST。' } })
      return
    }
    const identity = loopbackSessionIdentity(req)
    if (identity === undefined || services.sessions.get(identity.sessionId as SessionId) === undefined) {
      json(res, 404, { error: { code: 'intent-not-found', message: 'Session 不存在或请求不可验证。' } })
      return
    }
    const body = await readBoundedBody(req, MAX_BODY_BYTES)
    if (body === undefined) {
      json(res, 413, { error: { code: 'intent-too-large', message: 'Intent 请求体超出上限。' } })
      return
    }
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(body) as unknown
    } catch {
      json(res, 400, { error: { code: 'invalid-intent-json', message: 'Intent 不是合法 JSON。' } })
      return
    }
    try {
      const fingerprint = services.authorizations.issue(identity.sessionId, parsedBody)
      json(res, 200, { authorized: true, fingerprint })
    } catch {
      json(res, 400, { error: { code: 'invalid-intent', message: 'Intent 不符合 V2 工作台契约。' } })
    }
  }
}

/** Claim the Intent registration prefix on a loopback-only DSH Web host. */
export function registerIntentRoute(
  webServer: Pick<WebServer, 'host' | 'register'>,
  handler: WebRoute['handler'],
): () => void {
  if (webServer.host !== '127.0.0.1') {
    throw new Error('dsh-tender-workbench intent API requires a 127.0.0.1 WebServer binding')
  }
  return webServer.register({ kind: 'exact', path: INTENT_ROUTE, handler })
}
