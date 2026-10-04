import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
describe('deployment compatibility metadata', () => {
  it('targets the calibrated 0.2.0-rc.2 baseline instead of claiming all future or legacy hosts', () => {
    // The retired 0.1.x client runtime must never come back as an implicit dependency.
    expect(manifest.peerDependencies['@deepseek-ai/dsh-client-runtime']).toBeUndefined()
    expect(manifest.devDependencies['@deepseek-ai/dsh-client-runtime']).toBeUndefined()
    for (const [name, range] of Object.entries(manifest.peerDependencies)) {
      if (name.startsWith('@deepseek-ai/dsh-')) expect(range).toBe('~0.2.0-rc.2')
    }
    expect(manifest.peerDependencies['@deepseek-ai/cordis']).toBe('^4.0.4')
    expect(manifest.peerDependencies['dsh-better-sidebar']).toBe('~0.24.1')
    expect(manifest.peerDependenciesMeta['dsh-better-sidebar']).toEqual({ optional: true })
    expect(manifest.dependencies['dsh-better-sidebar']).toBeUndefined()
    expect(manifest.dsh.client.inject).not.toContain('dsh-better-sidebar')
    expect(manifest.devDependencies['dsh-better-sidebar']).toBe('0.24.1')
    expect(manifest.devDependencies['@deepseek-ai/dsh-client-ui-conversation']).toBe('0.2.0-rc.2')
    expect(manifest.dsh.client.inject).not.toContain('@deepseek-ai/dsh-client-runtime')
    expect(manifest.dsh.client.inject).toContain('@deepseek-ai/dsh-api-session-controller')
    // The build must not declare a bare `external` request: every runtime external of this client
    // bundle is part of the shell's frozen platform table.
    expect(manifest.dsh.client.external).toBeUndefined()
    expect(manifest.engines.dsh).toBe('~0.2.0-rc.2')
  })
  it('has no legacy runtime escape hatch in the build or unit-test resolver', () => {
    for (const path of ['../tsdown.config.ts', '../vitest.config.ts']) {
      expect(readFileSync(new URL(path, import.meta.url), 'utf8')).not.toContain('@deepseek-ai/dsh-client-runtime/client')
    }
  })
})
