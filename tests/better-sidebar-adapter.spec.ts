import type { BetterSidebarService, OpenTabSeed, SessionScope, TabDescriptor } from 'dsh-better-sidebar/client/service'
import { describe, expect, it, vi } from 'vitest'
import {
  TENDER_WORKBENCH_TAB_ID,
  assertBetterSidebarContract,
  openTenderWorkbench,
  registerTenderWorkbenchTab,
} from '../src/client/better-sidebar-adapter.ts'

/**
 * The adapter is deliberately thin: it probes the documented 0.24 contract, registers one tab
 * descriptor, and opens it for an explicit Session. Placement and reveal belong to the service, so
 * nothing here writes sidebar state.
 */
function fakeService(options: { features?: readonly string[]; enabled?: boolean } = {}) {
  const descriptors: TabDescriptor[] = []
  const openTab = vi.fn<(seed: OpenTabSeed, scope?: SessionScope) => void>()
  const service = {
    registerTab(descriptor: TabDescriptor) {
      descriptors.push(descriptor)
      return () => { descriptors.splice(descriptors.indexOf(descriptor), 1) }
    },
    registerFileViewer: vi.fn(),
    registerFileIcon: vi.fn(),
    getTabs: () => descriptors,
    getFileViewers: () => [],
    getFileIcons: () => [],
    matchFileIcon: vi.fn(),
    matchFolderIcon: vi.fn(),
    fileIcon: vi.fn(),
    folderIcon: vi.fn(),
    getTab: (id: string) => descriptors.find(descriptor => descriptor.id === id),
    isTabEnabled: () => options.enabled ?? true,
    isViewerEnabled: () => true,
    matchFileViewer: vi.fn(),
    openTab,
    closeTab: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    version: '0.24.1',
    features: options.features ?? ['badge', 'tabLifecycle', 'updateTab', 'openFile', 'targetedOpen', 'stateSubscription', 'tabMeta', 'pluginSettings', 'urlTarget', 'settingSelect', 'fileIcons'],
    getSnapshot: () => ({ sessionId: undefined, state: undefined, prefs: {} }),
    subscribeState: vi.fn(() => () => {}),
    updateTab: vi.fn(),
    activateTab: vi.fn(),
    openFile: vi.fn(),
    setSurface: vi.fn(),
  } as unknown as BetterSidebarService
  return { service, descriptors, openTab }
}

describe('better sidebar adapter (0.24 contract)', () => {
  it('accepts the current public contract and rejects missing capabilities', () => {
    const { service } = fakeService()
    expect(() => assertBetterSidebarContract(service)).not.toThrow()

    const missingMethod = { ...service, openTab: undefined } as unknown as BetterSidebarService
    expect(() => assertBetterSidebarContract(missingMethod)).toThrow(/openTab/)

    const missingFeature = fakeService({ features: ['stateSubscription'] }).service
    expect(() => assertBetterSidebarContract(missingFeature)).toThrow(/targetedOpen/)
  })

  it('registers exactly one single-instance Session-scoped workbench tab', () => {
    const f = fakeService()
    const component = vi.fn(() => null)
    const stop = registerTenderWorkbenchTab(f.service, component, () => '招投标', size => size)

    expect(f.descriptors).toHaveLength(1)
    expect(f.descriptors[0]).toMatchObject({ id: TENDER_WORKBENCH_TAB_ID, order: 40, single: true })
    expect(f.descriptors[0]?.component).toBe(component)
    stop()
    expect(f.descriptors).toHaveLength(0)
  })

  it('opens the tab in the explicitly supplied Session and refuses a disabled type', () => {
    const enabled = fakeService()
    expect(openTenderWorkbench(enabled.service, { sessionId: 'session-one', cwd: 'C:\\work' })).toBe(true)
    expect(enabled.openTab).toHaveBeenCalledExactlyOnceWith(
      { type: TENDER_WORKBENCH_TAB_ID },
      { sessionId: 'session-one', cwd: 'C:\\work' },
    )

    const disabled = fakeService({ enabled: false })
    expect(openTenderWorkbench(disabled.service, { sessionId: 'session-one' })).toBe(false)
    expect(disabled.openTab).not.toHaveBeenCalled()
  })
})
