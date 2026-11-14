import { CSPProvider } from '@base-ui/react/csp-provider'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, use, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { WorkflowAction, WorkflowEditing } from '../editing'
import type { WorkflowEngine } from '../engine'
import type { RunLink } from '../graph/types'
import { safeUrl } from '../safeUrl'
import { useByValue, useMerged } from './byValue'
import { ContextMenuProvider } from './ContextMenu'
import { useLocalPersistedState } from './persistedState'
import { type UIStringOverrides, UIStringsProvider } from './strings'
import { Toaster } from './Toast'
import { TooltipProvider } from './Tooltip'

export {
  type ErrorPageKind,
  mergeStrings,
  type UIStringOverrides,
  type UIStrings,
  useStrings,
} from './strings'

export interface UINavigation {
  goTo: (to: string) => void
  /** Opens the source of a step that runs another workflow, named by its `uses`;
   * `sourceUrl` is a page the server resolved for it, when there is one. */
  openStepSource: (uses: string, sourceUrl?: string) => void
  openExternal: (href: string) => void
  /** Goes back one entry in the history, such as an error page's "Back". Bind it
   *  to the router's history; the browser's by default. */
  goBack: () => void
  /** Whether there is an entry of this app's to go back to; when there isn't, an
   *  error page offers the way home instead. Bind it to the router's own
   *  answer; by default, whether the tab's history holds more than this page. */
  canGoBack: () => boolean
}

export type WorkflowJsonRef =
  | { kind: 'marketplace'; slug: string; version: string }
  | { kind: 'workflow'; name: string }

export interface RunFileResult {
  data: string | undefined
  isLoading: boolean
  error: unknown
}

export type PersistedStateHook = <T>(
  key: string,
  defaultValue: T,
) => [T, Dispatch<SetStateAction<T>>]

/** The values a problem's message shows, by name, as a problem's `params` carries them. */
export type ProblemParams = Readonly<Record<string, string | number>>

/** A problem code's message in the reader's language, with its params; undefined when the host has
 *  none for the code. `type` is the problem's type URI: one that names an application, such as
 *  `/problems/workflow/undefined_input`, picks that application's message for the code over the
 *  host's own. */
export type ProblemMessage = (
  code: string,
  params?: ProblemParams,
  type?: string,
) => string | undefined

/** A problem that may carry a code: a run's warning, or one the workflow editor marks. */
export interface CodedProblem {
  /** Its text as the server wrote it, shown when the host has no message for its code. */
  message: string
  code?: string | null | undefined
  params?: ProblemParams | null | undefined
  /** Its type URI, which the host's message for its code is looked up by too. */
  type?: string | null | undefined
}

export interface UIData {
  /**
   * Host-bound hook resolving a file in a run's artifact tree (logs, scripts).
   * A null path skips fetching; refreshInterval polls while set. Must be a
   * stable function reference — components call it as a hook.
   */
  useRunFile: (
    slug: string,
    path: string | null,
    options?: { refreshInterval?: number },
  ) => RunFileResult
  resolveWorkflowJson?: (ref: WorkflowJsonRef) => Promise<unknown>
  /** The names of the reader's own saved inputs for a workflow, which a step can name too. */
  resolveSavedInputs?: (ref: WorkflowJsonRef) => Promise<string[]>
  /** The built-in actions a workflow step can use, for the editor's step form. */
  workflowActions?: Record<string, WorkflowAction>
  resolveSecretVariables?: () => Promise<string[]>
  /** Repository files, so the editor can read the workflow a step's repository `uses` names. */
  repoSuggestions?: {
    file: (repo: string, ref: string, path: string) => Promise<string>
  }
  /**
   * Provisions browser-access CORS rules on a storage. Absent, the storage
   * explorer hides its "add CORS rules" affordance.
   */
  provisionCorsRules?: (args: {
    csp: string
    type?: string | undefined
    username: string
    storageName: string
  }) => Promise<{ error?: string }>
  usePersistedState: PersistedStateHook
  /**
   * Host-bound hook returning a problem code's message in the reader's language, such as
   * `useCodeMessage` from `@parallelworks/problem/react`. A run's warnings and the editor's
   * problems that carry a `code` show it, given their `params` and `type`, and their own `message`
   * when it gives nothing. Absent, they show their `message`. Must be a stable function reference —
   * components call it as a hook.
   */
  useProblemMessage: () => ProblemMessage
}

