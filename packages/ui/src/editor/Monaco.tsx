import cx from 'classnames'
import yaml from 'js-yaml'
import { lintWorkflow } from '@parallelworks/workflow-parser'
import * as monaco from 'monaco-editor'
import { configureMonacoYaml, type MonacoYaml } from 'monaco-yaml'
import { holdListeners, modelFor } from './editorModel'
import {
  LINT_OWNER,
  type LintSources,
  lintContext,
  useLintReady,
  useLintSources,
} from './lintContext'
import { registerRevealer } from './reveal'
import {
  INPUT_YAML_PATH,
  SETTINGS_YAML_PATH,
  JOB_YAML_PATH,
  type JsonSchema,
  STEP_YAML_PATH,
  settingsSchemas,
} from './settingsYaml'
import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  useWorkflowEngineLoader,
  useRepoSuggestions,
  useWorkflowJsonResolver,
  type GitlabProject,
  type RepoEntry,
  type RepoOwner,
  type RepoRef,
  type RepoSummary,
  type UIData,
  type WorkflowJsonRef,
} from '../components/Provider'
import type { WorkflowEngine } from '../engine'
import {
  fileValueKey,
  fileValueSuggestions,
  hostCompletion,
  projectInsert,
  projectSearchKey,
  completionInsert,
  refTrigger,
  splitAtRef,
  specialKeysInWithBlock,
  specialKeysNearUses,
  stepHostAbove,
} from './usesGitlab'
import { setupMonacoWorkers } from './workers'
import { defineEditorThemes, getThemeName } from './themes'
import { useCssIsDark } from '../components/useCssIsDark'

setupMonacoWorkers()

export interface EditorMarketplaceItem {
  readonly slug?: string
  readonly name?: string | null
  readonly description?: string | null
  readonly type?: string | null
  readonly subtype?: string | null
  readonly versions?: readonly string[] | null
}

export interface EditorWorkflowItem {
  readonly name?: string
  readonly displayName?: string | null
  readonly description?: string | null
  readonly type?: string | null
}

type MarketplaceItem = EditorMarketplaceItem
type WorkflowItem = EditorWorkflowItem

/** What a `uses:` completion offers: the marketplace's workflows and the user's own. */
export interface UsesCompletions {
  marketplaceItems: EditorMarketplaceItem[]
  workflows: EditorWorkflowItem[]
}

// The completion providers are global singletons, so the host-bound resolver
// is published here by whichever editor rendered last.
let activeWorkflowJsonResolver:
  | ((ref: WorkflowJsonRef) => Promise<unknown>)
  | undefined = import.meta.hot?.data.workflowJsonResolver

// Repository completions go through the platform: the credential lives there,
// so asking a provider directly from here sees only public repositories.
let activeRepoSuggestions: UIData['repoSuggestions'] = import.meta.hot?.data
  .repoSuggestions

// A completion provider re-runs on every keystroke and the with: provider triggers
// on space, so one line being typed asks the same question dozens of times.
const suggestionCache = new Map<
  string,
  { at: number; value: Promise<unknown> }
>()
const CACHE_MS = 30_000
// Owners and their repositories change far more slowly than refs or a file tree, and
// they are what every keystroke of the first two segments asks for.
const OWNER_CACHE_MS = 5 * 60_000
// A $host block that has no line to sit above rides along in the completion's own text,
// where $0 is the only way to leave the cursor on the uses: line rather than after it.
const asSnippet =
  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet |
  monaco.languages.CompletionItemInsertTextRule.KeepWhitespace
// What the platform caps a project search at; hitting it means the answer was truncated.
const MAX_PROJECT_SUGGESTIONS = 200

async function cached<T>(
  key: string,
  fallback: T,
  load: () => Promise<T>,
  ttl = CACHE_MS
): Promise<T> {
  if (!activeRepoSuggestions) {
    return fallback
  }
  const hit = suggestionCache.get(key)
  if (hit && Date.now() - hit.at < ttl) {
    try {
      return (await hit.value) as T
    } catch {
      return fallback
    }
  }
  if (suggestionCache.size > 100) {
    suggestionCache.clear()
  }
  const value = load()
  suggestionCache.set(key, { at: Date.now(), value })
  try {
    return await value
  } catch {
    suggestionCache.delete(key)
    return fallback
  }
}

/** Refs of a repository, or [] when the host bound nothing or the call fails. */
async function repoRefs(repo: string): Promise<RepoRef[]> {
  return cached(`refs\u0000${repo}`, [], () =>
    activeRepoSuggestions!.refs(repo)
  )
}

/** Repositories under an owner, or every one the account can reach when the owner is
 * empty. [] when the host bound nothing. */
async function repoOwnerRepos(owner: string): Promise<RepoSummary[]> {
  return cached(
    `repos\u0000${owner}`,
    [],
    () => activeRepoSuggestions!.repos(owner),
    OWNER_CACHE_MS
  )
}

/** Owners a reference can name: accounts and organizations, or GitLab groups. */
async function repoOwners(
  provider: 'github' | 'gitlab',
  search: string,
  host?: string
): Promise<RepoOwner[]> {
  return cached(
    `owners\u0000${provider}\u0000${host ?? ''}\u0000${search}`,
    [],
    () => activeRepoSuggestions!.owners(provider, search, host),
    OWNER_CACHE_MS
  )
}

/** Projects matching what is typed, fetched once per group rather than once per
 * keystroke. The platform caps its answer, so a group that fills the cap is re-asked
 * with the full path instead of filtering an already-truncated list. */
async function matchingProjects(
  typed: string,
  host?: string
): Promise<GitlabProject[]> {
  const key = projectSearchKey(typed)
  const byGroup = await gitlabProjects(key, host)
  const wanted = typed.toLowerCase()
  const narrowed = byGroup.filter(project =>
    project.path.toLowerCase().includes(wanted)
  )
  if (key !== typed && byGroup.length >= MAX_PROJECT_SUGGESTIONS) {
    return gitlabProjects(typed, host)
  }
  return narrowed
}

/** GitLab projects matching a partial path, across every connected server. */
async function gitlabProjects(
  search: string,
  host?: string
): Promise<GitlabProject[]> {
  return cached(
    `gitlab\u0000${host ?? ''}\u0000${search}`,
    [],
    () => activeRepoSuggestions!.gitlabProjects(search, host),
    OWNER_CACHE_MS
  )
}

/** One file's contents, or '' on the same terms. */
async function repoFile(
  repo: string,
  ref: string,
  path: string
): Promise<string> {
  return cached(`file\u0000${repo}\u0000${ref}\u0000${path}`, '', () =>
    activeRepoSuggestions!.file(repo, ref, path)
  )
}

/** Tree entries of a repository, or [] on the same terms. */
async function repoFiles(
  repo: string,
  ref: string,
  path: string
): Promise<RepoEntry[]> {
  return cached(`files\u0000${repo}\u0000${ref}\u0000${path}`, [], () =>
    activeRepoSuggestions!.files(repo, ref, path)
  )
}

