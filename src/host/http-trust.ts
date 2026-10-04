import type { IncomingMessage } from 'node:http'

/**
 * Loopback request trust for the plugin's plain HTTP surface.
 *
 * Every route of this plugin is served by a DSH Web host bound to `127.0.0.1`. Origin checks are
 * therefore a CSRF fence for the browser, never an authentication mechanism: the session header
 * identifies the Session, a per-artifact capability token protects artifact bytes, and
 * `sec-fetch-site` / `Origin` decide whether a browser page was allowed to send the request.
 *
 * @module
 */

export interface ArtifactRequestIdentity {
  readonly host: string
  readonly sessionId: string
  readonly artifactToken: string
}

export interface LoopbackRequestIdentity {
  readonly host: string
  readonly sessionId: string
}

function rawHeaderValues(request: IncomingMessage, name: string): string[] {
  const lower = name.toLowerCase()
  const values: string[] = []
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === lower) values.push(request.rawHeaders[index + 1] ?? '')
  }
  return values
}

function isLoopbackAddress(value: string | undefined): boolean {
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1'
}

function isLoopbackHost(value: string): boolean {
  try {
    const hostname = new URL(`http://${value}`).hostname.toLowerCase()
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
  } catch {
    return false
  }
}

/**
 * Validate one same-origin loopback request that names a Session.
 *
 * Exactly one `Host` and exactly one `X-Dsh-Tender-Session` header are required; repeated security
 * headers are a smuggling signal and are rejected. When `Sec-Fetch-Site` is present it must be
 * `same-origin`, and when `Origin` is present its authority must equal the `Host` authority. A
 * request that carries neither signal is rejected, so a plain cross-site form post cannot pass.
 */
export function loopbackSessionIdentity(request: IncomingMessage): LoopbackRequestIdentity | undefined {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return undefined
  const hosts = rawHeaderValues(request, 'host')
  const sessions = rawHeaderValues(request, 'x-dsh-tender-session')
  const origins = rawHeaderValues(request, 'origin')
  const sites = rawHeaderValues(request, 'sec-fetch-site')
  if (hosts.length !== 1 || sessions.length !== 1 || origins.length > 1 || sites.length > 1) return undefined
  const host = hosts[0] ?? ''
  const sessionId = sessions[0] ?? ''
  if (!isLoopbackHost(host) || sessionId === '' || sessionId.length > 128) return undefined
  const site = sites[0]
  if (site !== undefined && site !== 'same-origin') return undefined
  const origin = origins[0]
  if (origin !== undefined) {
    try {
      const parsed = new URL(origin)
      if (parsed.protocol !== 'http:' || parsed.host !== host) return undefined
    } catch {
      return undefined
    }
  } else if (site !== 'same-origin') {
    return undefined
  }
  return { host, sessionId }
}

/** Profile metadata is same-origin read-only; no artifact capability is returned. */
export function historyRequestIdentity(request: IncomingMessage): string | undefined {
  return loopbackSessionIdentity(request)?.sessionId
}

export function artifactRequestIdentity(request: IncomingMessage): ArtifactRequestIdentity | undefined {
  const identity = loopbackSessionIdentity(request)
  if (identity === undefined) return undefined
  const tokens = rawHeaderValues(request, 'x-dsh-tender-artifact-token')
  if (tokens.length !== 1) return undefined
  const artifactToken = tokens[0] ?? ''
  if (artifactToken === '' || artifactToken.length > 128) return undefined
  return { host: identity.host, sessionId: identity.sessionId, artifactToken }
}
