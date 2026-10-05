import { type LintFix, WORKFLOW_FORMS } from '@parallelworks/workflow-parser'
import { useEffect, useId, useState } from 'react'
import { IconButton } from '../components/IconButton'
import { Input, Textarea } from '../components/Input'
import { useRepoSuggestions, useStrings, useWorkflowJsonResolver } from '../components/Provider'
import { DynamicForm } from '../form/Form'
import { CloseIcon } from '../icons'
import {
  asRecord,
  ChoiceButtons,
  EXPRESSION,
  FieldError,
  FieldLabel,
  isScalar,
  type Json,
  KeyValueEditor,
  LabelledField,
  labelled,
  parseScalar,
  type Row,
  rowsError,
  rowsFrom,
  rowsTo,
  StringListEditor,
  type Strings,
  SuggestedInput,
  sameValue,
  ToggleField,
} from './editorFields'
import type { GraphEditorStrings } from './editorStrings'
import { FixButtons, LintScope, useFieldLint, useFieldProblems } from './fieldProblems'
import { type InputSource, refSuggestions, ValueOrInputField } from './inputRefs'
import { SuggestionInput } from './SuggestionInput'
import { DEFAULT_GITLAB_HOST, DEFAULT_REPO_YAML, loadUsesInputs, splitAtRef } from './usesInputs'

type ActionHelp = keyof GraphEditorStrings['actionHelp']
/** An action input's help, which also keys its name. */
type InputHelp = keyof GraphEditorStrings['actionFields']
type WithKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'any'
  | 'list'
  | 'bool'
  | 'choice'
  | 'flags'
  | 'target'

interface WithSpec {
  key: string
  kind: WithKind
  help: InputHelp
  required?: boolean
  choices?: string[]
  /** The schema also takes a `${{ }}` expression in place of a choice. */
  expression?: boolean
  /** Inputs whose value, or its `suffix` property, can fill this in. */
  refTypes?: string[]
  suffix?: string
  fallback?: boolean
}

const SCHEDULERS = ['slurm', 'pbs']
const SCHEDULER_REF = {
  refTypes: ['compute-clusters', 'compute-resources'],
  suffix: 'schedulerType',
}

/** The `with` inputs each built-in action takes, as the workflow schema lists them. */
export const ACTION_INPUTS: Record<string, WithSpec[]> = {
  'parallelworks/checkout': [
    { key: 'repo', kind: 'text', help: 'checkoutRepo', required: true },
    { key: 'branch', kind: 'text', help: 'checkoutBranch', required: true },
    { key: 'sparse_checkout', kind: 'list', help: 'checkoutSparse' },
    { key: 'path', kind: 'text', help: 'checkoutPath' },
  ],
  'parallelworks/scheduler-agent': [
    {
      key: 'scheduler-type',
      kind: 'choice',
      help: 'agentSchedulerType',
      choices: SCHEDULERS,
      expression: true,
      ...SCHEDULER_REF,
    },
    { key: 'scheduler-flags', kind: 'flags', help: 'agentSchedulerFlags' },
    { key: 'wait', kind: 'bool', help: 'agentWait', fallback: true },
    { key: 'script-headers', kind: 'textarea', help: 'agentScriptHeaders' },
    { key: 'debug', kind: 'bool', help: 'agentDebug' },
  ],
  'parallelworks/wait-for-agent': [
    { key: 'agentId', kind: 'text', help: 'waitAgentId', required: true },
    { key: 'schedulerJobId', kind: 'text', help: 'waitSchedulerJobId' },
    {
      key: 'scheduler-type',
      kind: 'choice',
      help: 'waitSchedulerType',
      choices: SCHEDULERS,
      expression: true,
      ...SCHEDULER_REF,
    },
  ],
  'parallelworks/cancel-jobs': [
    { key: 'jobs', kind: 'list', help: 'cancelJobs' },
    { key: 'workflow', kind: 'text', help: 'cancelWorkflow' },
    { key: 'run', kind: 'number', help: 'cancelRun' },
    { key: 'slug', kind: 'text', help: 'cancelSlug' },
  ],
  'parallelworks/update-session': [
    { key: 'name', kind: 'any', help: 'updateName', required: true },
    {
      key: 'type',
      kind: 'choice',
      help: 'updateType',
      choices: ['link', 'tunnel'],
    },
    { key: 'url', kind: 'text', help: 'updateUrl' },
    { key: 'target', kind: 'text', help: 'updateTarget' },
    { key: 'remotePort', kind: 'any', help: 'updateRemotePort' },
    { key: 'remoteHost', kind: 'text', help: 'updateRemoteHost' },
    { key: 'localPort', kind: 'any', help: 'updateLocalPort' },
    { key: 'slug', kind: 'text', help: 'updateSlug' },
    { key: 'status', kind: 'text', help: 'updateStatus' },
    { key: 'openAI', kind: 'bool', help: 'updateOpenAI' },
    { key: 'apiKey', kind: 'text', help: 'updateApiKey' },
    { key: 'targetInfo', kind: 'target', help: 'updateTargetInfo' },
  ],
}