import type { FieldComponent } from '../form/fieldRegistry'
import type { Breadcrumb } from './Breadcrumbs'

/** An internal navigation link, which hosts bind to their router's Link. Its
 *  `href` is a full in-app URL that may carry a search and a hash, such as
 *  `/runs/42?tab=logs#step-3`, and the host routes all of it client-side on a
 *  plain click, leaving modified and middle clicks to the browser. It passes
 *  every other prop, ref included, to its anchor, so menus and tooltips can
 *  attach to it. Components render it through `AppLink`, which sanitizes the
 *  href and keeps full page loads and other origins off the router. */
export type UILinkComponent = React.ComponentType<
  React.ComponentPropsWithRef<'a'> & { href: string }
>

const DefaultLink: UILinkComponent = ({ href, ...rest }) => <a href={safeUrl(href)} {...rest} />

/** The provider's link slot, with a plain anchor fallback. */
export function useLink(): UILinkComponent {
  return useContext(SlotsContext).link ?? DefaultLink
}

export interface UISlots {
  /** Internal navigation links; absent falls back to a plain anchor. */
  link?: UILinkComponent
  /**
   * Host-supplied form field components, merged over the form engine's core
   * registry by field type. Lazy components are supported — the registry
   * renders fields inside a Suspense boundary.
   */
  formFields?: Record<string, FieldComponent>
  /** Links and sessions block for a run's sidebar; absent hides the section. */
  runSessions?: (args: {
    runId: string
    runNumber: number
    runActive: boolean
    links?: Record<string, RunLink> | undefined
  }) => ReactNode
  /** Rich read-only YAML viewer; absent falls back to a plain <pre>. */
  yamlViewer?: (args: {
    value: string
    height: number
    width: number
    contentKey: string
  }) => ReactNode
  /** Icon for a subworkflow step; absent hides icon-bound affordances. */
  workflowIcon?: (args: {
    image?: string | undefined
    type?: string | undefined
    className?: string
  }) => ReactNode
  /** Icon URL for a storage type; absent falls back to a generic disk icon.
   * Scheme-dependent variants are the host's concern — bind with the host's
   * own theme state. */
  storageIconUrl?: (args: { type: string }) => string | undefined
  /**
   * The storage explorer's access-management drawer; absent hides the
   * affordance. `storage` and `groups` are the host's own objects passed back
   * through the explorer opaquely.
   */
  accessDrawer?: (args: {
    open: boolean
    setOpen: (open: boolean) => void
    storage: unknown
    groups?: unknown
  }) => ReactNode
  /** Pin affordance rendered after the page header's crumb trail; absent hides it. */
  breadcrumbPin?: (args: { crumbs: readonly Breadcrumb[] }) => ReactNode
  /** Control rendered at the start of the page header row, before the crumb
   * trail — the host's app-nav toggle. Absent hides it. */
  navToggle?: () => ReactNode
}

/** An engine, or a loader so the host can keep the engine out of its first-load bundle. */
export type WorkflowEngineSource = WorkflowEngine | (() => Promise<WorkflowEngine>)

interface UIProviderValue {
  navigation: UINavigation
  data: UIData
  slots: UISlots
  engine?: WorkflowEngineSource | undefined
}

const defaultUseRunFile = (): RunFileResult => ({
  data: undefined,
  isLoading: false,
  error: undefined,
})