// monaco-yaml's worker manager still calls editor.createWebWorker with the
// pre-0.53 moduleId/label contract, which monaco-editor 0.53+ no longer
// resolves to a worker (it requires an explicit `worker` option). Route
// old-style calls through the top-level monaco.createWebWorker bridge, which
// resolves the worker via MonacoEnvironment.getWorker and performs the new
// postMessage handshake. https://github.com/remcohaszing/monaco-yaml/issues/272
const monacoWithWorkerBridge: typeof monaco = {
  ...monaco,
  editor: {
    ...monaco.editor,
    createWebWorker: <T extends object>(
      opts: monaco.editor.IInternalWebWorkerOptions | monaco.IWebWorkerOptions
    ) =>
      'worker' in opts
        ? monaco.editor.createWebWorker<T>(opts)
        : monaco.createWebWorker<T>(opts),
  },
}

// Registered once on the global `monaco` singleton rather than per editor: a per-editor
// lifecycle let navigation tear the YAML service down, killing suggestions until reload.
let yamlService: MonacoYaml | undefined
function ensureMonacoYamlConfigured() {
  if (yamlService) {
    return
  }
  const workflowSchema = {
    fileMatch: ['file:///workflow.yaml'],
    uri: `${window.location.origin}/workflow.schema.json`,
  }
  const yaml = configureMonacoYaml(monacoWithWorkerBridge, {
    enableSchemaRequest: true,
    completion: true,
    validate: true,
    hover: true,
    format: { enable: true },
    schemas: [workflowSchema],
  })
  yamlService = yaml
  // biome-ignore lint/style/noRestrictedGlobals: The workflow schema is a static file outside the product API.
  fetch(workflowSchema.uri)
    .then(response => response.json() as Promise<JsonSchema>)
    .then(schema => {
      const { job, step, input, settings } = settingsSchemas(schema)
      // Own URIs: the YAML service reads a #fragment as an anchor and stops validating,
      // and ignores an inline schema whose URI has a query.
      return yaml.update({
        schemas: [
          workflowSchema,
          {
            fileMatch: [JOB_YAML_PATH],
            uri: `${window.location.origin}/workflow-job.schema.json`,
            schema: job,
          },
          {
            fileMatch: [STEP_YAML_PATH],
            uri: `${window.location.origin}/workflow-step.schema.json`,
            schema: step,
          },
          {
            fileMatch: [INPUT_YAML_PATH],
            uri: `${window.location.origin}/workflow-input.schema.json`,
            schema: input,
          },
          {
            fileMatch: [SETTINGS_YAML_PATH],
            uri: `${window.location.origin}/workflow-settings.schema.json`,
            schema: settings,
          },
        ],
      })
    })
    // Without the schema the job and step editors still edit, just unchecked.
    .catch(() => {})
}

/** An editor holding one job or step of a workflow, whose inputs live outside its text. */
export interface NestedWorkflowText {
  /** The workflow's inputs, so a new group is named clear of them. */
  inputs: () => Record<string, unknown>
  /** Adds the group of inputs a `with:` completion's expressions read. */
  addInputs: (name: string, definition: Record<string, unknown>) => void
}

type WorkflowCompletionContext = {
  marketplaceItems: MarketplaceItem[]
  workflows: WorkflowItem[]
  nested?: { current: NestedWorkflowText | undefined }
}

const ADD_NESTED_INPUTS = 'activate.addNestedInputs'

// Keyed by model URI so the one global provider serves each editor its own data.
const workflowCompletionContexts: Map<string, WorkflowCompletionContext> =
  import.meta.hot?.data.completionContexts ?? new Map()
const registeredCompletionProviders: monaco.IDisposable[] = []
let workflowCompletionProvidersRegistered = false

// A hot update runs this module again with nothing registered, and a second YAML service beside this
// run's doubles or stalls every suggestion. Mounted editors don't publish again, so the next run keeps theirs.
import.meta.hot?.dispose(data => {
  yamlService?.dispose()
  for (const provider of registeredCompletionProviders) {
    provider.dispose()
  }
  data.workflowJsonResolver = activeWorkflowJsonResolver
  data.repoSuggestions = activeRepoSuggestions
  data.completionContexts = workflowCompletionContexts
})

export type ISchemaError = monaco.editor.IMarker

const isWorkflowInputs = (value: unknown): value is WorkflowInputs =>
  typeof value === 'object' && value !== null

function readExecuteInputs(doc: unknown): WorkflowInputs {
  if (!isWorkflowInputs(doc)) {
    return {}
  }
  const on = doc['on']
  if (!isWorkflowInputs(on)) {
    return {}
  }
  const execute = on['execute']
  if (!isWorkflowInputs(execute)) {
    return {}
  }
  const inputs = execute['inputs']
  return isWorkflowInputs(inputs) ? inputs : {}
}

function editorText(value: string): string {
  return value.replace(/\r/g, '')
}

const noop = () => {}

// yaml-language-server's code for a schema it couldn't load, which says nothing about the text.
const SCHEMA_UNREADABLE = '768'

/** A problem to mark on one line of the editor. */
export interface EditorMarker {
  line: number
  message: string
}

function lintMarker(
  model: monaco.editor.ITextModel,
  { line, message }: EditorMarker
): monaco.editor.IMarkerData {
  const at = Math.min(Math.max(line || 1, 1), model.getLineCount())
  return {
    severity: monaco.MarkerSeverity.Error,
    message,
    startLineNumber: at,
    startColumn: model.getLineFirstNonWhitespaceColumn(at) || 1,
    endLineNumber: at,
    endColumn: model.getLineMaxColumn(at),
  }
}

// Setting markers changes decorations, which runs the check again; comparing stops the loop.
function sameMarkers(
  a: readonly { message: string; startLineNumber: number }[],
  b: readonly { message: string; startLineNumber: number }[]
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (marker, i) =>
        marker.message === b[i]?.message &&
        marker.startLineNumber === b[i]?.startLineNumber
    )
  )
}

export interface IEditorProps
  extends monaco.editor.IStandaloneEditorConstructionOptions {
  className?: string
  disabled?: boolean | undefined
  onChange?: (value: string) => void
  onValidate?: (errors: ISchemaError[]) => void
  width?: string | number
  height?: string | number
  path?: 'file:///workflow.yaml' | string
  marketplaceItems?: MarketplaceItem[]
  workflows?: WorkflowItem[]
  /** Apply outside `value` changes as undoable edits instead of resetting the undo history. */
  preserveUndo?: boolean
  /** Checks a whole workflow for what the schema can't, such as needs read but never listed. */
  lint?: boolean
  /** Problems found elsewhere to mark in the text, such as a job's in the workflow around it. */
  markers?: EditorMarker[]
  /** Set when the text is one job or step, for completions that touch the rest of the workflow. */
  nested?: NestedWorkflowText
}