const REPO_INPUTS: WithSpec[] = [
  { key: '$yaml', kind: 'text', help: 'repoYaml' },
  { key: '$thumbnail', kind: 'text', help: 'repoThumbnail' },
]
const GITLAB_INPUTS: WithSpec[] = [...REPO_INPUTS, { key: '$host', kind: 'text', help: 'repoHost' }]

/** Every `with` key the step dialog writes, for the schema coverage test. */
export function withFields(): string[] {
  const specs = [...Object.values(ACTION_INPUTS).flat(), ...GITLAB_INPUTS]
  return [
    ...new Set([
      ...specs.map((spec) => spec.key),
      ...TARGET_KEYS.map(([key]) => `targetInfo.${key}`),
    ]),
  ]
}

const TARGET_KEYS: [string, InputHelp][] = [
  ['name', 'targetName'],
  ['namespace', 'targetNamespace'],
  ['resourceType', 'targetResourceType'],
  ['resourceName', 'targetResourceName'],
]

// Inputs a subworkflow takes; `$` keys belong to the repository forms only.
const INPUT_KEY = /^[a-zA-Z0-9_-]+$/

type UsesKind = 'action' | 'github' | 'gitlab' | 'subworkflow' | 'other'

export function usesKind(uses: string): UsesKind {
  if (Object.hasOwn(ACTION_INPUTS, uses)) {
    return 'action'
  }
  if (uses.startsWith('github/')) {
    return 'github'
  }
  if (uses.startsWith('gitlab/')) {
    return 'gitlab'
  }
  return /^(marketplace|workflow)\//.test(uses) ? 'subworkflow' : 'other'
}

/** Named inputs for `uses`: an action's own, or a repository form's `$` keys. */
function specsFor(uses: string): WithSpec[] {
  const kind = usesKind(uses)
  return kind === 'action'
    ? (ACTION_INPUTS[uses] ?? [])
    : kind === 'github'
      ? REPO_INPUTS
      : kind === 'gitlab'
        ? GITLAB_INPUTS
        : []
}

export interface WithDraft {
  values: Record<string, unknown>
  rows: Row[]
  removed: string[]
}

function textDraft(value: unknown): string {
  if (value === undefined || value === null) {
    return ''
  }
  return isScalar(value) ? String(value) : JSON.stringify(value)
}

function draftFor(spec: WithSpec, value: unknown): unknown {
  switch (spec.kind) {
    case 'list':
      return Array.isArray(value) ? value.map(textDraft) : []
    case 'bool':
      return typeof value === 'boolean' ? value : undefined
    case 'flags':
      return rowsFrom(value)
    case 'target': {
      const target = asRecord(value)
      return Object.fromEntries(TARGET_KEYS.map(([key]) => [key, textDraft(target[key])]))
    }
    default:
      return textDraft(value)
  }
}

const ALL_SPECS = [...Object.values(ACTION_INPUTS).flat(), ...GITLAB_INPUTS]

export function withDraftFrom(value: unknown): WithDraft {
  const original = asRecord(value)
  const values: Record<string, unknown> = {}
  for (const spec of ALL_SPECS) {
    values[`${spec.kind}:${spec.key}`] = draftFor(spec, original[spec.key])
  }
  return {
    values,
    rows: rowsFrom(
      Object.fromEntries(Object.entries(original).filter(([key]) => !key.startsWith('$'))),
    ),
    removed: [],
  }
}

