import { useSyncExternalStore } from 'react'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { IconGoalOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { BetterSidebarService, TabComponentProps } from 'dsh-better-sidebar/client/service'
import type { TenderClientContext } from './client-context.ts'
import { readDisplayedSession } from './current-session.ts'
import type { TenderTranslate } from './fields/field-props.ts'
import {
  TenderHeroTitleBridge,
  TenderSessionHeaderEntry,
  TenderSidebarEntry,
  type TenderHeaderEntryInjected,
  type TenderSidebarEntryInjected,
  type TenderHeroInjected,
} from './TenderEntry.tsx'
import { TenderPromptEntry, type TenderPromptInjected } from './TenderPrompt.tsx'
import { initialTenderPrompt, type TenderPromptMemory } from './tender-prompt.ts'
import { installTenderWorkflowReveal } from './submission-reveal.ts'
import { initializeTenderHostDraft } from './initial-draft-host.ts'
import {
  assertBetterSidebarContract,
  openTenderWorkbench,
  registerTenderWorkbenchTab,
} from './better-sidebar-adapter.ts'
import { sendSessionTenderWorkbenchIntent } from './intents/send-session-intent.ts'
import type { TenderSkillCatalogConnection } from './skill-catalog.ts'
import { en, zh, type TenderKey } from './locales.ts'
import { createTenderProjectionPort } from './tender-projection-port.ts'
import { tenderSearchDefinition } from './tender-search-definition.ts'
import {
  TenderSessionEntryError,
  createTenderEntrySession,
} from './tender-session-entry.ts'
import {
  TenderWorkbenchTab,
  type TenderWorkbenchTabProps,
} from './workbench/TenderWorkbench.tsx'
import {
  createTenderWorkbenchNavigationController,
  type WorkbenchDestination,
} from './workbench/navigation-controller.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Tender workbench, entries, filters, and result copy. */
    tenderFilter: TenderKey
  }
}

const NS = 'tenderFilter'

/** Core conversation stays available while the optional workbench provider is absent. */
export const inject = [
  'slots', 'sessions', 'workspaces', 'conversation', 'uiConversation', 'locale', 'remote.skills', 'uiWorkspace',
]

function RegisteredTenderWorkbenchTab({
  locale,
  sendIntent,
  t,
  projectionPort,
  navigation,
  openOriginSession,
  ...props
}: TabComponentProps & {
  readonly locale: Pick<TenderClientContext['locale'], 'subscribe' | 'getSnapshot'>
  readonly sendIntent: TenderWorkbenchTabProps['sendIntent']
  readonly t: TenderTranslate
  readonly projectionPort: ReturnType<typeof createTenderProjectionPort>
  readonly navigation: ReturnType<typeof createTenderWorkbenchNavigationController>
  readonly openOriginSession: NonNullable<TenderWorkbenchTabProps['openOriginSession']>
}) {
  useSyncExternalStore(
    listener => locale.subscribe(listener),
    () => locale.getSnapshot(),
    () => locale.getSnapshot(),
  )
  return (
    <TenderWorkbenchTab
      {...props}
      projectionPort={projectionPort}
      navigation={navigation}
      sendIntent={sendIntent}
      openOriginSession={openOriginSession}
      t={t}
    />
  )
}