export default function MonacoEditor({
  className,
  disabled,
  onChange = noop,
  onValidate = noop,
  width = '100%',
  height = '100%',
  // `path` is for multi-model editors, but we also use it to determine
  // if we should use the workflow schema or not.
  path = 'file:///default',
  marketplaceItems = [],
  workflows = [],
  preserveUndo = false,
  lint = false,
  markers,
  nested,
  ...options
}: IEditorProps) {
  const loadWorkflowEngine = useWorkflowEngineLoader()
  const isDark = useCssIsDark()
  const readOnly = disabled || options.readOnly
  const resolveWorkflowJson = useWorkflowJsonResolver()
  const repoSuggestions = useRepoSuggestions()
  const monacoRef = useRef<ReturnType<typeof monaco.editor.create>>(null)
  const isSyncingValueRef = useRef(false)
  const lintSources = useLintSources()
  const lintSourcesRef = useRef<LintSources>(lintSources)
  lintSourcesRef.current = lintSources
  const runLintRef = useRef<(() => void) | null>(null)
  const unregisterRevealRef = useRef<(() => void) | null>(null)
  const listenersRef = useRef<monaco.IDisposable[]>([])
  const nestedRef = useRef(nested)
  nestedRef.current = nested
  const isNested = nested !== undefined

  // The linter runs in the wasm, which loads on demand; the text is checked again once it has.
  const lintLoaded = useLintReady(lint)
  useEffect(() => {
    if (lint && lintLoaded) {
      runLintRef.current?.()
    }
  }, [lint, lintLoaded])

  useEffect(() => {
    const model = monacoRef.current?.getModel()
    if (model && markers) {
      monaco.editor.setModelMarkers(
        model,
        LINT_OWNER,
        markers.map(marker => lintMarker(model, marker))
      )
    }
  }, [markers])

  useEffect(() => {
    activeWorkflowJsonResolver = resolveWorkflowJson
  }, [resolveWorkflowJson])

  // Not unbound on unmount: the providers are global, and a second editor closing
  // would otherwise take the completions of the one still open with it.
  useEffect(() => {
    activeRepoSuggestions = repoSuggestions
  }, [repoSuggestions])

  // Update theme when the scheme or disabled state changes
  useEffect(() => {
    if (!monacoRef.current) {
      return
    }
    defineEditorThemes(monaco.editor)
    monaco.editor.setTheme(getThemeName(isDark, disabled))
    monacoRef.current.updateOptions(readOnly === undefined ? {} : { readOnly })
  }, [disabled, isDark, readOnly])

  // Reconcile before paint so an older passive effect cannot overwrite a new edit.
  useLayoutEffect(() => {
    const model = monacoRef.current?.getModel()
    if (
      !model ||
      options.value === undefined ||
      editorText(model.getValue()) === editorText(options.value)
    ) {
      return
    }
    isSyncingValueRef.current = true
    try {
      if (preserveUndo) {
        const editor = monacoRef.current
        editor?.pushUndoStop()
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: options.value }],
          () => null
        )
        editor?.pushUndoStop()
      } else {
        model.setValue(options.value)
      }
    } finally {
      isSyncingValueRef.current = false
    }
  }, [options.value, preserveUndo])

  // Dispose only the editor on unmount; the YAML service and completion providers
  // are global and outlive every editor.
  useEffect(() => {
    return () => {
      unregisterRevealRef.current?.()
      for (const listener of listenersRef.current) {
        listener.dispose()
      }
      monacoRef.current?.dispose()
      monacoRef.current = null
    }
  }, [])

  // Publish this editor's data for the global uses:/with: provider, keyed by URI.
  useEffect(() => {
    const uri = monaco.Uri.parse(path).toString()
    if (marketplaceItems.length > 0 || workflows.length > 0 || isNested) {
      workflowCompletionContexts.set(uri, {
        marketplaceItems,
        workflows,
        ...(isNested ? { nested: nestedRef } : {}),
      })
    } else {
      workflowCompletionContexts.delete(uri)
    }
    return () => {
      workflowCompletionContexts.delete(uri)
    }
  }, [marketplaceItems, workflows, path, isNested])

  /** Strips CR (\r) — Windows line endings break bash scripts. */
  const onChangeWrapper = (value: string) => {
    value = editorText(value)
    onChange(value)
  }

  return (
    <div
      style={{ width, height }}
      className={cx('relative border rounded', className)}
      ref={ref => {
        if (ref && !monacoRef.current) {
          defineEditorThemes(monaco.editor)
          monaco.editor.setTheme(getThemeName(isDark, disabled))
          const model = modelFor(
            monaco.Uri.parse(path),
            options.value ?? '',
            options.language
          )
          const editor = monaco.editor.create(ref, {
            automaticLayout: true,
            model,
            ...options,
            ...(readOnly === undefined ? {} : { readOnly }),
            fixedOverflowWidgets: true,
            suggest: {
              preview: true,
              // prevents the variable names from being shown as completion suggestions
              showWords: false,
              showInlineDetails: true,
            },
            //acceptSuggestionOnEnter: 'off'
          })

          // A refilled model may still hold the last editor's lint markers.
          monaco.editor.setModelMarkers(
            model,
            LINT_OWNER,
            (markers ?? []).map(marker => lintMarker(model, marker))
          )
          // The cross-reference checks read a shape they can only take for granted once the
          // schema is satisfied, so the schema's problems come first and alone.
          const runLint = () => {
            if (!lint || model.isDisposed()) {
              return
            }
            const all = monaco.editor.getModelMarkers({ resource: model.uri })
            const schema = all.filter(
              marker =>
                marker.owner !== LINT_OWNER &&
                String(marker.code ?? '') !== SCHEMA_UNREADABLE
            )
            const source = model.getValue()
            const wanted =
              schema.length > 0
                ? []
                : lintWorkflow(
                    source,
                    lintContext(source, lintSourcesRef.current, runLint)
                  ).map(problem => lintMarker(model, problem))
            if (
              !sameMarkers(
                all.filter(marker => marker.owner === LINT_OWNER),
                wanted
              )
            ) {
              monaco.editor.setModelMarkers(model, LINT_OWNER, wanted)
            }
          }
          runLintRef.current = runLint
          let lintTimer: number | undefined
          const validate = () => {
            runLint()
            onValidate(monaco.editor.getModelMarkers({ resource: model.uri }))
          }
          const modelListeners = [
            model.onDidChangeContent(() => {
              if (lint) {
                window.clearTimeout(lintTimer)
                lintTimer = window.setTimeout(runLint, 300)
              }
              // Skip onChange for programmatic setValue calls (value prop sync)
              // to avoid an infinite re-render loop.
              if (isSyncingValueRef.current) {
                return
              }
              onChangeWrapper(editor.getValue())
            }),
            // Markers rather than decorations: a model's markers can clear without its decorations changing.
            monaco.editor.onDidChangeMarkers(resources => {
              const uri = model.uri.toString()
              if (resources.some(resource => resource.toString() === uri)) {
                validate()
              }
            }),
          ]
          holdListeners(model, modelListeners)
          listenersRef.current = modelListeners
          validate()
          unregisterRevealRef.current = registerRevealer(path, (start, end) => {
            const last = Math.min(Math.max(start, end), model.getLineCount())
            editor.revealLinesInCenterIfOutsideViewport(start, last)
            editor.setPosition({
              lineNumber: start,
              column: model.getLineFirstNonWhitespaceColumn(start) || 1,
            })
            const flash = editor.createDecorationsCollection([
              {
                range: new monaco.Range(start, 1, last, 1),
                options: {
                  isWholeLine: true,
                  className: 'bg-(--theme-element)/20',
                },
              },
            ])
            window.setTimeout(() => flash.clear(), 1500)
          })

          monacoRef.current = editor
        }
        // Also for an editor a module run before a hot update made, so the new run registers its own.
        if (ref) {
          ensureMonacoYamlConfigured()

          if (workflowCompletionProvidersRegistered) {
            return
          }
          workflowCompletionProvidersRegistered = true

          registeredCompletionProviders.push(
            monaco.editor.registerCommand(
              ADD_NESTED_INPUTS,
              (
                _accessor: unknown,
                uri: string,
                name: string,
                definition: Record<string, unknown>
              ) => {
                workflowCompletionContexts
                  .get(uri)
                  ?.nested?.current?.addInputs(name, definition)
              }
            )
          )

          // For marketplace/ and workflow/ suggestions (i.e. uses property)
          registeredCompletionProviders.push(
            monaco.languages.registerCompletionItemProvider('yaml', {
              triggerCharacters: ['/', ' ', '@'],
              provideCompletionItems: async (model, position) => {
                const context = workflowCompletionContexts.get(
                  model.uri.toString()
                )
                if (!context) {
                  return { suggestions: [] }
                }
                const { marketplaceItems, workflows } = context
                const lineContent = model.getLineContent(position.lineNumber)
                const textUntilPos = lineContent.substring(
                  0,
                  position.column - 1
                )
                const defaultItem = {
                  kind: monaco.languages.CompletionItemKind.Value,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                  },
                }
                let suggestions: monaco.languages.CompletionItem[] = []

                // Matches uses: or - uses:
                if (!/^\s*(?:-\s+)?uses\s*:\s*([^\n\r]*)$/.test(textUntilPos)) {
                  return { suggestions }
                }

                const marketIndex = textUntilPos.lastIndexOf('marketplace/')
                const workflowIndex = textUntilPos.lastIndexOf('workflow/')
                const pwIndex = textUntilPos.lastIndexOf('parallelworks/')
                const githubIndex = textUntilPos.lastIndexOf('github/')
                const gitlabIndex = textUntilPos.lastIndexOf('gitlab/')
                const usesText =
                  textUntilPos
                    .match(/^\s*(?:-\s+)?uses\s*:\s*([^\n\r]*)$/)?.[1]
                    ?.trim() ?? ''
                if (
                  marketIndex === -1 &&
                  workflowIndex === -1 &&
                  pwIndex === -1 &&
                  githubIndex === -1 &&
                  gitlabIndex === -1
                ) {
                  if (usesText.trim().length > 0) {
                    return { suggestions }
                  }
                  return {
                    suggestions: [
                      {
                        label: 'marketplace',
                        sortText: '2',
                        insertText: 'marketplace',
                        detail: 'use a workflow from the marketplace',
                        ...defaultItem,
                      },
                      {
                        label: 'workflow',
                        sortText: '3',
                        insertText: 'workflow',
                        detail: 'use one of your workflows',
                        ...defaultItem,
                      },
                      {
                        label: 'github',
                        sortText: '4',
                        insertText: 'github',
                        detail: 'use a workflow from a GitHub repository',
                        ...defaultItem,
                      },
                      {
                        label: 'gitlab',
                        sortText: '5',
                        insertText: 'gitlab',
                        detail: 'use a workflow from a GitLab project',
                        ...defaultItem,
                      },
                    ],
                  }
                }
                const noExtra = [
                  'marketplace/',
                  'workflow/',
                  'parallelworks/',
                  'github/',
                  'gitlab/',
                ].includes(usesText)
                if (workflowIndex !== -1 && noExtra) {
                  const sections = lineContent
                    .substring(workflowIndex, position.column - 1)
                    .split('/')
                  if (sections.length === 2) {
                    suggestions = workflows.map(item => {
                      const name = item.name ?? ''
                      return {
                        label:
                          item.displayName && item.displayName !== name
                            ? `${item.displayName} (${name})`
                            : name,
                        insertText: name,
                        detail: item.description
                          ? item.description
                          : `${item.type ?? ''} workflow`,
                        ...defaultItem,
                      }
                    })
                  }
                } else if (marketIndex !== -1) {
                  const sections = lineContent
                    .substring(marketIndex, position.column - 1)
                    .split('/')
                  if (sections.length === 2 && noExtra) {
                    suggestions = marketplaceItems
                      .filter(item => item.type === 'workflow')
                      .map(item => {
                        const slug = item.slug ?? ''
                        return {
                          label:
                            item.name && item.name !== slug
                              ? `${item.name} (${slug})`
                              : slug,
                          insertText: slug,
                          detail: item.description
                            ? item.description
                            : `${item.subtype ?? ''} workflow`,
                          ...defaultItem,
                        }
                      })
                  } else if (sections.length === 3 && sections[2] === '') {
                    const mpItem = marketplaceItems.find(
                      item => item.slug === sections[1]
                    )
                    if (mpItem && mpItem.versions) {
                      suggestions = [
                        ...mpItem.versions.map(v => {
                          return {
                            label: v,
                            insertText: v,
                            ...defaultItem,
                          }
                        }),
                        {
                          label: 'latest',
                          insertText: 'latest',
                          ...defaultItem,
                        },
                      ]
                    }
                  }
                } else if (githubIndex !== -1) {
                  const afterGithub = usesText.replace('github/', '')
                  if (afterGithub === '') {
                    // Owners, not every repository under them: a reference names one of
                    // these first, and there are a handful rather than hundreds.
                    suggestions = [
                      {
                        label: 'Type a GitHub username or organization',
                        insertText: '',
                        detail: 'e.g. github/myorg/',
                        sortText: '0',
                        ...defaultItem,
                      },
                      ...(await repoOwners('github', '')).map(
                        (owner, index) => ({
                          label: owner.name,
                          filterText: owner.name,
                          insertText: owner.name,
                          detail: owner.kind,
                          sortText: `1${String(index).padStart(4, '0')}`,
                          ...defaultItem,
                        })
                      ),
                    ]
                  } else if (!afterGithub.includes('/')) {
                    // Typing owner name — no suggestions until they type /
                  } else {
                    const ghOwner = afterGithub.split('/')[0]
                    const rest = afterGithub.split('/').slice(1).join('/')
                    if (rest === '') {
                      // Just typed github/OWNER/ — fetch repos
                      const repos = await repoOwnerRepos(ghOwner ?? '')
                      suggestions = repos.map(r => ({
                        label: r.description
                          ? `${r.name} — ${r.description}`
                          : r.name,
                        insertText: r.name,
                        detail:
                          r.description ||
                          (r.private ? 'private repository' : 'repository'),
                        ...defaultItem,
                      }))
                    } else {
                      // Detect ref separator: either REPO@ or REPO/ (trailing slash)
                      let ghRepo = ''
                      let isRefTrigger = false
                      let replaceSlash = false
                      const slashRefMatch = rest.match(/^([^@/]+)\/$/)
                      if (slashRefMatch) {
                        // Typed github/OWNER/REPO/ — treat / as ref separator
                        ghRepo = slashRefMatch[1] ?? ''
                        isRefTrigger = true
                        replaceSlash = true
                      } else if (rest.includes('@')) {
                        const atRepo = rest.split('@')[0]
                        const refPart = rest.split('@').slice(1).join('@')
                        if (atRepo && refPart === '') {
                          // Typed github/OWNER/REPO@
                          ghRepo = atRepo
                          isRefTrigger = true
                        }
                      }
                      if (isRefTrigger && ghRepo) {
                        // If triggered by /, use additionalTextEdits to replace / with @
                        const slashToAtEdit = replaceSlash
                          ? [
                              {
                                range: {
                                  startLineNumber: position.lineNumber,
                                  startColumn: position.column - 1,
                                  endLineNumber: position.lineNumber,
                                  endColumn: position.column,
                                },
                                text: '@',
                              },
                            ]
                          : []
                        const refs = await repoRefs(`${ghOwner}/${ghRepo}`)
                        suggestions.push(
                          ...refs.map((ref, index) => ({
                            label:
                              ref.kind === 'commit'
                                ? ref.name.slice(0, 7)
                                : ref.name,
                            insertText: ref.name,
                            detail: ref.detail || ref.kind,
                            // Ranked by the platform: tags newest first, then branches,
                            // then commits.
                            sortText: String(index).padStart(4, '0'),
                            additionalTextEdits: slashToAtEdit,
                            ...defaultItem,
                          }))
                        )
                      }
                    }
                  }
                } else if (gitlabIndex !== -1) {
                  const typed = usesText.replace('gitlab/', '')
                  // A gitlab/ reference names no host, so the only way to know which
                  // server a half-typed path belongs to is to ask all of them.
                  const pinned = stepHostAbove(model, position.lineNumber)
                  // Only asked for once a group is named, so the bare prefix costs a
                  // namespace listing rather than every project on every server.
                  const projects =
                    typed === ''
                      ? []
                      : await matchingProjects(
                          typed.replace(/[@/]$/, ''),
                          pinned
                        )
                  const trigger = refTrigger(
                    typed,
                    projects.map(project => project.path)
                  )
                  if (trigger) {
                    // A trailing / becomes the @ the ref belongs after, the way the
                    // github completion does it.
                    const slashToAtEdit = trigger.replaceSlash
                      ? [
                          {
                            range: {
                              startLineNumber: position.lineNumber,
                              startColumn: position.column - 1,
                              endLineNumber: position.lineNumber,
                              endColumn: position.column,
                            },
                            text: '@',
                          },
                        ]
                      : []
                    const host =
                      pinned ??
                      projects.find(
                        project => project.path === trigger.projectPath
                      )?.host
                    if (!host) {
                      return { suggestions }
                    }
                    const refs = await repoRefs(
                      `https://${host}/${trigger.projectPath}`
                    )
                    // The refs were listed against the server the project was found on,
                    // so the step has to name it too. Without this a path typed out by
                    // hand keeps no $host and resolves against gitlab.com instead.
                    const withHost = pinned
                      ? { appendText: '', edits: [] }
                      : hostCompletion(model, position.lineNumber, host)
                    suggestions = refs.map((ref, index) => {
                      const inserted = completionInsert(
                        ref.name,
                        withHost.appendText
                      )
                      return {
                        label:
                          ref.kind === 'commit'
                            ? ref.name.slice(0, 7)
                            : ref.name,
                        insertText: inserted.insertText,
                        ...(inserted.isSnippet
                          ? { insertTextRules: asSnippet }
                          : {}),
                        detail: ref.detail || ref.kind,
                        // The platform ranked these: tags newest first, then branches,
                        // then commits. Keep that rather than re-sorting by name.
                        sortText: String(index).padStart(4, '0'),
                        additionalTextEdits: [
                          ...slashToAtEdit,
                          ...withHost.edits,
                        ],
                        ...defaultItem,
                      }
                    })
                  } else if (typed === '') {
                    // The first segment is a group, not a project: listing every project
                    // to derive the same names from their paths is what was slow.
                    suggestions = [
                      {
                        label: 'Type a GitLab group or namespace',
                        insertText: '',
                        detail: 'e.g. gitlab/mygroup/',
                        sortText: '0',
                        ...defaultItem,
                      },
                      ...(await repoOwners('gitlab', '', pinned)).map(
                        (owner, index) => {
                          // The namespace already names its server, so the step can be
                          // pinned now rather than waiting for a project to be chosen.
                          const withHost = pinned
                            ? { appendText: '', edits: [] }
                            : hostCompletion(
                                model,
                                position.lineNumber,
                                owner.host ?? ''
                              )
                          const ownerInsert = completionInsert(
                            owner.name,
                            withHost.appendText
                          )
                          return {
                            label: owner.name,
                            filterText: owner.name,
                            insertText: ownerInsert.insertText,
                            ...(ownerInsert.isSnippet
                              ? { insertTextRules: asSnippet }
                              : {}),
                            detail: pinned
                              ? owner.kind
                              : `${owner.host} — ${owner.kind}`,
                            additionalTextEdits: withHost.edits,
                            sortText: `1${String(index).padStart(4, '0')}`,
                            ...defaultItem,
                          }
                        }
                      ),
                    ]
                  } else if (!typed.includes('@')) {
                    const projects = await matchingProjects(typed, pinned)
                    suggestions = projects.map((project, index) => {
                      const insert = projectInsert(typed, project.path)
                      const withHost = pinned
                        ? { appendText: '', edits: [] }
                        : hostCompletion(
                            model,
                            position.lineNumber,
                            project.host
                          )
                      const projectInserted = completionInsert(
                        insert.text,
                        withHost.appendText
                      )
                      // Only what is still to be typed, so the label does not repeat the
                      // group already on the line -- the way the github one behaves.
                      const shown = insert.replace ? project.path : insert.text
                      return {
                        label: project.description
                          ? `${shown} — ${project.description}`
                          : shown,
                        filterText: project.path,
                        insertText: projectInserted.insertText,
                        ...(projectInserted.isSnippet
                          ? { insertTextRules: asSnippet }
                          : {}),
                        detail: pinned
                          ? project.description ||
                            (project.private ? 'private project' : 'project')
                          : `${project.host}${project.description ? ` — ${project.description}` : ''}`,
                        // The path alone cannot be resolved, so the host it was found
                        // on is written beside it unless the step already pins one.
                        additionalTextEdits: withHost.edits,
                        // Only a mid-path match replaces what is typed; a prefix is
                        // completed at the cursor, the way the github one is.
                        range: insert.replace
                          ? {
                              startLineNumber: position.lineNumber,
                              startColumn: gitlabIndex + 'gitlab/'.length + 1,
                              endLineNumber: position.lineNumber,
                              endColumn: position.column,
                            }
                          : {
                              startLineNumber: position.lineNumber,
                              startColumn: position.column,
                              endLineNumber: position.lineNumber,
                              endColumn: position.column,
                            },
                        sortText: `1${String(index).padStart(4, '0')}`,
                        kind: monaco.languages.CompletionItemKind.Value,
                      }
                    })
                  }
                }

                return { suggestions }
              },
            })
          )

          // For with property suggestions (and addition of inputs to dynamic form)
          registeredCompletionProviders.push(
            monaco.languages.registerCompletionItemProvider('yaml', {
              triggerCharacters: [' ', '\n'],
              provideCompletionItems: async (model, position) => {
                const context = workflowCompletionContexts.get(
                  model.uri.toString()
                )
                if (!context) {
                  return { suggestions: [] }
                }
                const engine = await loadWorkflowEngine()
                if (!engine) {
                  return { suggestions: [] }
                }
                // A job's or step's own text has no inputs; the workflow around it takes the group.
                const nested = context.nested?.current
                const lineNumber = position.lineNumber
                const lineContent = model.getLineContent(lineNumber)
                const textUntilPos = lineContent.substring(
                  0,
                  position.column - 1
                )

                // $yaml:/$thumbnail: values come from the referenced repository's
                // tree, whichever provider the step's uses: names.
                if (fileValueKey(textUntilPos)) {
                  const files = await fileValueSuggestions(
                    model,
                    lineNumber,
                    textUntilPos,
                    (repo, ref) => repoFiles(repo, ref, '')
                  )
                  return {
                    suggestions: files.map(file => ({
                      label: file.path,
                      insertText: file.path,
                      detail: file.detail,
                      kind: monaco.languages.CompletionItemKind.File,
                      range: {
                        startLineNumber: lineNumber,
                        startColumn: position.column,
                        endLineNumber: lineNumber,
                        endColumn: position.column,
                      },
                    })),
                  }
                }

                // Detect trigger: current line is with:, $yaml:, $thumbnail:, or an
                // empty line inside a with: block.
                const isOnWithLine = /^\s*with\s*:\s*([^\n\r]*)$/.test(
                  textUntilPos
                )
                const isOnYamlLine = /^\s*\$(yaml|thumbnail)\s*:\s*\S/.test(
                  textUntilPos
                )
                let withLineNum = -1

                if (isOnWithLine) {
                  withLineNum = lineNumber
                } else if (isOnYamlLine) {
                  // On a $yaml:/$thumbnail: line — search upward for with:
                  for (
                    let ln = lineNumber - 1;
                    ln >= Math.max(lineNumber - 20, 1);
                    ln--
                  ) {
                    const content = model.getLineContent(ln)
                    if (content.trim() === '') {
                      continue
                    }
                    if (/^\s*with\s*:\s*([^\n\r]*)$/.test(content)) {
                      withLineNum = ln
                      break
                    }
                  }
                } else if (textUntilPos.trim() === '') {
                  // On an empty/whitespace line — search upward for with:
                  for (
                    let ln = lineNumber - 1;
                    ln >= Math.max(lineNumber - 20, 1);
                    ln--
                  ) {
                    const content = model.getLineContent(ln)
                    if (content.trim() === '') {
                      continue
                    }
                    if (/^\s*with\s*:\s*([^\n\r]*)$/.test(content)) {
                      withLineNum = ln
                      break
                    }
                  }
                }

                if (withLineNum === -1) {
                  return { suggestions: [] }
                }

                // When on an empty line inside a with: block, only suggest
                // inputs if the block is empty (or only has $yaml:).  If the
                // user has already typed other properties, don't interfere.
                if (!isOnWithLine && !isOnYamlLine && withLineNum !== -1) {
                  for (let ln = withLineNum + 1; ln < lineNumber; ln++) {
                    const content = model.getLineContent(ln).trim()
                    if (content === '') {
                      continue
                    }
                    if (/^\$[A-Za-z]+\s*:/.test(content)) {
                      continue
                    }
                    // There's a non-special property — don't suggest inputs
                    return { suggestions: [] }
                  }
                }

                // When cursor is on with: or $yaml:/$thumbnail:, we need a newline
                // before the inserted text. On with: we also need extra indent
                // (children are indented under with:). On $yaml:/$thumbnail:
                // we're already at child indent so no extra indent needed.
                const needsNewline = isOnWithLine || isOnYamlLine
                const needsIndent = isOnWithLine

                // Search upwards for the nearest line containing "uses:"
                let usesLine = ''
                let usesLineNum = -1
                for (
                  let ln = lineNumber - 1;
                  ln >= Math.max(lineNumber - 20, 1);
                  ln--
                ) {
                  const content = model.getLineContent(ln).trim()
                  if (/^(?:-\s+)?uses\s*:\s*(.+)$/.test(content)) {
                    usesLine = content
                    usesLineNum = ln
                    break
                  }
                }
                // If the with: we found is above the uses: line, it belongs
                // to a different step — the current step has no with: block.
                const needsWithLine =
                  usesLineNum !== -1 && withLineNum < usesLineNum

                // Compute the property indent from the uses: line so that
                // with: is inserted at the correct indentation level.
                let withIndent = ''
                if (needsWithLine && usesLineNum !== -1) {
                  const rawUsesLine = model.getLineContent(usesLineNum)
                  const indentMatch = rawUsesLine.match(/^(\s*(?:-\s+)?)uses/)
                  if (indentMatch) {
                    withIndent = ' '.repeat(indentMatch[1]!.length)
                  }
                }

                const defaultItem = {
                  kind: monaco.languages.CompletionItemKind.Value,
                  range: needsWithLine
                    ? {
                        // Replace the entire line so we control the indentation
                        startLineNumber: lineNumber,
                        startColumn: 1,
                        endLineNumber: lineNumber,
                        endColumn: lineContent.length + 1,
                      }
                    : {
                        startLineNumber: lineNumber,
                        startColumn: position.column,
                        endLineNumber: lineNumber,
                        endColumn: position.column,
                      },
                }
                if (usesLine === '') {
                  return { suggestions: [] }
                }
                // Extract the value after uses:
                const m = usesLine.match(/^(?:-\s+)?uses\s*:\s*(.+)$/)
                if (!m) {
                  return { suggestions: [] }
                }
                const usesValue = m[1]!.trim()
                if (!usesValue) {
                  return { suggestions: [] }
                }

                if (usesValue.startsWith('parallelworks/')) {
                  // Inside the with: block, let the schema handle
                  // individual field suggestions.
                  if (!needsWithLine && !isOnWithLine) {
                    return { suggestions: [] }
                  }
                  // On or needing the with: line, offer a single completion
                  // that inserts with: + required fields in one go.
                  const pwActionInputs: Record<
                    string,
                    { required: Record<string, string>; label: string }
                  > = {
                    'parallelworks/checkout': {
                      label: 'checkout',
                      required: {
                        repo: 'https://github.com/parallelworks/interactive_session.git',
                        branch: 'main',
                      },
                    },
                    'parallelworks/scheduler-agent': {
                      label: 'scheduler-agent',
                      required: { 'scheduler-type': 'slurm' },
                    },
                    'parallelworks/wait-for-agent': {
                      label: 'wait-for-agent',
                      required: {
                        agentId: '${{ needs.JOB.steps.STEP.outputs.agentId }}',
                      },
                    },
                    'parallelworks/cancel-jobs': {
                      label: 'cancel-jobs',
                      required: {},
                    },
                    'parallelworks/update-session': {
                      label: 'update-session',
                      required: { name: 'session-name' },
                    },
                  }
                  const actionDef = pwActionInputs[usesValue]
                  if (
                    !actionDef ||
                    Object.keys(actionDef.required).length === 0
                  ) {
                    return { suggestions: [] }
                  }
                  const withObj = { ...actionDef.required }
                  const withSuggestionYaml = prepareWithSuggestion(
                    engine,
                    needsNewline,
                    needsIndent,
                    needsWithLine,
                    withIndent,
                    withObj
                  )
                  return {
                    suggestions: [
                      {
                        label: actionDef.label + ' inputs',
                        detail: 'inputs for the ' + actionDef.label + ' action',
                        sortText: '1',
                        insertText: withSuggestionYaml,
                        ...defaultItem,
                      },
                    ],
                  }
                }

                if (
                  !(
                    usesValue.startsWith('marketplace/') ||
                    usesValue.startsWith('workflow/') ||
                    usesValue.startsWith('github/') ||
                    usesValue.startsWith('gitlab/')
                  )
                ) {
                  return { suggestions: [] }
                }

                let inputs: WorkflowInputs = {}
                let usesWorkflowRef: string[]
                const isGithub = usesValue.startsWith('github/')
                const isGitlab = usesValue.startsWith('gitlab/')
                // processRepoStep reads $yaml and $thumbnail the same way for both.
                const isRepoRef = isGithub || isGitlab
                const present = needsWithLine
                  ? specialKeysNearUses(model, usesLineNum)
                  : specialKeysInWithBlock(model, withLineNum)
                const offers = (key: string) => isRepoRef && !present.has(key)

                if (isGitlab) {
                  const [projectPath, ref] = splitAtRef(
                    usesValue.replace('gitlab/', '')
                  )
                  const host = stepHostAbove(model, usesLineNum) || 'gitlab.com'
                  if (!projectPath || !ref) {
                    return { suggestions: [] }
                  }
                  usesWorkflowRef = [projectPath]
                  const yamlPath =
                    (!needsWithLine ? present.get('$yaml') : undefined) ||
                    'workflow.yaml'
                  const text = await repoFile(
                    `https://${host}/${projectPath}`,
                    ref,
                    yamlPath
                  )
                  if (text) {
                    try {
                      inputs = readExecuteInputs(yaml.load(text))
                    } catch {
                      // not parseable — inputs stays {}
                    }
                  }
                } else if (isGithub) {
                  const trimmed = usesValue.replace('github/', '')
                  const [ownerRepo, ref] = trimmed.split('@')
                  if (!ownerRepo || !ref) {
                    return { suggestions: [] }
                  }
                  const [owner, repo] = ownerRepo.split('/')
                  if (!owner || !repo) {
                    return { suggestions: [] }
                  }
                  usesWorkflowRef = [ownerRepo]
                  const yamlPath =
                    (!needsWithLine ? present.get('$yaml') : undefined) ||
                    'workflow.yaml'
                  const text = await repoFile(
                    `${owner}/${repo}`,
                    ref ?? '',
                    yamlPath
                  )
                  if (text) {
                    // A malformed referenced workflow leaves inputs empty; $yaml
                    // is still offered.
                    try {
                      inputs = readExecuteInputs(yaml.load(text))
                    } catch {
                      // not parseable — inputs stays {}
                    }
                  }
                } else {
                  usesWorkflowRef = usesValue.split('/').slice(1)
                  const resolveJson = activeWorkflowJsonResolver
                  if (!resolveJson) {
                    return { suggestions: [] }
                  }
                  try {
                    const data = await resolveJson(
                      usesValue.startsWith('marketplace/')
                        ? {
                            kind: 'marketplace',
                            slug: usesWorkflowRef[0] ?? '',
                            version: usesWorkflowRef[1] ?? 'latest',
                          }
                        : { kind: 'workflow', name: usesWorkflowRef[0] ?? '' }
                    )
                    if (!data) {
                      return { suggestions: [] }
                    }
                    inputs = readExecuteInputs(data)
                  } catch {
                    return { suggestions: [] }
                  }
                }

                if (Object.keys(inputs).length === 0) {
                  const noInputSuggestions: monaco.languages.CompletionItem[] =
                    [
                      {
                        label: 'No inputs found',
                        detail: usesWorkflowRef[0] + ' has no inputs.',
                        insertText: '',
                        ...defaultItem,
                      },
                    ]
                  if (isGitlab && !present.has('$host')) {
                    noInputSuggestions.unshift({
                      label: '$host',
                      detail:
                        'The registered GitLab server this project lives on (default: gitlab.com)',
                      sortText: '0b',
                      insertText: needsWithLine
                        ? `${withIndent}with:\n${withIndent}  $host:`
                        : needsIndent
                          ? '\n  $host:'
                          : '$host:',
                      ...defaultItem,
                    })
                  }
                  if (isRepoRef) {
                    if (offers('$yaml')) {
                      noInputSuggestions.unshift({
                        label: '$yaml',
                        detail:
                          'Specify the yaml path in the repository (default: workflow.yaml)',
                        sortText: '0',
                        insertText: needsWithLine
                          ? `${withIndent}with:\n${withIndent}  $yaml:`
                          : needsIndent
                            ? '\n  $yaml:'
                            : '$yaml:',
                        ...defaultItem,
                      })
                    }
                    if (offers('$thumbnail')) {
                      noInputSuggestions.unshift({
                        label: '$thumbnail',
                        detail:
                          'Specify a thumbnail image path or URL for this subworkflow',
                        sortText: '0a',
                        insertText: needsWithLine
                          ? `${withIndent}with:\n${withIndent}  $thumbnail:`
                          : needsIndent
                            ? '\n  $thumbnail:'
                            : '$thumbnail:',
                        ...defaultItem,
                      })
                    }
                  }
                  return { suggestions: noInputSuggestions }
                }
                let groupname = usesValue
                  .replaceAll('/', '_')
                  .replaceAll('.', '-')
                  .replaceAll('@', '_')
                const fullText = model.getValue()
                let groupidx = 0
                try {
                  const existing = nested
                    ? nested.inputs()
                    : readExecuteInputs(yaml.load(fullText))
                  const basename = groupname
                  while (true) {
                    if (existing[groupname]) {
                      groupidx++
                      groupname = `${basename}_${groupidx}`
                    } else {
                      break
                    }
                  }
                } catch {
                  // Deliberately empty
                }
                const groupLabel = `${usesWorkflowRef[0]} inputs${
                  groupidx === 0 ? '' : ` ${groupidx}`
                }`
                const withSuggestionYaml = prepareWithSuggestion(
                  engine,
                  needsNewline,
                  needsIndent,
                  needsWithLine,
                  withIndent,
                  constructWithSuggestion(inputs, groupname)
                )

                const additionalTextEdits: monaco.languages.TextEdit[] = []
                if (!nested) {
                  // Inspect editor yaml to find on.execute.inputs if it exists
                  const lines = fullText.split(/\r?\n/)
                  let inputsLineIndex = -1
                  for (let i = 0; i < lines.length; i++) {
                    if (/^[ \t]*inputs\s*:\s*(#.*)?$/.test(lines[i]!)) {
                      const inputsIndentMatch = lines[i]!.match(/^([ \t]*)/)
                      const inputsIndent = inputsIndentMatch
                        ? inputsIndentMatch[1]!.length
                        : 0
                      let executeIndex = -1
                      for (let j = i - 1; j >= 0; j--) {
                        const m = lines[j]!.match(
                          /^([ \t]*)([^\s:]+)\s*:\s*(#.*)?$/
                        )
                        if (!m) {
                          continue
                        }
                        const indent = m[1]!.length
                        const keyName = m[2]
                        if (keyName === 'execute' && indent < inputsIndent) {
                          executeIndex = j
                          break
                        }
                      }
                      if (executeIndex === -1) {
                        continue
                      }
                      const execIndentMatch =
                        lines[executeIndex]!.match(/^([ \t]*)/)
                      const execIndent = execIndentMatch
                        ? execIndentMatch[1]!.length
                        : 0
                      let onFound = false
                      for (let k = executeIndex - 1; k >= 0; k--) {
                        const mOn = lines[k]!.match(
                          /^([ \t]*)(?:'on'|on)\s*:\s*(#.*)?$/
                        )
                        if (!mOn) {
                          continue
                        }
                        const onIndent = mOn[1]!.length
                        if (onIndent < execIndent) {
                          onFound = true
                          break
                        }
                      }
                      if (onFound) {
                        inputsLineIndex = i
                        break
                      }
                    }
                  }

                  // This is what we are appending below on.execute.inputs
                  const yamlInputs =
                    `      ${groupname}:\nlabel: ${groupLabel}\ntype: group\nitems:\n  `.replaceAll(
                      '\n',
                      '\n        '
                    ) +
                    rewriteInputExpressionsForGroup(
                      engine.toYaml(inputs),
                      groupname
                    )
                      .trim()
                      .replaceAll('\n', '\n          ') +
                    '\n'

                  if (inputsLineIndex !== -1) {
                    const insertLineNumber = inputsLineIndex + 2
                    additionalTextEdits.push({
                      range: {
                        startLineNumber: insertLineNumber,
                        startColumn: 1,
                        endLineNumber: insertLineNumber,
                        endColumn: 1,
                      },
                      text: yamlInputs,
                    })
                  } else {
                    // Have to add a newline if this is the bottom line or else it will not work for some reason
                    if (position.lineNumber === lines.length) {
                      const editor = monaco.editor
                        .getEditors()
                        .find(
                          e =>
                            e.getModel()?.uri.toString() ===
                            model.uri.toString()
                        )
                      editor?.executeEdits(
                        'ensure-trailing-newline',
                        [
                          {
                            range: new monaco.Range(
                              lines.length,
                              lineContent.length + 1,
                              lines.length,
                              lineContent.length + 1
                            ),
                            text: '\n',
                            forceMoveMarkers: true,
                          },
                        ],
                        () => {
                          const sel = editor?.getSelection()
                          return sel ? [sel] : null
                        }
                      )
                    }
                    additionalTextEdits.push({
                      range: {
                        startLineNumber: lines.length + 1,
                        startColumn: 1,
                        endLineNumber: lines.length + 1,
                        endColumn: 1,
                      },
                      text: '\non:\n  execute:\n    inputs:\n' + yamlInputs,
                    })
                  }
                }

                const suggestions: monaco.languages.CompletionItem[] = [
                  {
                    label: usesWorkflowRef[0] + ' inputs',
                    detail: 'all input expressions and dynamic form additions',
                    sortText: '1',
                    insertText: withSuggestionYaml,
                    ...(nested
                      ? {
                          command: {
                            id: ADD_NESTED_INPUTS,
                            title: groupLabel,
                            arguments: [
                              model.uri.toString(),
                              groupname,
                              {
                                label: groupLabel,
                                type: 'group',
                                items: yaml.load(
                                  rewriteInputExpressionsForGroup(
                                    engine.toYaml(inputs),
                                    groupname
                                  )
                                ),
                              },
                            ],
                          },
                        }
                      : { additionalTextEdits }),
                    ...defaultItem,
                  },
                  {
                    label: usesWorkflowRef[0] + ' inputs only',
                    detail:
                      'all input expressions only, no dynamic form additions',
                    sortText: '2',
                    insertText: withSuggestionYaml,
                    ...defaultItem,
                  },
                ]

                if (isGitlab && !present.has('$host')) {
                  suggestions.unshift({
                    label: '$host (GitLab server)',
                    detail:
                      'The registered GitLab server this project lives on (default: gitlab.com)',
                    sortText: '0b',
                    insertText: needsWithLine
                      ? `${withIndent}with:\n${withIndent}  $host:`
                      : needsIndent
                        ? '\n  $host:'
                        : '$host:',
                    ...defaultItem,
                  })
                }
                if (isRepoRef) {
                  if (offers('$yaml')) {
                    suggestions.unshift({
                      label: '$yaml (custom yaml path)',
                      detail:
                        'Override the default workflow.yaml path in the repository',
                      sortText: '0',
                      insertText: needsWithLine
                        ? `${withIndent}with:\n${withIndent}  $yaml:`
                        : needsIndent
                          ? '\n  $yaml:'
                          : '$yaml:',
                      ...defaultItem,
                    })
                  }
                  if (offers('$thumbnail')) {
                    suggestions.unshift({
                      label: '$thumbnail (custom thumbnail)',
                      detail:
                        'Specify a thumbnail image path or URL for this subworkflow',
                      sortText: '0a',
                      insertText: needsWithLine
                        ? `${withIndent}with:\n${withIndent}  $thumbnail:`
                        : needsIndent
                          ? '\n  $thumbnail:'
                          : '$thumbnail:',
                      ...defaultItem,
                    })
                  }
                }

                return {
                  suggestions,
                }
              },
            })
          )
        }
      }}
    />
  )
}

/** When a workflow is imported as a group, rewrites bare `inputs.X` → `inputs.<groupname>.X` so expressions still resolve. */
function rewriteInputExpressionsForGroup(
  yamlStr: string,
  groupname: string
): string {
  return yamlStr.replace(/\$\{\{(.*?)\}\}/g, (_match, expr) => {
    const rewritten = expr.replace(/\binputs\./g, `inputs.${groupname}.`)
    return '${{ ' + rewritten.trim() + ' }}'
  })
}

type WorkflowInput = { type?: string; items?: WorkflowInputs }
type WorkflowInputs = Record<string, WorkflowInput>

function constructWithSuggestion(
  inputs: WorkflowInputs,
  path: string
): Record<string, unknown> {
  const withSuggestion: Record<string, unknown> = {}
  Object.keys(inputs).map(k => {
    const input = inputs[k]
    if (input?.type === 'group' && input.items) {
      withSuggestion[k] = constructWithSuggestion(input.items, path + '.' + k)
    } else {
      withSuggestion[k] = '${{ inputs.' + path + '.' + k + ' }}'
    }
  })
  return withSuggestion
}

function prepareWithSuggestion(
  engine: WorkflowEngine,
  needsNewline: boolean,
  needsIndent: boolean,
  needsWithLine: boolean,
  withIndent: string,
  withSuggestion: Record<string, unknown>
) {
  let withSuggestionYaml = engine.toYaml(withSuggestion)
  if (needsWithLine) {
    // No with: exists — prepend with: and indent all content under it.
    // Use absolute indentation (the range replaces the entire line).
    const childIndent = withIndent + '  '
    withSuggestionYaml = (
      withIndent +
      'with:\n' +
      withSuggestionYaml
    ).replaceAll('\n', '\n' + childIndent)
  } else if (needsNewline && needsIndent) {
    // On the with: line — newline + 2-space indent for children
    withSuggestionYaml = ('\n' + withSuggestionYaml).replaceAll('\n', '\n  ')
  } else if (needsNewline) {
    // On the $yaml: line — newline only, already at child indent level
    withSuggestionYaml = '\n' + withSuggestionYaml
  }
  return withSuggestionYaml
}