const DEFAULTS: UIProviderValue = {
  navigation: {
    goTo: (to) => {
      const url = safeUrl(to)
      if (url) {
        window.location.assign(url)
      }
    },
    openStepSource: (_uses, sourceUrl) => {
      const url = safeUrl(sourceUrl)
      if (url) {
        window.open(url, '_blank')
      }
    },
    openExternal: (href) => {
      const url = safeUrl(href)
      if (url) {
        window.open(url, '_blank')
      }
    },
    goBack: () => window.history.back(),
    canGoBack: () => typeof window !== 'undefined' && window.history.length > 1,
  },
  data: {
    useRunFile: defaultUseRunFile,
    usePersistedState: useLocalPersistedState,
    useProblemMessage: useNoProblemMessage,
  },
  slots: {},
}

// One context per concern, so a change to one, such as the host's data hooks, re-renders only the
// components that read it rather than every string and link under the provider.
const NavigationContext = createContext<UINavigation>(DEFAULTS.navigation)
const DataContext = createContext<UIData>(DEFAULTS.data)
const SlotsContext = createContext<UISlots>(DEFAULTS.slots)
const EngineContext = createContext<WorkflowEngineSource | undefined>(undefined)
const LocaleContext = createContext<string | undefined>(undefined)

/** How avatars without a picture are colored. `name` gives each person a color from the theme's
 *  categorical palette, picked by name, and one initial for a one-word name. `kind` gives every
 *  person one tint and every agent another (and a square), with two initials for a one-word name,
 *  for an app that tells people and agents apart at a glance. */
export type AvatarColoring = 'name' | 'kind'

const AvatarColoringContext = createContext<AvatarColoring>('name')
const CharacterKeyShortcutsContext = createContext(true)

/** The host's locale for dates and times, such as `de-DE`. Undefined without one, which leaves
 *  each format's own default: the date library's for its times, the browser's for the rest. */
export function useLocale(): string | undefined {
  return useContext(LocaleContext)
}

/** How the host colors avatars, UIProvider's `avatarColoring`. */
export function useAvatarColoring(): AvatarColoring {
  return useContext(AvatarColoringContext)
}

/** Whether single-key shortcuts are on, UIProvider's `characterKeyShortcuts`. */
export function useCharacterKeyShortcuts(): boolean {
  return useContext(CharacterKeyShortcutsContext)
}

export function useNavigation(): UINavigation {
  return useContext(NavigationContext)
}

export function useWorkflowJsonResolver(): UIData['resolveWorkflowJson'] {
  return useContext(DataContext).resolveWorkflowJson
}

export function useRepoSuggestions(): UIData['repoSuggestions'] {
  return useContext(DataContext).repoSuggestions
}

export function useSavedInputsResolver(): UIData['resolveSavedInputs'] {
  return useContext(DataContext).resolveSavedInputs
}

const NO_ACTIONS: Record<string, WorkflowAction> = {}

export function useWorkflowActions(): Record<string, WorkflowAction> {
  return useContext(DataContext).workflowActions ?? NO_ACTIONS
}

export function useSecretVariablesResolver(): UIData['resolveSecretVariables'] {
  return useContext(DataContext).resolveSecretVariables
}

export function useSlots(): UISlots {
  return useContext(SlotsContext)
}

interface LoadedEngine {
  promise: Promise<WorkflowEngine>
  engine?: WorkflowEngine
}

const loadedEngines = new WeakMap<() => Promise<WorkflowEngine>, LoadedEngine>()

function loadEngine(load: () => Promise<WorkflowEngine>): LoadedEngine {
  let entry = loadedEngines.get(load)
  if (!entry) {
    const created: LoadedEngine = { promise: load() }
    created.promise.then((engine) => {
      created.engine = engine
    })
    loadedEngines.set(load, created)
    entry = created
  }
  return entry
}

function resolveEngine(source: WorkflowEngineSource): WorkflowEngine {
  if (typeof source !== 'function') {
    return source
  }
  const entry = loadEngine(source)
  return entry.engine ?? use(entry.promise)
}

