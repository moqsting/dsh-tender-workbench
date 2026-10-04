import { describe, expect, it } from 'vitest'
// @ts-expect-error Standalone CLI intentionally has no transpilation requirement.
import { assessCompatibility } from '../scripts/check-host-compatibility.mjs'

describe('read-only compatibility gate', () => {
  const good = { host: '0.2.0-rc.2', core: { 'dsh-session': '0.2.0-rc.2' }, sidebar: '0.24.1', node: '24.0.0' }
  it('allows the calibrated host/sidebar without requiring context', () => {
    expect(assessCompatibility(good)).toMatchObject({ errors: [], warnings: [], verifiedBaseline: true })
    expect(assessCompatibility({ ...good, context: '0.48.0' }).errors).toEqual([])
  })
  it('blocks legacy hosts, mixed packages, legacy Sidebar and the known context fault', () => {
    for (const change of [{ host: '0.1.2-rc.1' }, { core: { 'dsh-session': '0.1.2-rc.1' } }, { context: '0.36.0' }, { sidebar: '0.18.1' }, { node: '23.0.0' }]) {
      expect(assessCompatibility({ ...good, ...change }).errors.length).toBeGreaterThan(0)
    }
  })
  it('allows Sidebar-free base mode but requires an explicitly requested workbench provider', () => {
    expect(assessCompatibility({ ...good, sidebar: undefined })).toMatchObject({ errors: [], warnings: [], mode: 'base', verifiedBaseline: true })
    expect(assessCompatibility({ ...good, sidebar: undefined }).notes.join(' ')).toContain('No automatic Sidebar installation')
    expect(assessCompatibility({ ...good, sidebar: undefined, workbench: true }).errors.join(' ')).toContain('optional dsh-better-sidebar@0.24.1')
    expect(assessCompatibility({ ...good, workbench: true })).toMatchObject({ errors: [], mode: 'workbench' })
    // Optional cannot neutralize an already-installed provider breaking the host.
    expect(assessCompatibility({ ...good, sidebar: '0.17.1', workbench: false }).errors.join(' ')).toContain('settingsNamespace')
  })
  it('marks unknown versions as unverified, with actionable guidance', () => {
    for (const change of [{ host: '0.2.1' }, { context: '0.49.0' }, { sidebar: '0.24.2' }]) {
      expect(assessCompatibility({ ...good, ...change })).toMatchObject({ errors: [], verifiedBaseline: false })
    }
  })
})
