import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Read-only preflight for one installed DSH host + Profile.
 *
 * The calibrated baseline is DSH 0.2.0-rc.2 with optional Better Sidebar 0.24.1. Legacy 0.1.x hosts
 * are refused (the client surfaces this plugin uses no longer exist), unknown versions only warn.
 */
export const VERIFIED_HOST_VERSION = '0.2.0-rc.2'
export const VERIFIED_SIDEBAR_VERSION = '0.24.1'
export const VERIFIED_CONTEXT_VERSION = '0.48.0'

/** Host generations whose removed client/runtime surfaces cannot serve this build. */
const LEGACY_HOST_VERSIONS = new Set(['0.1.1-rc.2', '0.1.2-rc.1'])
/** Better Sidebar releases built against the legacy `settingsNamespace` client API. */
const LEGACY_SIDEBAR_VERSIONS = new Set(['0.17.1', '0.18.1'])

export function assessCompatibility({ host, core = {}, sidebar, context, node = process.versions.node, workbench = false }) {
  const errors = [], warnings = [], notes = []
  const [major, minor] = node.split('.').map(Number)
  if (!(major >= 24 || major === 22 && minor >= 19)) errors.push('Node must be 22.19+ (22.x) or 24+.')
  const legacy = value => LEGACY_HOST_VERSIONS.has(value)
  if (!host) errors.push('Cannot verify the actual full DSH installation. Supply --host-root.')
  else if (legacy(host)) errors.push(`Unsupported legacy DSH ${host}. Back up the complete Profile, then explicitly upgrade the full host: npm install -g @deepseek-ai/dsh@${VERIFIED_HOST_VERSION}`)
  else if (host !== VERIFIED_HOST_VERSION) warnings.push('Unknown DSH combination: not verified; do not treat this check as compatibility acceptance.')
  for (const [name, version] of Object.entries(core)) {
    if (!version) errors.push('Missing host package: ' + name)
    else if (legacy(version)) errors.push('Mixed/legacy host package: ' + name + '@' + version + '. Upgrade the full DSH distribution, not one core package.')
    else if (version !== VERIFIED_HOST_VERSION) warnings.push('Unverified host package: ' + name + '@' + version)
  }
  if (!sidebar) {
    const guidance = `Better Sidebar absent: base conversation, prompt builder and Host tools remain available; visual workbench requires optional dsh-better-sidebar@${VERIFIED_SIDEBAR_VERSION} and a full profile restart. No automatic Sidebar installation.`
    if (workbench) errors.push(guidance)
    else notes.push(guidance)
  }
  else if (sidebar !== VERIFIED_SIDEBAR_VERSION) {
    if (LEGACY_SIDEBAR_VERSIONS.has(sidebar)) errors.push(`Legacy Better Sidebar ${sidebar} calls the removed settingsNamespace client API. Back up the full profile, then: dsh plugin --profile web add dsh-better-sidebar@${VERIFIED_SIDEBAR_VERSION}`)
    else warnings.push('Better Sidebar combination not verified: ' + sidebar)
  }
  if (context === '0.36.0') errors.push(`Installed dsh-context@0.36.0 uses removed settingsNamespace. Back up configuration, then explicitly update it: dsh plugin --profile web add dsh-context@${VERIFIED_CONTEXT_VERSION}`)
  else if (context && context !== VERIFIED_CONTEXT_VERSION) warnings.push('Installed context version not verified: ' + context)
  if (workbench && sidebar) notes.push('Version preflight only: runtime also probes targetedOpen and an enabled Tab before opening the workbench.')
  return { errors, warnings, notes, mode: workbench ? 'workbench' : 'base', verifiedBaseline: errors.length === 0 && warnings.length === 0 }
}

export function inspectInstallation(hostRoot, profileRoot) {
  const version = path => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).version : undefined
  const hostManifest = JSON.parse(readFileSync(join(hostRoot, 'package.json'), 'utf8'))
  if (hostManifest.name !== '@deepseek-ai/dsh') throw Error('--host-root must be the actual full @deepseek-ai/dsh package')
  const names = ['dsh-session', 'dsh-session-projection', 'dsh-api-session-controller', 'dsh-client-ui-conversation']
  const core = Object.fromEntries(names.map(name => {
    const relative = join('node_modules', '@deepseek-ai', name, 'package.json')
    // Profile-local copies override host copies and must not silently evade checks.
    return [name, version(profileRoot && existsSync(join(profileRoot, relative)) ? join(profileRoot, relative) : join(hostRoot, relative))]
  }))
  return { host: version(join(hostRoot, 'package.json')), core,
    sidebar: profileRoot ? version(join(profileRoot, 'node_modules/dsh-better-sidebar/package.json')) : undefined,
    context: profileRoot ? version(join(profileRoot, 'node_modules/dsh-context/package.json')) : undefined }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), at = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
  const hostRoot = at('--host-root'), profileRoot = at('--profile-root')
  if (!hostRoot) { console.error('Read-only preflight: node scripts/check-host-compatibility.mjs --host-root /path/to/@deepseek-ai/dsh [--profile-root /path/to/profile] [--workbench]'); process.exitCode = 2 }
  else {
    try {
      const inventory = inspectInstallation(resolve(hostRoot), profileRoot && resolve(profileRoot))
      const result = assessCompatibility({ ...inventory, workbench: args.includes('--workbench') })
      console.log(JSON.stringify({ inventory, ...result }, null, 2))
      process.exitCode = result.errors.length ? 1 : 0
    } catch (error) { console.error('Cannot read package manifests: ' + error.message); process.exitCode = 2 }
  }
}
