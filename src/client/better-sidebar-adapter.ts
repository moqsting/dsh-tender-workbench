import type { ReactNode } from 'react'
import type {
  BetterSidebarService,
  SessionScope,
  TabComponentProps,
} from 'dsh-better-sidebar/client/service'

/**
 * Better Sidebar adapter (dsh-better-sidebar 0.24.x).
 *
 * 0.24 owns tab placement itself: `openTab(seed, scope)` lands in the target Session's own
 * surface (native right Sidebar when its surface is installed, otherwise the bottom workbench,
 * which the service opens), so this plugin no longer needs a panel-reveal controller or any
 * write into the sidebar store. The adapter therefore shrinks to: probe the contract, register
 * the one workbench tab, and open it in an explicit Session.
 *
 * @module
 */

export const TENDER_WORKBENCH_TAB_ID = 'dsh-tender-workbench:agent' as const

/** Capabilities this plugin actually calls; every one is a documented public member. */
const REQUIRED_METHODS = ['registerTab', 'isTabEnabled', 'openTab', 'getSnapshot', 'subscribeState'] as const
const REQUIRED_FEATURES = ['targetedOpen', 'stateSubscription'] as const

export function assertBetterSidebarContract(service: BetterSidebarService): void {
  for (const method of REQUIRED_METHODS) {
    if (typeof service[method] !== 'function') {
      throw new Error(`dsh-tender-workbench requires the Better Sidebar ${method}() capability`)
    }
  }
  const features: readonly string[] = Array.isArray(service.features) ? service.features : []
  for (const feature of REQUIRED_FEATURES) {
    if (!features.includes(feature)) {
      throw new Error(`dsh-tender-workbench requires the Better Sidebar ${feature} capability`)
    }
  }
}

/** Register the single Session-scoped workbench tab through Better Sidebar's public service. */
export function registerTenderWorkbenchTab(
  service: BetterSidebarService,
  component: (props: TabComponentProps) => ReactNode,
  title: string | (() => string) = '招投标',
  icon?: ReactNode | ((size: number) => ReactNode),
): () => void {
  assertBetterSidebarContract(service)
  return service.registerTab({
    id: TENDER_WORKBENCH_TAB_ID,
    title,
    icon,
    order: 40,
    single: true,
    component,
  })
}

/**
 * Open or focus the workbench Tab in the explicitly supplied Session.
 *
 * Placement and reveal belong to the service (`openTab` + `targetedOpen`), so the returned flag
 * only reports whether the tab type is enabled for this user.
 */
export function openTenderWorkbench(service: BetterSidebarService, scope: SessionScope): boolean {
  assertBetterSidebarContract(service)
  if (!service.isTabEnabled(TENDER_WORKBENCH_TAB_ID)) return false
  service.openTab({ type: TENDER_WORKBENCH_TAB_ID }, scope)
  return true
}