/** The engine when one is provided and `enabled`; suspends while a loader resolves. */
export function useOptionalWorkflowEngine(enabled = true): WorkflowEngine | undefined {
  const source = useContext(EngineContext)
  if (!enabled || !source) {
    return undefined
  }
  return resolveEngine(source)
}

export function useWorkflowEngine(): WorkflowEngine {
  const source = useContext(EngineContext)
  if (!source) {
    throw new Error('Workflow forms and graphs need a UIProvider with an engine.')
  }
  return resolveEngine(source)
}

/** The engine once it has loaded, without suspending; renders again when a loader resolves. */
export function useLoadedWorkflowEngine(): WorkflowEngine | undefined {
  const source = useContext(EngineContext)
  const [, setLoaded] = useState(0)
  const entry = typeof source === 'function' ? loadEngine(source) : undefined
  const engine = typeof source === 'function' ? entry?.engine : source
  useEffect(() => {
    if (!entry || entry.engine) {
      return
    }
    let live = true
    entry.promise.then(() => {
      if (live) {
        setLoaded((n) => n + 1)
      }
    })
    return () => {
      live = false
    }
  }, [entry])
  return engine
}

/** The engine's workflow editing, which the visual editor can't work without. */
export function useWorkflowEditing(): WorkflowEditing {
  const { editing } = useWorkflowEngine()
  if (!editing) {
    throw new Error('The workflow editor needs a UIProvider engine with editing.')
  }
  return editing
}

/** Resolves the engine without suspending, for async callers such as editor completions. */
export function useWorkflowEngineLoader(): () => Promise<WorkflowEngine | undefined> {
  const source = useContext(EngineContext)
  return useCallback(async () => {
    if (!source) {
      return undefined
    }
    return typeof source === 'function' ? loadEngine(source).promise : source
  }, [source])
}

export function useProvisionCorsRules(): UIData['provisionCorsRules'] {
  return useContext(DataContext).provisionCorsRules
}

export function useRunFile(
  slug: string,
  path: string | null,
  options?: { refreshInterval?: number },
): RunFileResult {
  const { useRunFile: boundUseRunFile } = useContext(DataContext)
  return boundUseRunFile(slug, path, options)
}

const noProblemMessage: ProblemMessage = () => undefined

function useNoProblemMessage(): ProblemMessage {
  return noProblemMessage
}

/** A coded problem's text in the reader's language: the host's message for its code and type, or
 *  else its own `message`. */
export function useProblemText(): (problem: CodedProblem) => string {
  const { useProblemMessage: boundUseProblemMessage } = useContext(DataContext)
  const message = boundUseProblemMessage()
  return useCallback(
    (problem: CodedProblem) =>
      (problem.code
        ? message(problem.code, problem.params ?? undefined, problem.type ?? undefined)
        : undefined) ?? problem.message,
    [message],
  )
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const { usePersistedState: boundUsePersistedState } = useContext(DataContext)
  return boundUsePersistedState(key, defaultValue)
}

