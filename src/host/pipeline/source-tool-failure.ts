import type { ProviderOutcome } from '../../contracts/execution.ts'

/**
 * Classification of one failed source-tool call.
 *
 * A provider call can fail for three materially different reasons, and the operator action differs
 * for each, so the plugin must not collapse them into one message:
 *
 * - `not-installed` — the tool is not visible in this Session at all. DSH reports an absent tool
 *   and a tool hidden from this caller as `UNKNOWN_TOOL` alike (see `@deepseek-ai/dsh-tools`
 *   `HarnessError`), so both mean "the source connector is missing, disabled, or unauthorized for
 *   this Session". Retrying is pointless until that is fixed.
 * - `no-permission` — the provider answered with an explicit authorization failure.
 * - `failed` — a real call that failed (transport, server, payload); a retry can help.
 *
 * @module
 */

/** Failure outcomes a provider call can produce; the success path never uses these. */
export type SourceToolFailureOutcome = Extract<ProviderOutcome, 'failed' | 'no-permission' | 'not-installed' | 'unknown'>

export interface SourceToolFailure {
  readonly outcome: SourceToolFailureOutcome
  /** Operator-facing, actionable text. Never echoes a raw provider payload. */
  readonly message: string
  /** Whether repeating the same call can plausibly succeed without an environment change. */
  readonly retryable: boolean
}

/** DSH's single code for "no such tool is visible to this caller". */
const MISSING_TOOL_CODES = new Set(['UNKNOWN_TOOL'])

/** Explicit authorization failures reported by the connector or the MCP server. */
const PERMISSION_CODES = new Set(['401', '403', 'FORBIDDEN', 'UNAUTHORIZED', 'NO_PERMISSION'])

/** The connector this plugin reads its two source tools from. */
export const TENDER_SOURCE_CONNECTOR = 'dsh-mcp-connector'

export function classifySourceToolFailure(input: {
  readonly toolName: string
  readonly code: string
}): SourceToolFailure {
  const code = input.code.trim().toUpperCase()
  if (MISSING_TOOL_CODES.has(code)) {
    return {
      outcome: 'not-installed',
      retryable: false,
      message: `缺来源工具 ${input.toolName}：本 Profile 未安装、未启用或未授权该来源连接器（${TENDER_SOURCE_CONNECTOR} + 企查查 MCP）；安装并授权后重新提交，直接重试不会成功。`,
    }
  }
  if (PERMISSION_CODES.has(code)) {
    return {
      outcome: 'no-permission',
      retryable: true,
      message: `来源工具 ${input.toolName} 拒绝调用：MCP 授权或额度不可用，请检查客户侧授权后重试。`,
    }
  }
  return {
    outcome: 'failed',
    retryable: true,
    message: '来源工具调用失败，请检查连接后重试。',
  }
}