/** Register the dedicated Session entry, workbench Tab, Hero brand, and Header recovery action. */
export function apply(ctx: TenderClientContext): void {
  ctx.effect(() => ctx.uiConversation.events.register(tenderSearchDefinition), 'dsh-tender-workbench: search events')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-tender-workbench: dictionaries')

  const sessions = ctx.get('sessions') as ISessions | undefined
  const locale = ctx.get('locale') as TenderClientContext['locale'] | undefined
  const skills = ctx.get('remote.skills') as TenderSkillCatalogConnection['skills'] | undefined
  if (sessions === undefined || locale === undefined || skills === undefined) {
    throw new Error('dsh-tender-workbench requires the public sessions, locale, and remote.skills services')
  }
  const connection: TenderSkillCatalogConnection = { skills }
  const t = locale.bind(NS)
  // DSH 0.2.0-rc.2 owns Session navigation in the Workspace UI domain; the plugin only asks it.
  let openSessionInUi: ((target: SessionId) => void) | undefined
  ctx.inject(['uiWorkspace'], scope => {
    const uiWorkspace = scope.uiWorkspace
    openSessionInUi = target => { uiWorkspace.openSession(target) }
    scope.effect(() => () => {
      if (openSessionInUi !== undefined) openSessionInUi = undefined
    }, 'dsh-tender-workbench: workspace navigation lifetime')
  })
  let sidebar: BetterSidebarService | undefined
  const navigation = createTenderWorkbenchNavigationController()
  const projectionPort = createTenderProjectionPort(sessions)
  // Scoped to this Client lifetime, not shared between plugin sessions or clients.
  const promptMemory = new Map<SessionId, TenderPromptMemory>()
  let active = true
  let stopInitialDraft = () => {}
  let entryGeneration = 0
  const sendIntent: TenderWorkbenchTabProps['sendIntent'] = (sessionId, intent) => (
    sendSessionTenderWorkbenchIntent(sessions, connection, sessionId, intent)
  )
  const openWorkbench = (sessionId: SessionId, phase?: WorkbenchDestination): boolean => {
    if (!active || sidebar === undefined) return false
    const summary = sessions.list.getSnapshot().byId[sessionId]
    const opened = openTenderWorkbench(sidebar, {
      sessionId: String(sessionId),
      ...(summary?.cwd === undefined ? {} : { cwd: summary.cwd }),
    })
    if (opened && phase !== undefined) navigation.request(sessionId, phase)
    return opened
  }
  const startTenderSession = async (): Promise<void> => {
    const generation = ++entryGeneration
    const previousSession = readDisplayedSession(sessions)
    stopInitialDraft()
    try {
      const sessionId = await createTenderEntrySession(sessions, ctx.workspaces)
      if (!active || generation !== entryGeneration || readDisplayedSession(sessions) !== previousSession) return
      stopInitialDraft()
      openSessionInUi?.(sessionId)
      stopInitialDraft = initializeTenderHostDraft(ctx, sessionId)
      // The menu enters the landing page only. Create/reveal the workbench
      // on an explicit shortcut (or header recovery) action, never on entry.
    } catch (error: unknown) {
      if (error instanceof TenderSessionEntryError) {
        const key = error.code === 'workspace-unavailable'
          ? 'sidebar.workspaceRequired'
          : 'sidebar.createFailed'
        throw new Error(t(key), { cause: error })
      }
      throw new Error(t('sidebar.createFailed'), { cause: error })
    }
  }

  // A business task that actually starts opens its own workbench: the Host projection is the
  // public signal, so Session internals stay untouched.
  ctx.effect(() => installTenderWorkflowReveal(sessions, sessionId => {
    openWorkbench(sessionId, 'opportunity')
  }), 'dsh-tender-workbench: accepted submission reveal')

  // A dependency-scoped child follows provider arrival/removal, without taking
  // down the conversation entry, prompts, or supported Host tools.
  ctx.inject(['betterSidebar'], providerContext => {
    const service = providerContext.betterSidebar
    try { assertBetterSidebarContract(service) } catch { return }
    sidebar = service
    providerContext.effect(() => () => {
      if (sidebar === service) sidebar = undefined
    }, 'dsh-tender-workbench: provider subscription lifetime')
    providerContext.effect(() => registerTenderWorkbenchTab(
      service,
      props => (
        <RegisteredTenderWorkbenchTab
          {...props}
          locale={locale}
          sendIntent={sendIntent}
          t={t}
          projectionPort={projectionPort}
          navigation={navigation}
          openOriginSession={async (origin, from) => {
            if (!active || readDisplayedSession(sessions) !== from) throw new Error('Session changed')
            await sessions.refresh()
            if (!active || readDisplayedSession(sessions) !== from) throw new Error('Session changed')
            if (openSessionInUi === undefined) throw new Error('Session navigation is unavailable')
            openSessionInUi(origin)
          }}
        />
      ),
      () => t('sidebar.label'),
      size => <IconGoalOutlineMedium size={size} />,
    ), 'dsh-tender-workbench: Better Sidebar tab')
  })

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-tender-workbench:hero-title',
    order: 120,
    locale: NS,
    inject: (sessionId): TenderHeroInjected => ({ openPhase: phase => openWorkbench(sessionId, phase) }),
  }, TenderHeroTitleBridge))

  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'dsh-tender-workbench:prompt',
    order: 120,
    locale: NS,
    inject: (sessionId): TenderPromptInjected => {
      let memory = promptMemory.get(sessionId)
      if (!memory) { memory = { draft: initialTenderPrompt() }; promptMemory.set(sessionId, memory) }
      const input = () => {
        const scoped = sessions.scope(sessionId)
        if (!scoped) throw new Error('Tender Session unavailable')
        return ctx.conversation.input.for(scoped)
      }
      return { memory, draftPort: {
        read: () => input().state.getSnapshot().draft,
        write: value => { input().setDraft(value) },
      } }
    },
  }, TenderPromptEntry))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-tender-workbench:sidebar',
    order: 40,
    locale: NS,
    inject: (): TenderSidebarEntryInjected => ({ startTenderSession }),
  }, TenderSidebarEntry))

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'dsh-tender-workbench:reopen',
    order: 100,
    locale: NS,
    inject: (sessionId): TenderHeaderEntryInjected => ({
      openWorkbench: () => openWorkbench(sessionId),
    }),
  }, TenderSessionHeaderEntry))

  ctx.effect(() => () => {
    active = false
    stopInitialDraft()
    navigation.dispose()
    promptMemory.clear()
  }, 'dsh-tender-workbench: Session entry lifetime')
}