const slot = (spec: WithSpec) => `${spec.kind}:${spec.key}`

function valueFor(spec: WithSpec, draft: unknown): unknown {
  switch (spec.kind) {
    case 'list': {
      const items = (draft as string[]).map((item) => item.trim()).filter(Boolean)
      return items.length > 0 ? items : undefined
    }
    case 'bool':
      return draft
    case 'flags':
      return rowsTo(draft as Row[], parseScalar)
    case 'target': {
      const entries = Object.entries(draft as Record<string, string>)
        .map(([key, item]) => [key, item.trim()] as const)
        .filter(([, item]) => item)
      return entries.length > 0 ? Object.fromEntries(entries) : undefined
    }
    case 'number':
    case 'any': {
      const raw = String(draft).trim()
      return raw ? parseScalar(raw) : undefined
    }
    case 'textarea':
      return String(draft) ? String(draft) : undefined
    default: {
      const raw = String(draft).trim()
      return raw ? raw : undefined
    }
  }
}

/** Keys the step already has that `uses` doesn't take: any for an action, `$` ones otherwise. */
function extraKeys(uses: string, original: unknown, draft: WithDraft): string[] {
  const kind = usesKind(uses)
  if (kind === 'other') {
    return []
  }
  const known = new Set(specsFor(uses).map((spec) => spec.key))
  return Object.keys(asRecord(original)).filter(
    (key) =>
      !known.has(key) && !draft.removed.includes(key) && (kind === 'action' || key.startsWith('$')),
  )
}

