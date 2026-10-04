import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import { installTenderWorkflowReveal } from '../src/client/submission-reveal.ts'
import { createEmptyTenderWorkflowProjection, type TenderWorkflowProjectionV2 } from '../src/contracts/workflow.ts'

/**
 * The reveal is driven by the Host projection fact (a started business task) instead of a Session
 * internal, so the fixture supplies a list with main-view retention plus the projection source the
 * plugin reads through its own port.
 */
const business = 'session-dsh-tender-workbench-11111111-1111-4111-8111-111111111111' as SessionId
const otherBusiness = 'session-dsh-tender-workbench-22222222-2222-4222-8222-222222222222' as SessionId
const ordinary = 'ordinary-session' as SessionId

function taskProjection(taskId: string): TenderWorkflowProjectionV2 {
  const projection = createEmptyTenderWorkflowProjection()
  projection.query = {
    scope: 'tender',
    targetSummary: '任务',
    sources: {},
    total: 0,
    duplicateCount: 0,
    invalidCount: 0,
    querySpec: {
      id: taskId,
      kind: 'query-spec',
      createdAt: '2026-01-01T00:00:00Z',
      fileName: 'query.json',
      mediaType: 'application/json',
      accessToken: 'never-log-this',
    },
  }
  return projection
}

function fixture(displayed: SessionId = business) {
  let raw: unknown = null
  let displayedId: SessionId | undefined = displayed
  let projectionListener = () => {}
  let listListener = () => {}
  const projectionSource = {
    getSnapshot: () => raw,
    subscribe: (listener: () => void) => { projectionListener = listener; return () => { projectionListener = () => {} } },
  }
  const list = {
    getSnapshot: () => ({
      ids: [business, otherBusiness, ordinary],
      byId: {
        [business]: { retainedBy: { mainView: displayedId === business ? 1 : 0 } },
        [otherBusiness]: { retainedBy: { mainView: displayedId === otherBusiness ? 1 : 0 } },
        [ordinary]: { retainedBy: { mainView: displayedId === ordinary ? 1 : 0 } },
      },
    }),
    subscribe: (listener: () => void) => { listListener = listener; return () => { listListener = () => {} } },
  }
  const reveal = vi.fn()
  const stop = installTenderWorkflowReveal(
    { list, binding: () => ({ session: { projections: { faceOf: () => projectionSource } } }) } as unknown as Pick<ISessions, 'list' | 'binding'>,
    reveal,
  )
  return {
    reveal,
    stop,
    project: (value: unknown) => { raw = value; projectionListener() },
    switchTo: (value: SessionId | undefined) => { displayedId = value; listListener() },
  }
}

describe('accepted business task reveal', () => {
  it('stays closed while no business task exists', () => {
    const f = fixture()
    f.project(null)
    f.project(createEmptyTenderWorkflowProjection())
    expect(f.reveal).not.toHaveBeenCalled()
    f.stop()
  })

  it('opens once when the displayed tender Session starts a task', () => {
    const f = fixture()
    f.project(taskProjection('task-one'))
    expect(f.reveal).toHaveBeenCalledExactlyOnceWith(business)
    f.project(taskProjection('task-one'))
    f.switchTo(business)
    expect(f.reveal).toHaveBeenCalledTimes(1)
    f.stop()
  })

  it('opens again for a new task of the same Session', () => {
    const f = fixture()
    f.project(taskProjection('task-one'))
    f.project(taskProjection('task-two'))
    expect(f.reveal).toHaveBeenCalledTimes(2)
    f.stop()
  })

  it('never opens for an ordinary Session and never steals a background Session', () => {
    const f = fixture(ordinary)
    f.project(taskProjection('task-one'))
    expect(f.reveal).not.toHaveBeenCalled()
    // A background business Session that gains a task must not steal the panel.
    f.project(taskProjection('task-two'))
    expect(f.reveal).not.toHaveBeenCalled()
    f.stop()
  })

  it('reveals the other Session only after it becomes displayed', () => {
    const f = fixture(otherBusiness)
    f.project(taskProjection('task-one'))
    expect(f.reveal).toHaveBeenCalledExactlyOnceWith(otherBusiness)
    f.stop()
  })

  it('ignores projection updates after disposal and isolates reveal failures', () => {
    const f = fixture()
    f.reveal.mockImplementation(() => { throw new Error('provider removed') })
    expect(() => f.project(taskProjection('task-one'))).not.toThrow()
    f.stop()
    f.project(taskProjection('task-two'))
    expect(f.reveal).toHaveBeenCalledTimes(1)
  })
})
