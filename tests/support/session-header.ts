import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Minimal Session header for host-facing fixtures.
 *
 * The format version is a literal type stamped from the runtime constant, so tests must build it
 * through this helper instead of writing a bare number that would widen to `number`.
 */
export function testSessionHeader(id: SessionId): SessionHeader {
  return { version: 4, isSeeded: false, id, createdAt: 1 }
}