/** The step's `with` for `uses`, or its original when nothing changed. */
export function withValue(
  uses: string,
  draft: WithDraft,
  initial: WithDraft,
  originalUses: string,
  original: unknown,
): unknown {
  if (uses === originalUses && sameValue(draft, initial)) {
    return original
  }
  const kind = usesKind(uses)
  const out: Json = {}
  for (const spec of specsFor(uses)) {
    const value = valueFor(spec, draft.values[slot(spec)])
    if (value !== undefined) {
      out[spec.key] = value
    }
  }
  if (kind !== 'action') {
    Object.assign(out, rowsTo(draft.rows, parseScalar))
  }
  const kept = asRecord(original)
  for (const key of extraKeys(uses, original, draft)) {
    out[key] = kept[key]
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function withError(
  uses: string,
  draft: WithDraft,
  original: unknown,
  t: Strings,
): string | undefined {
  const kind = usesKind(uses)
  if (extraKeys(uses, original, draft).length > 0) {
    return t.notActionInput
  }
  for (const spec of specsFor(uses)) {
    const value = valueFor(spec, draft.values[slot(spec)])
    if (spec.required && value === undefined) {
      return t.missingInput(spec.key)
    }
    if (spec.kind === 'number' && value !== undefined && typeof value !== 'number') {
      return t.invalidNumberInput
    }
    if (
      spec.kind === 'choice' &&
      typeof value === 'string' &&
      !spec.choices?.includes(value) &&
      !(spec.expression && EXPRESSION.test(value))
    ) {
      return t.invalidChoice(spec.key)
    }
    if (spec.kind === 'flags') {
      const error = rowsError(draft.values[slot(spec)] as Row[], INPUT_KEY, t.invalidKey, t)
      if (error) {
        return error
      }
    }
  }
  return kind === 'action'
    ? undefined
    : rowsError(draft.rows, kind === 'other' ? /^\$?[a-zA-Z0-9_-]+$/ : INPUT_KEY, t.invalidKey, t)
}

function SpecField({
  spec,
  draft,
  onChange,
  references,
  source,
}: {
  spec: WithSpec
  draft: unknown
  onChange: (draft: unknown) => void
  references: string[]
  source: InputSource
}) {
  const { graphEditor: t } = useStrings()
  const description = t.actionHelp[spec.help]
  const label = t.actionFields[spec.help]
  if (spec.refTypes) {
    return (
      <ValueOrInputField
        label={label}
        yamlKey={spec.key}
        description={description}
        value={String(draft)}
        onChange={onChange}
        source={source}
        types={spec.refTypes}
        {...(spec.suffix ? { suffix: spec.suffix } : {})}
        suggestions={spec.choices ?? []}
      />
    )
  }
  switch (spec.kind) {
    case 'list':
      return (
        <LabelledField label={label} yamlKey={spec.key} description={description}>
          <StringListEditor values={draft as string[]} onChange={onChange} addLabel={t.addRow} />
        </LabelledField>
      )
    case 'bool':
      return (
        <ToggleField
          label={label}
          yamlKey={spec.key}
          description={description}
          checked={typeof draft === 'boolean' ? draft : (spec.fallback ?? false)}
          onChange={(on) => onChange(on === (spec.fallback ?? false) ? undefined : on)}
        />
      )
    case 'flags':
      return (
        <LabelledField label={label} yamlKey={spec.key} description={description}>
          <KeyValueEditor
            rows={draft as Row[]}
            onChange={onChange}
            error={undefined}
            valueSuggestions={references}
          />
        </LabelledField>
      )
    case 'target': {
      const target = draft as Record<string, string>
      return (
        <div className="flex flex-col gap-2">
          <FieldLabel label={label} yamlKey={spec.key} description={description} />
          {TARGET_KEYS.map(([key, help]) => (
            <Input
              key={key}
              mono
              {...labelled(t.actionFields[help], key)}
              description={t.actionHelp[help]}
              value={target[key] ?? ''}
              onChange={(e) => onChange({ ...target, [key]: e.target.value })}
            />
          ))}
        </div>
      )
    }
    case 'textarea':
      return (
        <Textarea
          mono
          {...labelled(label, spec.key)}
          description={description}
          rows={4}
          value={String(draft)}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      return (
        <SuggestedInput
          label={label}
          yamlKey={spec.key}
          description={description}
          value={String(draft)}
          onChange={onChange}
          suggestions={spec.choices ?? references}
        />
      )
  }
}

/** Where a repository `uses` reads its workflow from, for the repository fields. */
export function repositoryOf(uses: string, host: string): { repo: string; branch: string } {
  const kind = usesKind(uses)
  if (kind !== 'github' && kind !== 'gitlab') {
    return { repo: '', branch: '' }
  }
  const [path, ref] = splitAtRef(uses.slice(uses.indexOf('/') + 1))
  const server = kind === 'github' ? 'github.com' : host || 'gitlab.com'
  return { repo: path ? `https://${server}/${path}` : '', branch: ref }
}

/** The `uses` for a repository URL and branch, plus the $host a GitLab server needs. */
export function usesOfRepository(
  repo: string,
  branch: string,
): { uses: string; host: string } | null {
  let url: URL
  try {
    url = new URL(repo.includes('://') ? repo : `https://${repo}`)
  } catch {
    return null
  }
  const path = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
  if (!path) {
    return null
  }
  const ref = branch.trim() ? `@${branch.trim()}` : ''
  return url.host === 'github.com'
    ? { uses: `github/${path}${ref}`, host: '' }
    : {
        uses: `gitlab/${path}${ref}`,
        host: url.host === 'gitlab.com' ? '' : url.host,
      }
}

const { readme: _readme, ...REPOSITORY_FIELDS } = WORKFLOW_FORMS.github

/** The repository fields the workflow import form uses, so branches and files come from GitHub or GitLab. */
function RepositoryForm({
  uses,
  draft,
  onUses,
  onDraft,
}: {
  uses: string
  draft: WithDraft
  onUses: (uses: string) => void
  onDraft: (draft: WithDraft) => void
}) {
  const host = String(draft.values['text:$host'] ?? '')
  const [initial] = useState(() => ({
    ...repositoryOf(uses, host),
    yaml: String(draft.values['text:$yaml'] ?? '') || DEFAULT_REPO_YAML,
    thumbnail: String(draft.values['text:$thumbnail'] ?? ''),
  }))
  return (
    <DynamicForm
      formJSONs={REPOSITORY_FIELDS}
      initialValues={initial}
      labelPosition="top"
      workflowForm
      setValues={(values) => {
        const next = usesOfRepository(String(values['repo'] ?? ''), String(values['branch'] ?? ''))
        if (next) {
          onUses(next.uses)
        }
        onDraft({
          ...draft,
          values: {
            ...draft.values,
            'text:$yaml': values['yaml'] === DEFAULT_REPO_YAML ? '' : String(values['yaml'] ?? ''),
            'text:$thumbnail': String(values['thumbnail'] ?? ''),
            'text:$host': next?.host ?? host,
          },
        })
      }}
    />
  )
}

type UsesMode = 'action' | 'workflow' | 'marketplace' | 'repository'

function usesMode(uses: string): UsesMode {
  const kind = usesKind(uses)
  if (kind === 'action') {
    return 'action'
  }
  if (kind === 'github' || kind === 'gitlab') {
    return 'repository'
  }
  return uses.startsWith('marketplace/') ? 'marketplace' : 'workflow'
}

const ACTION_ABOUT: Record<string, ActionHelp> = {
  'parallelworks/checkout': 'aboutCheckout',
  'parallelworks/scheduler-agent': 'aboutSchedulerAgent',
  'parallelworks/wait-for-agent': 'aboutWaitForAgent',
  'parallelworks/cancel-jobs': 'aboutCancelJobs',
  'parallelworks/update-session': 'aboutUpdateSession',
}

/** What a step uses: a built-in action, a workflow of yours, one from the marketplace, or one in a repository. */
export function UsesPicker({
  uses,
  onUses,
  choices,
  draft,
  onDraft,
  error,
}: {
  uses: string
  onUses: (uses: string) => void
  /** `workflow/NAME` and `marketplace/SLUG` values to offer. */
  choices: string[]
  draft: WithDraft
  onDraft: (draft: WithDraft) => void
  error: string | undefined
}) {
  const { graphEditor: t } = useStrings()
  const id = useId()
  const lint = useFieldLint('uses', id, uses, onUses)
  const [mode, setMode] = useState<UsesMode>(() => usesMode(uses))
  const options = (prefix: string) => choices.filter((choice) => choice.startsWith(prefix))
  // Typed, not only picked: a version pin or a workflow the lists don't show still works.
  const select = (
    values: string[],
    placeholder: string,
    labels?: (value: string) => string | undefined,
  ) => (
    <SuggestionInput
      id={id}
      ariaLabel={t.fields.uses}
      value={uses}
      placeholder={placeholder}
      suggestions={values.map((value) => ({ value, label: labels?.(value) }))}
      onChange={onUses}
    />
  )
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel label={t.fields.uses} yamlKey="uses" description={t.help.uses} />
      <ChoiceButtons
        size="xs"
        options={[
          { value: 'action', label: t.usesAction },
          { value: 'workflow', label: t.usesWorkflow },
          { value: 'marketplace', label: t.usesMarketplace },
          { value: 'repository', label: t.usesRepository },
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next)
          if (next !== usesMode(uses)) {
            onUses('')
          }
        }}
      />
      {mode === 'action' ? (
        select(Object.keys(ACTION_INPUTS), t.chooseAction, (value) => {
          const about = ACTION_ABOUT[value]
          return about ? t.actionHelp[about] : undefined
        })
      ) : mode === 'workflow' ? (
        select(options('workflow/'), t.chooseWorkflow)
      ) : mode === 'marketplace' ? (
        select(options('marketplace/'), t.chooseMarketplace)
      ) : (
        <RepositoryForm uses={uses} draft={draft} onUses={onUses} onDraft={onDraft} />
      )}
      <FieldError message={error ?? lint.message} />
    </div>
  )
}

/** The inputs of the workflow a step uses, fetched the way the YAML editor's completions are. */
function useSubworkflowInputs(uses: string, draft: WithDraft): Json | null {
  const resolve = useWorkflowJsonResolver()
  const repos = useRepoSuggestions()
  const [inputs, setInputs] = useState<Json | null>(null)
  const yamlPath = String(draft.values['text:$yaml'] ?? '') || DEFAULT_REPO_YAML
  const host = String(draft.values['text:$host'] ?? '') || DEFAULT_GITLAB_HOST
  useEffect(() => {
    let live = true
    setInputs(null)
    loadUsesInputs(uses, { yamlPath, host }, { resolve, repos })
      .then((loaded) => {
        if (live) {
          setInputs(loaded)
        }
      })
      .catch(() => {
        if (live) {
          setInputs(null)
        }
      })
    return () => {
      live = false
    }
  }, [uses, resolve, repos, yamlPath, host])
  return inputs
}

/** The step's `with`: an action's own inputs, or a subworkflow's by name. */
export function WithEditor({
  uses,
  draft,
  original,
  onChange,
  error,
  source,
}: {
  uses: string
  draft: WithDraft
  original: unknown
  onChange: (draft: WithDraft) => void
  error: string | undefined
  source: InputSource
}) {
  const { graphEditor: t, inputsEditor } = useStrings()
  const typeNames = inputsEditor.types as Record<string, string>
  const kind = usesKind(uses)
  const extras = extraKeys(uses, original, draft)
  const references = refSuggestions(source)
  const subworkflow = useSubworkflowInputs(uses, draft)
  const known = subworkflow ? Object.entries(subworkflow).filter(([key]) => key !== '$meta') : []
  const knownKeys = new Set(known.map(([key]) => key))
  const setRow = (key: string, value: string) => {
    const rows =
      value === ''
        ? draft.rows.filter((row) => row.key !== key)
        : draft.rows.some((row) => row.key === key)
          ? draft.rows.map((row) => (row.key === key ? { ...row, value } : row))
          : [...draft.rows, { key, value }]
    onChange({ ...draft, rows })
  }
  return (
    <LintScope at="with">
      <div className="flex flex-col gap-3">
        <FieldLabel label={t.fields.with} yamlKey="with" description={t.help.with} />
        {kind === 'action' &&
          specsFor(uses).map((spec) => (
            <SpecField
              key={slot(spec)}
              spec={spec}
              draft={draft.values[slot(spec)]}
              references={references}
              source={source}
              onChange={(value) =>
                onChange({
                  ...draft,
                  values: { ...draft.values, [slot(spec)]: value },
                })
              }
            />
          ))}
        {extras.map((key) => (
          <ExtraKey
            key={key}
            name={key}
            uses={uses}
            draft={draft}
            original={original}
            onChange={onChange}
          />
        ))}
        {kind !== 'action' && (
          <>
            {known.map(([key, raw]) => {
              const definition = asRecord(raw)
              const label = String(definition['label'] ?? '')
              const about = String(definition['description'] ?? '')
              const type = String(definition['type'] ?? '')
              return (
                <SuggestedInput
                  key={key}
                  label={label || key}
                  yamlKey={key}
                  description={about || (typeNames[type] ?? type)}
                  value={draft.rows.find((row) => row.key === key)?.value ?? ''}
                  suggestions={references}
                  onChange={(value) => setRow(key, value)}
                />
              )
            })}
            {known.length > 0 && (
              <FieldLabel label={t.otherInputs} description={t.help.withInputs} />
            )}
            <KeyValueEditor
              rows={draft.rows.filter((row) => !knownKeys.has(row.key))}
              onChange={(rows) =>
                onChange({
                  ...draft,
                  rows: [...draft.rows.filter((row) => knownKeys.has(row.key)), ...rows],
                })
              }
              error={undefined}
              valueSuggestions={references}
              lint
            />
          </>
        )}
        <FieldError message={error} />
      </div>
    </LintScope>
  )
}

/** A key an action doesn't take, with the input it was likely meant as when the linter knows. */
function ExtraKey({
  name,
  uses,
  draft,
  original,
  onChange,
}: {
  name: string
  uses: string
  draft: WithDraft
  original: unknown
  onChange: (draft: WithDraft) => void
}) {
  const { graphEditor: t } = useStrings()
  const id = useId()
  const fixes = useFieldProblems(name, id).flatMap(({ fix }) =>
    fix?.key && fix.find === name ? [fix] : [],
  )
  const remove = () => onChange({ ...draft, removed: [...draft.removed, name] })
  const rename = (fix: LintFix) => {
    const spec = specsFor(uses).find((spec) => spec.key === fix.replace)
    if (spec) {
      onChange({
        ...draft,
        values: {
          ...draft.values,
          [slot(spec)]: draftFor(spec, asRecord(original)[name]),
        },
        removed: [...draft.removed, name],
      })
    }
  }
  return (
    <div id={id} tabIndex={-1} className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono">{name}</span>
        <span className="text-xs text-(--theme-error)">{t.notActionInput}</span>
        <IconButton
          icon={<CloseIcon className="h-4 w-4" />}
          label={t.removeRow}
          variant="ghost"
          size="sm"
          onClick={remove}
        />
      </div>
      <FixButtons fixes={fixes} onFix={rename} />
    </div>
  )
}
