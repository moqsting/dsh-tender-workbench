import { TenderWorkbenchIntentV2Schema, type TenderWorkbenchIntentV2 } from '../../contracts/intents.ts'
import type { TenderWorkbenchIntentKindV2 } from '../../contracts/orchestration.ts'
import { tenderIntentFingerprint } from '../intent-fingerprint.ts'

/**
 * Workbench Intent authorization.
 *
 * A V2 Intent travels as plain text inside a user message, so the text alone can never prove that
 * the structured workbench page issued it. The host therefore keeps a bounded, session-keyed,
 * expiring grant table: the workbench page registers each Intent over the loopback-only
 * `/dsh-tender-workbench/api/v1/intents` route before submitting it, and every mutating tool call
 * must match a live grant. Pasted or injected Intent text has no grant and fails closed.
 *
 * @module
 */

/** Grant lifetime: long enough for a real workbench action, short enough to bound replay. */
export const WORKBENCH_INTENT_GRANT_TTL_MS = 15 * 60 * 1_000

/** Retained grants per Session; the oldest grants are dropped once the cap is reached. */
export const WORKBENCH_INTENT_GRANT_CAP = 64

export interface WorkbenchIntentGrantQuery {
  readonly intentId: string
  readonly kind: TenderWorkbenchIntentKindV2
  readonly fingerprint: string
}

interface WorkbenchIntentGrant {
  readonly intentId: string
  readonly kind: TenderWorkbenchIntentKindV2
  readonly fingerprint: string
  readonly expiresAt: number
}

export interface IntentAuthorizationGateOptions {
  readonly ttlMs?: number
  readonly capacity?: number
  readonly now?: () => number
}

/** Rejects an Intent that cannot be represented as a V2 workbench Intent. */
export class IntentAuthorizationFormatError extends Error {
  override readonly name = 'IntentAuthorizationFormatError'
}

/**
 * Bounded, session-keyed grant table for structured workbench Intents.
 *
 * `issue` is called by the loopback registration route only; `authorize` is called by the tool
 * authorization gate. A grant is reusable while it is live, because one Intent legitimately drives
 * several tools (prepare/commit, narrative/create); replay safety still comes from receipts.
 */
export class IntentAuthorizationGate {
  private readonly grantsBySession = new Map<string, Map<string, WorkbenchIntentGrant>>()
  private readonly ttlMs: number
  private readonly capacity: number
  private readonly now: () => number

  constructor(options: IntentAuthorizationGateOptions = {}) {
    this.ttlMs = options.ttlMs ?? WORKBENCH_INTENT_GRANT_TTL_MS
    this.capacity = options.capacity ?? WORKBENCH_INTENT_GRANT_CAP
    this.now = options.now ?? Date.now
  }

  /** Register one Intent as authorized for its Session. Returns the canonical fingerprint. */
  issue(sessionKey: string, value: unknown): string {
    const intent = TenderWorkbenchIntentV2Schema.safeParse(value)
    if (!intent.success) throw new IntentAuthorizationFormatError('Intent 结构与 V2 工作台契约不一致。')
    const fingerprint = tenderIntentFingerprint(intent.data)
    this.issueParsed(sessionKey, intent.data, fingerprint)
    return fingerprint
  }

  /** Register an already validated Intent; used by tests and by callers that hold the parse. */
  issueParsed(sessionKey: string, intent: TenderWorkbenchIntentV2, fingerprint: string): void {
    const now = this.now()
    const grants = this.prune(sessionKey, now)
    grants.delete(intent.intentId)
    grants.set(intent.intentId, {
      intentId: intent.intentId,
      kind: intent.kind,
      fingerprint,
      expiresAt: now + this.ttlMs,
    })
    while (grants.size > this.capacity) {
      const oldest = grants.keys().next()
      if (oldest.done === true) break
      grants.delete(oldest.value)
    }
  }

  /** True only when a live grant matches the Intent identity exactly. */
  authorize(sessionKey: string, query: WorkbenchIntentGrantQuery): boolean {
    const grant = this.prune(sessionKey, this.now()).get(query.intentId)
    if (grant === undefined) return false
    return grant.fingerprint === query.fingerprint && grant.kind === query.kind
  }

  /** Drop every grant of one Session, for example when its workbench lifetime ends. */
  forget(sessionKey: string): void {
    this.grantsBySession.delete(sessionKey)
  }

  /** Live grant count for one Session; diagnostics and tests only. */
  liveCount(sessionKey: string): number {
    return this.prune(sessionKey, this.now()).size
  }

  private prune(sessionKey: string, now: number): Map<string, WorkbenchIntentGrant> {
    const existing = this.grantsBySession.get(sessionKey)
    if (existing === undefined) {
      const created = new Map<string, WorkbenchIntentGrant>()
      this.grantsBySession.set(sessionKey, created)
      return created
    }
    for (const [intentId, grant] of existing) {
      if (grant.expiresAt <= now) existing.delete(intentId)
    }
    return existing
  }
}

/** Process-wide gate shared by the registration route and the tool authorization gate. */
export const workbenchIntentAuthorizations = new IntentAuthorizationGate()
