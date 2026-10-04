import { describe, expect, it } from 'vitest'
import { classifySourceToolFailure, TENDER_SOURCE_CONNECTOR } from '../src/host/pipeline/source-tool-failure.ts'

const TENDER_TOOL = 'mcp__qcc-tender__search_tenders'

describe('source tool failure classification', () => {
  it('names a missing connector as a non-retryable capability absence', () => {
    const failure = classifySourceToolFailure({ toolName: TENDER_TOOL, code: 'UNKNOWN_TOOL' })
    expect(failure.outcome).toBe('not-installed')
    expect(failure.retryable).toBe(false)
    expect(failure.message).toContain(TENDER_TOOL)
    expect(failure.message).toContain(TENDER_SOURCE_CONNECTOR)
    expect(failure.message).toContain('重试不会成功')
    // An unknown tool must never be reported as a connectivity or permission problem.
    expect(failure.message).not.toContain('检查连接与授权')
  })

  it('keeps explicit authorization failures retryable and distinct from absence', () => {
    for (const code of ['401', '403', 'FORBIDDEN', 'UNAUTHORIZED', 'NO_PERMISSION', ' forbidden ']) {
      const failure = classifySourceToolFailure({ toolName: TENDER_TOOL, code })
      expect(failure).toMatchObject({ outcome: 'no-permission', retryable: true })
      expect(failure.message).toContain(TENDER_TOOL)
    }
  })

  it('treats every other failure as a retryable call failure', () => {
    for (const code of ['', 'SOURCE_FAILED', 'ETIMEDOUT', 'INTERNAL']) {
      expect(classifySourceToolFailure({ toolName: TENDER_TOOL, code }))
        .toMatchObject({ outcome: 'failed', retryable: true, message: '来源工具调用失败，请检查连接后重试。' })
    }
  })
})