export interface UIProviderProps {
  /** Translations over the English defaults, at any depth. Define them outside a component, or
   *  memoize them: the provider compares them by value, but a function made each render differs. */
  strings?: UIStringOverrides | undefined
  /** How the package navigates; read at the moment it navigates, so a new one never re-renders. */
  navigation?: Partial<UINavigation> | undefined
  /** The host's data hooks and resolvers. `useRunFile`, `usePersistedState` and
   *  `useProblemMessage` are called as hooks, so each must stay the same function for the life of
   *  the app. */
  data?: Partial<UIData> | undefined
  /** Components the host renders inside the package's; a component made each render would
   *  remount everything it renders. */
  slots?: UISlots | undefined
  /** The engine, or a loader that resolves to it. A loader is called once, the first one
   *  passed, so it may be written inline. */
  engine?: WorkflowEngineSource | undefined
  /** The nonce the page's Content Security Policy allows inline scripts by,
   *  for a host that renders on the server: a few components emit a script
   *  that places them before hydration. The components render no inline
   *  `<style>`, so a policy without 'unsafe-inline' styles needs none. */
  nonce?: string | undefined
  /** The locale dates and times read in, such as `de-DE`, as a BCP 47 tag: relative times,
   *  exact times and the date picker. Pass the app's language, so they read as its own text
   *  does. Without one they follow the date library's default locale, or the browser's. */
  locale?: string | undefined
  /** How avatars without a picture are colored: by name (the default), or by kind, where people
   *  share one tint and agents another, set by `--avatar-person` and `--avatar-agent` (see
   *  `Avatar`). */
  avatarColoring?: AvatarColoring | undefined
  /** Whether a single key, such as F to filter or / to search a list, works from anywhere on the
   *  page (the default). Give people a setting that turns them off, as WCAG 2.1.4 asks, since a
   *  speech input user's words can press them. Shortcuts with a modifier, such as ⌘F, stay on. */
  characterKeyShortcuts?: boolean | undefined
  children: React.ReactNode
}

export function UIProvider({
  strings,
  navigation,
  data,
  slots,
  engine: engineProp,
  nonce,
  locale,
  avatarColoring = 'name',
  characterKeyShortcuts = true,
  children,
}: UIProviderProps) {
  // A loader is the first one passed: an inline arrow is a new function each render, and each
  // new one would load the engine again.
  const [firstLoader] = useState(() => (typeof engineProp === 'function' ? engineProp : undefined))
  const engine = typeof engineProp === 'function' ? (firstLoader ?? engineProp) : engineProp
  // Loading after mount keeps the engine off the first paint, and means the
  // first form or graph rarely has to suspend for it.
  useEffect(() => {
    if (typeof engine === 'function') {
      loadEngine(engine)
    }
  }, [engine])
  const mergedData = useMerged(() => ({ ...DEFAULTS.data, ...data }), data)
  const stableSlots = useByValue(slots ?? DEFAULTS.slots)
  // Each call reads the host's navigation as it is now, so the object consumers hold never changes.
  const navigationRef = useRef(navigation)
  navigationRef.current = navigation
  const [stableNavigation] = useState<UINavigation>(() => ({
    goTo: (to) => (navigationRef.current?.goTo ?? DEFAULTS.navigation.goTo)(to),
    openStepSource: (uses, sourceUrl) =>
      (navigationRef.current?.openStepSource ?? DEFAULTS.navigation.openStepSource)(
        uses,
        sourceUrl,
      ),
    openExternal: (href) =>
      (navigationRef.current?.openExternal ?? DEFAULTS.navigation.openExternal)(href),
    goBack: () => (navigationRef.current?.goBack ?? DEFAULTS.navigation.goBack)(),
    canGoBack: () => (navigationRef.current?.canGoBack ?? DEFAULTS.navigation.canGoBack)(),
  }))
  return (
    <UIStringsProvider strings={strings}>
      <NavigationContext value={stableNavigation}>
        <DataContext value={mergedData}>
          <SlotsContext value={stableSlots}>
            <EngineContext value={engine}>
              <LocaleContext value={locale}>
                <AvatarColoringContext value={avatarColoring}>
                  <CharacterKeyShortcutsContext value={characterKeyShortcuts}>
                    {/* Base UI hides a select's or scroll area's own scrollbar with an
                      inline <style>, which a same-origin style policy blocks and
                      reports. theme.css ships that rule instead. */}
                    <CSPProvider nonce={nonce} disableStyleElements>
                      <TooltipProvider>
                        <ContextMenuProvider>{children}</ContextMenuProvider>
                      </TooltipProvider>
                      <Toaster />
                    </CSPProvider>
                  </CharacterKeyShortcutsContext>
                </AvatarColoringContext>
              </LocaleContext>
            </EngineContext>
          </SlotsContext>
        </DataContext>
      </NavigationContext>
    </UIStringsProvider>
  )
}
