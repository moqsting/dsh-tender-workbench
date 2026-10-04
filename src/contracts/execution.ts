import { z } from 'zod'

/**
 * Outcome vocabulary for one provider call.
 *
 * `not-installed` is the capability-absence branch, deliberately separate from `failed`: the
 * required source tool is not visible in this Session at all (connector not installed or enabled,
 * or the tool runtime hides it), so retrying the same query can never succeed and the operator
 * needs an installation/authorization step instead of a connectivity check. The tool runtime
 * reports both an absent definition and a hidden one as `UNKNOWN_TOOL`, which is exactly the fact
 * this branch names.
 */
export const PROVIDER_OUTCOMES = ['data', 'zero', 'not-needed', 'no-permission', 'not-installed', 'failed', 'unknown'] as const
export const ProviderOutcomeSchema = z.enum(PROVIDER_OUTCOMES)
export type ProviderOutcome = z.infer<typeof ProviderOutcomeSchema>
const count = z.number().int().nonnegative()
export const TenderExecutionSchema = z.object({
  operationId: z.string().min(1).max(128),
  status: z.enum(['running', 'succeeded', 'partial', 'failed', 'interrupted']),
  currentAction: z.string().min(1).max(200),
  startedAt: count,
  updatedAt: count,
  finishedAt: count.optional(),
  /**
   * Per-outcome counters. `notInstalled` is optional so every Session recorded before this
   * vocabulary existed still parses; readers treat absence as zero.
   */
  counts: z.object({
    queried: count, succeeded: count, zero: count, failed: count,
    noPermission: count, notInstalled: count.optional(), unknown: count, needsReview: count,
  }).strict(),
  recentItem: z.string().max(200).optional(),
  queryTarget: z.string().max(2048).optional(),
  providers: z.object({ tender: ProviderOutcomeSchema, proposed: ProviderOutcomeSchema }).strict(),
}).strict()
export type TenderExecution = z.infer<typeof TenderExecutionSchema>
export function emptyExecution(operationId: string, currentAction: string, time: number): TenderExecution {
  return { operationId, currentAction, status: 'running', startedAt: time, updatedAt: time,
    counts: { queried: 0, succeeded: 0, zero: 0, failed: 0, noPermission: 0, notInstalled: 0, unknown: 0, needsReview: 0 },
    providers: { tender: 'not-needed', proposed: 'not-needed' } }
}
export const PROVIDER_LABELS: Record<ProviderOutcome, string> = {
  data: '成功有数据', zero: '成功零记录', 'not-needed': '无需执行', 'no-permission': '无权限',
  'not-installed': '来源未安装/不可见', failed: '失败', unknown: '未知结果',
}

/** Counters that mean "this source did not contribute a usable result". */
export const PROVIDER_NON_SUCCESS_COUNTERS = ['failed', 'noPermission', 'notInstalled', 'unknown'] as const

/** Total non-success sources in one execution, treating a missing counter as zero. */
export function nonSuccessSourceCount(execution: Pick<TenderExecution, 'counts'>): number {
  const counts: Partial<Record<typeof PROVIDER_NON_SUCCESS_COUNTERS[number], number>> = execution.counts
  return PROVIDER_NON_SUCCESS_COUNTERS.reduce((sum, key) => sum + (counts[key] ?? 0), 0)
}
