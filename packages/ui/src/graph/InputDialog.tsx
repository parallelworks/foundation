import cx from 'classnames'
import { type ReactNode, useId, useMemo, useRef, useState } from 'react'
import Dropdown from '../components/Dropdown'
import { FilterPill } from '../components/FilterPill'
import { IconButton } from '../components/IconButton'
import { Input, Textarea } from '../components/Input'
import { withPositionKeys } from '../components/keys'
import { useWorkflowEditing, useWorkflowEngine } from '../components/Provider'
import type { FieldPatch, GraphEdit, InputPath, WorkflowEditing } from '../editing'
import { INPUT_YAML_PATH } from '../editor/settingsYaml'
import { DynamicForm } from '../form/Form'
import { FormEditingContext } from '../form/formEditing'
import { inputWidth } from '../form/lib'
import { formatDuration, parseDuration } from '../form/utils/duration'
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, EditIcon, TrashIcon } from '../icons'
import {
  AddRowButton,
  asRecord,
  ChoiceButtons,
  DialogShell,
  diffPatch,
  EXPRESSION,
  ExpressionToggle,
  expressionError,
  FieldError,
  type Flag,
  flagError,
  GrowingTextarea,
  isEmptyPatch,
  isScalar,
  type Json,
  KeyHint,
  LabelledField,
  labelled,
  type OpenOnAdd,
  parseJson,
  parseScalar,
  Section,
  SectionMemory,
  StringListEditor,
  SuggestedInput,
  sameValue,
  ToggleField,
  text,
  unchangedValue,
  useSectionMemory,
  withoutUndefined,
} from './editorFields'
import {
  type GraphEditorStrings,
  type InputsEditorStrings,
  useGraphEditorStrings,
  useInputsEditorStrings,
} from './editorStrings'
import type { SettingsView } from './GraphEditorDialogs'
import { FlagField, type InputSource, inputRefs, ValueOrInputField } from './inputRefs'
import { FIELD_TEXT_BOX } from './SuggestionInput'
import { NO_SCOPED, ViewSwitch, YamlPane, yamlProblem } from './settingsViews'

type Help = keyof InputsEditorStrings['help']
type Kind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'flag'
  | 'bool'
  | 'options'
  | 'json'
  | 'providers'
  | 'template'
  | 'language'
  | 'values'
  | 'rows'
  | 'duration'
  | 'ref'
  | 'implies'
  | 'choice'
  | 'width'

interface Prop {
  key: string
  kind: Kind
  help: Help
  fallback?: boolean
  required?: boolean
  /** The schema also takes an object here, or with 'any' a list too. */
  nested?: 'object' | 'any'
  /** Inputs whose value this field can read. */
  refTypes?: string[]
  /** False when the field only reads another input. */
  literal?: boolean
  /** The values the schema takes when it isn't read from an input. */
  choices?: string[]
  /** The switch can follow another input's value. */
  conditional?: boolean
  /** A short text that starts one line tall and grows as it is written. */
  grow?: boolean
  /** Text people read, such as a label, set in the regular font instead of as code. */
  prose?: boolean
}

/** Input types by menu group, in the order the add menu lists them. */
export const INPUT_TYPE_GROUPS: [keyof InputsEditorStrings['typeGroups'], string[]][] = [
  ['basic', ['string', 'number', 'duration', 'boolean', 'password', 'editor', 'color-picker']],
  ['choices', ['dropdown', 'multi-dropdown', 'radio', 'checkbox-group']],
  ['layout', ['group', 'list', 'header', 'step']],
  ['compute', ['compute-clusters', 'compute-resources', 'compute-target', 'bucket']],
  ['schedulers', ['slurm-accounts', 'slurm-partitions', 'slurm-qos', 'pbs-queues']],
  ['cloud', ['region', 'zone', 'instance-type']],
  [
    'kubernetes',
    [
      'kubernetes-clusters',
      'kubernetes-namespaces',
      'kubernetes-pods',
      'kubernetes-pvc',
      'kubernetes-secrets',
      'kubernetes-configmaps',
      'kubernetes-statefulsets',
      'kubernetes-deployments',
      'kubernetes-services',
      'kubernetes-workloads',
    ],
  ],
  ['platform', ['organization-groups', 'ai-model', 'allocations']],
]

const DEFAULT: Prop = { key: 'default', kind: 'text', help: 'default' }
const DEFAULT_OBJECT: Prop = { ...DEFAULT, nested: 'object' }
const DEFAULT_LIST: Prop = {
  key: 'default',
  kind: 'values',
  help: 'defaultList',
}
// A resource picker's default is one resource address, or a list of them with multi on.
const RESOURCE_DEFAULT: Prop = {
  ...DEFAULT,
  help: 'defaultResource',
  nested: 'any',
}
const RESOURCE_DEFAULTS: Prop = { ...DEFAULT_LIST, help: 'defaultResources' }
const AUTOSELECT: Prop = {
  key: 'autoselect',
  kind: 'flag',
  help: 'autoselect',
  nested: 'object',
  conditional: true,
}
const PLACEHOLDER: Prop = {
  key: 'placeholder',
  kind: 'text',
  help: 'placeholder',
  prose: true,
}
const CLUSTER: Prop = {
  key: 'clusterName',
  kind: 'ref',
  help: 'clusterName',
  required: true,
  refTypes: ['kubernetes-clusters'],
}
const NAMESPACE: Prop = {
  key: 'namespace',
  kind: 'ref',
  help: 'namespace',
  required: true,
  refTypes: ['kubernetes-namespaces'],
}
const CSPS = ['aws', 'azure', 'google', 'openstack']
const CSP: Prop = {
  key: 'csp',
  kind: 'ref',
  help: 'csp',
  refTypes: ['dropdown', 'radio'],
  choices: CSPS,
}
const CSP_REQUIRED: Prop = { ...CSP, required: true }
const REGION: Prop = {
  key: 'region',
  kind: 'ref',
  help: 'region',
  required: true,
  refTypes: ['region'],
}
const RESOURCE: Prop = {
  key: 'resource',
  kind: 'ref',
  help: 'resource',
  required: true,
  refTypes: ['compute-clusters', 'compute-resources'],
  literal: false,
}
const ACCOUNT: Prop = {
  key: 'account',
  kind: 'ref',
  help: 'account',
  refTypes: ['slurm-accounts'],
  literal: false,
}
const DEFAULT_FROM_INPUT: Prop = {
  key: 'default',
  kind: 'ref',
  help: 'defaultFromInput',
  refTypes: ['string', 'dropdown', 'radio'],
  literal: false,
}
const OPTIONS: Prop = {
  key: 'options',
  kind: 'options',
  help: 'options',
  required: true,
}
const MULTI: Prop = { key: 'multi', kind: 'bool', help: 'multi' }
const COMPUTE: Prop[] = [
  RESOURCE_DEFAULT,
  RESOURCE_DEFAULTS,
  AUTOSELECT,
  {
    key: 'include-workspace',
    kind: 'flag',
    help: 'includeWorkspace',
    conditional: true,
  },
  {
    key: 'include-unprovisioned',
    kind: 'flag',
    help: 'includeUnprovisioned',
    conditional: true,
  },
  CSP,
  { key: 'provider', kind: 'providers', help: 'provider' },
  MULTI,
]
const IN_NAMESPACE: Prop[] = [DEFAULT_OBJECT, CLUSTER, NAMESPACE, AUTOSELECT]
const SLIDER: Prop = { key: 'slider', kind: 'flag', help: 'slider' }
const FLATTEN: Prop = { key: 'flatten', kind: 'bool', help: 'flatten' }
const TEMPLATE: Prop = {
  key: 'template',
  kind: 'template',
  help: 'template',
  required: true,
}
const DISABLE_LABEL: Prop = {
  key: 'disableLabel',
  kind: 'text',
  help: 'disableLabel',
  prose: true,
}
const DISABLE_VALUE: Prop = {
  key: 'disableValue',
  kind: 'number',
  help: 'disableValue',
}
const OPTION_KEY: Prop = {
  key: 'option-key',
  kind: 'ref',
  help: 'optionKey',
  refTypes: ['dropdown', 'radio', 'string'],
  literal: false,
}

const TYPE_PROPS: Record<string, Prop[]> = {
  string: [
    DEFAULT,
    PLACEHOLDER,
    { key: 'textarea', kind: 'bool', help: 'textarea' },
    { key: 'prefillDefault', kind: 'flag', help: 'prefillDefault' },
  ],
  number: [
    { key: 'default', kind: 'number', help: 'default' },
    { key: 'min', kind: 'number', help: 'minNumber' },
    { key: 'max', kind: 'number', help: 'maxNumber' },
    { key: 'step', kind: 'number', help: 'step' },
    SLIDER,
  ],
  boolean: [{ key: 'default', kind: 'flag', help: 'default' }],
  password: [DEFAULT],
  editor: [
    { key: 'default', kind: 'textarea', help: 'default' },
    { key: 'language', kind: 'language', help: 'language' },
  ],
  'color-picker': [DEFAULT],
  dropdown: [OPTIONS, OPTION_KEY, DEFAULT_OBJECT, PLACEHOLDER, AUTOSELECT],
  'multi-dropdown': [OPTIONS, DEFAULT_LIST],
  radio: [
    OPTIONS,
    DEFAULT,
    {
      key: 'optionLabelPosition',
      kind: 'choice',
      help: 'optionLabelPosition',
      choices: ['left', 'top'],
    },
  ],
  'checkbox-group': [OPTIONS, DEFAULT_LIST, { key: 'implies', kind: 'implies', help: 'implies' }],
  duration: [
    { key: 'default', kind: 'duration', help: 'durationDefault' },
    PLACEHOLDER,
    { key: 'min', kind: 'duration', help: 'minDuration' },
    { key: 'max', kind: 'duration', help: 'maxDuration' },
    DISABLE_LABEL,
    DISABLE_VALUE,
  ],
  group: [{ key: 'collapsed', kind: 'flag', help: 'collapsed', conditional: true }, FLATTEN],
  list: [
    TEMPLATE,
    { key: 'default', kind: 'rows', help: 'listDefault' },
    { key: 'items-collapsible', kind: 'flag', help: 'itemsCollapsible' },
    { key: 'min', kind: 'number', help: 'minItems' },
    { key: 'max', kind: 'number', help: 'maxItems' },
  ],
  header: [
    {
      key: 'text',
      kind: 'textarea',
      help: 'text',
      required: true,
      grow: true,
      prose: true,
    },
    { key: 'size', kind: 'number', help: 'size' },
    { key: 'bold', kind: 'flag', help: 'bold', fallback: true },
  ],
  step: [
    { key: 'title', kind: 'text', help: 'title', required: true, prose: true },
    { key: 'nextLabel', kind: 'text', help: 'nextLabel', prose: true },
    { key: 'prevLabel', kind: 'text', help: 'prevLabel', prose: true },
  ],
  'compute-clusters': COMPUTE,
  'compute-resources': COMPUTE,
  bucket: [
    RESOURCE_DEFAULT,
    RESOURCE_DEFAULTS,
    CSP,
    { key: 'generateCredentials', kind: 'flag', help: 'generateCredentials' },
    MULTI,
  ],
  region: [DEFAULT_OBJECT, CSP_REQUIRED, AUTOSELECT],
  zone: [DEFAULT_OBJECT, CSP_REQUIRED, REGION, AUTOSELECT],
  'instance-type': [DEFAULT_OBJECT, CSP_REQUIRED, REGION, AUTOSELECT],
  'slurm-accounts': [DEFAULT_FROM_INPUT, RESOURCE],
  'slurm-partitions': [DEFAULT_FROM_INPUT, RESOURCE, ACCOUNT],
  'slurm-qos': [
    DEFAULT_FROM_INPUT,
    RESOURCE,
    ACCOUNT,
    {
      key: 'partition',
      kind: 'ref',
      help: 'partition',
      refTypes: ['slurm-partitions'],
      literal: false,
    },
  ],
  'pbs-queues': [DEFAULT_FROM_INPUT, RESOURCE],
  'organization-groups': [DEFAULT_FROM_INPUT],
  'ai-model': [DEFAULT, PLACEHOLDER, AUTOSELECT],
  allocations: [
    DEFAULT,
    PLACEHOLDER,
    AUTOSELECT,
    { key: 'includeEmpty', kind: 'bool', help: 'includeEmpty', fallback: true },
  ],
  'kubernetes-clusters': [DEFAULT_OBJECT, AUTOSELECT],
  'kubernetes-namespaces': [DEFAULT_OBJECT, CLUSTER, AUTOSELECT],
  'kubernetes-pods': IN_NAMESPACE,
  'kubernetes-pvc': IN_NAMESPACE,
  'kubernetes-secrets': IN_NAMESPACE,
  'kubernetes-configmaps': IN_NAMESPACE,
  'kubernetes-statefulsets': IN_NAMESPACE,
  'kubernetes-deployments': IN_NAMESPACE,
  'kubernetes-services': IN_NAMESPACE,
  'kubernetes-workloads': IN_NAMESPACE,
}

const TEXT_FIELDS = ['label', 'description', 'tooltip'] as const
const FLAG_FIELDS = ['optional', 'hidden', 'disabled', 'ignore'] as const
type CommonKey = (typeof TEXT_FIELDS)[number] | 'width' | (typeof FLAG_FIELDS)[number]

// Which shared keys each type takes, per the workflow schema.
const COMMON_KEYS: Record<string, CommonKey[]> = {
  group: ['label', 'description', 'tooltip', 'width', 'hidden', 'ignore'],
  header: ['label', 'description', 'tooltip', 'width', 'hidden'],
  step: ['description'],
}
const ALL_COMMON: CommonKey[] = [...TEXT_FIELDS, 'width', ...FLAG_FIELDS]

// Keys this dialog manages; anything else on an input is left untouched.
const KNOWN_KEYS = new Set<string>([
  'type',
  ...ALL_COMMON,
  ...Object.values(TYPE_PROPS).flatMap((props) => props.map((prop) => prop.key)),
  'items',
  'template',
  'options',
])

const LANGUAGES = ['bash', 'python', 'yaml', 'json', 'javascript', 'shell']

export function inputTypes(): string[] {
  return INPUT_TYPE_GROUPS.flatMap(([, types]) => types)
}

export function commonKeys(type: string): CommonKey[] {
  return COMMON_KEYS[type] ?? ALL_COMMON
}

/** Every key the dialog can write for an input of `type`. */
export function offeredInputKeys(editing: WorkflowEditing, type: string): string[] {
  const children = editing.inputChildrenKey(type)
  return [
    'type',
    ...commonKeys(type),
    ...(TYPE_PROPS[type] ?? []).map((prop) => prop.key),
    ...(children ? [children] : []),
  ]
}

/** The starting definition of a new input of `type`, with what the schema requires. */
export function newInputDefinition(type: string): Json {
  switch (type) {
    case 'dropdown':
    case 'multi-dropdown':
    case 'radio':
    case 'checkbox-group':
      return {
        type,
        options: [
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
        ],
      }
    case 'group':
      return { type, items: {} }
    case 'list':
      return { type, template: { value: { type: 'string' } } }
    case 'header':
      return { type, text: '' }
    case 'step':
      return { type, title: '', options: {} }
    default:
      return { type }
  }
}

interface OptionRow {
  value: string
  label: string
  /** The value the row was read from, written back as it was while its text is unchanged. */
  original?: unknown
  /** Written as a bare value rather than a value/label pair. */
  bare?: boolean
  rest?: Json
}

interface OptionsDraft {
  /** byKey is the keyed dropdown the schema pairs with option-key; json is any other list. */
  mode: 'list' | 'expression' | 'byKey' | 'json'
  rows: OptionRow[]
  text: string
}

function optionsDraft(value: unknown): OptionsDraft {
  if (typeof value === 'string') {
    return { mode: 'expression', rows: [], text: value }
  }
  if (Array.isArray(value)) {
    const rows: OptionRow[] = []
    for (const item of value) {
      if (isScalar(item)) {
        rows.push({
          value: String(item),
          label: '',
          bare: true,
          original: item,
        })
      } else if (typeof item === 'object' && item !== null) {
        const { value: optionValue, label, ...rest } = item as Json
        if (!isScalar(optionValue) || (label !== undefined && !isScalar(label))) {
          return {
            mode: 'json',
            rows: [],
            text: JSON.stringify(value, null, 2),
          }
        }
        rows.push({
          value: String(optionValue),
          original: optionValue,
          label: text(label),
          ...(Object.keys(rest).length > 0 ? { rest } : {}),
        })
      }
    }
    return { mode: 'list', rows, text: '' }
  }
  if (value !== undefined && value !== null) {
    return { mode: 'byKey', rows: [], text: JSON.stringify(value, null, 2) }
  }
  return { mode: 'list', rows: [], text: '' }
}

function optionsValue(draft: OptionsDraft, labelled: boolean): unknown {
  if (draft.mode === 'expression') {
    return draft.text.trim() || undefined
  }
  if (draft.mode === 'byKey' || draft.mode === 'json') {
    return draft.text.trim() ? parseJson(draft.text).value : undefined
  }
  return draft.rows.map((row) => {
    const value = unchangedValue(row.value, row.original)
      ? row.original
      : parseScalar(row.value.trim())
    if (row.bare && !row.label.trim() && !row.rest) {
      return value
    }
    // A multi-select shows only labels, so it needs one on every option.
    const label = row.label.trim() || (labelled ? row.value.trim() : '')
    return {
      value,
      ...(label ? { label } : {}),
      ...row.rest,
    }
  })
}

function optionsError(
  draft: OptionsDraft,
  t: InputsEditorStrings,
  g: GraphEditorStrings,
): string | undefined {
  if (draft.mode === 'expression') {
    return draft.text.trim() ? expressionError(draft.text, g) : g.required
  }
  if (draft.mode === 'byKey' || draft.mode === 'json') {
    const parsed = parseJson(draft.text)
    if (!parsed.ok) {
      return g.invalidJson
    }
    if (draft.mode === 'json') {
      return Array.isArray(parsed.value) ? undefined : t.optionsJsonShape
    }
    const keyed = asRecord(parsed.value)
    return parsed.value === keyed &&
      Object.values(keyed).length > 0 &&
      Object.values(keyed).every(Array.isArray)
      ? undefined
      : t.optionsByKeyShape
  }
  return draft.rows.length === 0 || draft.rows.some((row) => !row.value.trim())
    ? t.needsOptions
    : undefined
}

function OptionsEditor({
  draft,
  onChange,
  error,
  keyed,
  described,
}: {
  draft: OptionsDraft
  onChange: (draft: OptionsDraft) => void
  error: string | undefined
  /** Offers options grouped by key, which only a dropdown takes. */
  keyed: boolean
  /** Each option also takes a description, as a checkbox shows one. */
  described: boolean
}) {
  const t = useInputsEditorStrings()
  const update = (i: number, patch: Partial<OptionRow>) =>
    onChange({
      ...draft,
      rows: draft.rows.map((row, j) => (j === i ? { ...row, ...patch } : row)),
    })
  // JSON is offered only for options the list can't show; an expression has its own switch.
  const modes = [
    { value: 'list' as const, label: t.optionsList },
    ...(keyed ? [{ value: 'byKey' as const, label: t.optionsByKey }] : []),
    ...(draft.mode === 'json' ? [{ value: 'json' as const, label: t.optionsJson }] : []),
  ]
  return (
    <div className="flex flex-col gap-2">
      {draft.mode !== 'expression' && modes.length > 1 && (
        <ChoiceButtons
          options={modes}
          value={draft.mode}
          onChange={(mode) => onChange({ ...draft, mode })}
        />
      )}
      {draft.mode === 'list' ? (
        <>
          {draft.rows.length > 0 && (
            <div aria-hidden="true" className="flex items-center gap-2 text-xs theme-muted-text">
              <div className="w-2/5">{t.optionValue}</div>
              <div className="flex-1">{t.optionLabel}</div>
              {described && <div className="flex-1">{t.optionDescription}</div>}
              <div className="w-7 shrink-0" />
            </div>
          )}
          {withPositionKeys(draft.rows).map(({ key, item: row }, i) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-2/5">
                <Input
                  mono
                  aria-label={t.optionValue}
                  placeholder={t.optionValue}
                  value={row.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              </div>
              <div className="flex-1">
                <Input
                  aria-label={t.optionLabel}
                  placeholder={t.optionLabel}
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </div>
              {described && (
                <div className="flex-1">
                  <Input
                    aria-label={t.optionDescription}
                    placeholder={t.optionDescription}
                    value={text(row.rest?.['description'])}
                    onChange={(e) => {
                      const { description: _old, ...rest } = row.rest ?? {}
                      update(i, {
                        rest: e.target.value ? { ...rest, description: e.target.value } : rest,
                      })
                    }}
                  />
                </div>
              )}
              <IconButton
                icon={<CloseIcon className="h-4 w-4" />}
                label={t.removeOption}
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...draft,
                    rows: draft.rows.filter((_, j) => j !== i),
                  })
                }
              />
            </div>
          ))}
          <AddRowButton
            label={t.addOption}
            onClick={() =>
              onChange({
                ...draft,
                rows: [...draft.rows, { value: '', label: '' }],
              })
            }
          />
        </>
      ) : draft.mode === 'expression' ? (
        <Input
          mono
          aria-label={t.fields.options}
          value={draft.text}
          onChange={(e) => onChange({ ...draft, text: e.target.value })}
        />
      ) : (
        <>
          <div className="text-xs theme-muted-text">
            {draft.mode === 'byKey' ? t.optionsByKeyHelp : t.optionsJsonHelp}
          </div>
          <Textarea
            mono
            aria-label={t.fields.options}
            rows={6}
            value={draft.text}
            placeholder={
              draft.mode === 'byKey'
                ? '{\n  "aws": ["us-east-1", "us-west-2"],\n  "google": ["us-central1"]\n}'
                : undefined
            }
            onChange={(e) => onChange({ ...draft, text: e.target.value })}
          />
        </>
      )}
      <FieldError message={error} />
    </div>
  )
}

/** For each option, the options ticking it also ticks. */
type ImpliesDraft = Record<string, string[]>

function impliesDraft(value: unknown): ImpliesDraft {
  return Object.fromEntries(
    Object.entries(asRecord(value)).map(([key, list]) => [
      key,
      Array.isArray(list) ? list.map((item) => String(item)) : [],
    ]),
  )
}

/** Each option with the others as switches: ticking that option in the form ticks these too. */
function ImpliesEditor({
  draft,
  options,
  onChange,
}: {
  draft: ImpliesDraft
  options: OptionRow[]
  onChange: (draft: ImpliesDraft) => void
}) {
  const t = useInputsEditorStrings()
  const listed = options.filter((option) => option.value.trim())
  if (listed.length < 2) {
    return <div className="text-xs theme-muted-text">{t.impliesNeedsOptions}</div>
  }
  const nameOf = (value: string) =>
    listed.find((option) => option.value === value)?.label.trim() || value
  const toggle = (from: string, to: string) => {
    const current = draft[from] ?? []
    onChange({
      ...draft,
      [from]: current.includes(to) ? current.filter((value) => value !== to) : [...current, to],
    })
  }
  return (
    <div className="flex flex-col gap-2">
      {listed.map((option) => (
        <div key={option.value} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm font-medium">{t.impliesWhen(nameOf(option.value))}</span>
          {listed
            .filter((other) => other.value !== option.value)
            .map((other) => {
              return (
                <FilterPill
                  key={other.value}
                  active={(draft[option.value] ?? []).includes(other.value)}
                  onClick={() => toggle(option.value, other.value)}
                >
                  {nameOf(other.value)}
                </FilterPill>
              )
            })}
        </div>
      ))}
    </div>
  )
}

/** A duration's checkbox that sends a set value in place of a time, such as -1 for none. */
function OptOutCheckbox({
  label,
  value,
  onLabel,
  onValue,
  errors,
}: {
  label: string
  value: string
  onLabel: (label: string) => void
  onValue: (value: string) => void
  errors: { label: string | undefined; value: string | undefined }
}) {
  const t = useInputsEditorStrings()
  const [on, setOn] = useState(label.trim() !== '' || value.trim() !== '')
  return (
    <div className="flex flex-col gap-3">
      <ToggleField
        label={t.fields.optOut}
        description={t.help.optOut}
        checked={on}
        onChange={(next) => {
          setOn(next)
          if (!next) {
            onLabel('')
            onValue('')
          }
        }}
      />
      {on && (
        <div className="flex flex-col gap-3 border-l theme-border pl-4">
          <Input
            {...labelled(t.fields.disableLabel, 'disableLabel')}
            description={t.help.disableLabel}
            value={label}
            error={errors.label}
            placeholder="Unlimited"
            onChange={(e) => onLabel(e.target.value)}
          />
          <Input
            mono
            {...labelled(t.fields.disableValue, 'disableValue')}
            description={t.help.disableValue}
            value={value}
            error={errors.value}
            placeholder="-1"
            onChange={(e) => onValue(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

function TypeSelect({
  value,
  onChange,
  allowStep,
  disabled,
}: {
  value: string
  onChange: (type: string) => void
  allowStep: boolean
  disabled: boolean
}) {
  const t = useInputsEditorStrings()
  const id = useId()
  const types = t.types as Record<string, string>
  const help = t.typeHelp as Record<string, string>
  const known = inputTypes().includes(value)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <label htmlFor={id} className="text-[0.8125rem] font-medium text-(--theme-app)">
          {t.inputType}
        </label>
        <KeyHint label={t.inputType} yamlKey="type" />
      </div>
      <Dropdown
        id={id}
        value={value}
        disabled={disabled}
        textBoxClassName={FIELD_TEXT_BOX}
        options={[
          ...(known ? [] : [{ label: value, value }]),
          ...INPUT_TYPE_GROUPS.map(([group, list]) => ({
            category: t.typeGroups[group],
            options: list
              .filter((type) => allowStep || type !== 'step' || value === 'step')
              .map((type) => ({ label: types[type] ?? type, value: type })),
          })),
        ]}
        onChange={(next) => {
          if (typeof next === 'string' && next) {
            onChange(next)
          }
        }}
      />
      <span className="text-xs text-(--theme-muted-text-color)">{help[value] ?? t.help.type}</span>
    </div>
  )
}

type Drafts = Record<string, unknown>

function effectiveKind(prop: Prop, original: unknown): Kind {
  if (original === undefined || original === null) {
    return prop.kind
  }
  if (
    typeof original === 'object' &&
    prop.nested &&
    prop.kind !== 'options' &&
    prop.kind !== 'template' &&
    prop.kind !== 'providers'
  ) {
    return 'json'
  }
  return prop.kind
}

interface ValuesDraft {
  /** A default the YAML sets by expression, kept as written. */
  expression: string | undefined
  values: string[]
}

interface RowsDraft {
  expression: string | undefined
  rows: Json[]
}

function listItemText(item: unknown): string {
  if (isScalar(item)) {
    return String(item)
  }
  const value = asRecord(item)['value']
  return isScalar(value) ? String(value) : JSON.stringify(item)
}

function draftOf(kind: Kind, value: unknown): unknown {
  switch (kind) {
    case 'flag':
      return typeof value === 'boolean' || typeof value === 'string' ? value : undefined
    case 'bool':
      return typeof value === 'boolean' ? value : undefined
    case 'json':
      return value === undefined ? '' : JSON.stringify(value, null, 2)
    case 'options':
      return optionsDraft(value)
    case 'providers':
      return Array.isArray(value) ? value.join(', ') : text(value)
    case 'template':
      return typeof value === 'string' ? value : asRecord(value)
    case 'implies':
      return impliesDraft(value)
    case 'rows':
      return typeof value === 'string'
        ? { expression: value, rows: [] }
        : {
            expression: undefined,
            rows: Array.isArray(value) ? value.map(asRecord) : [],
          }
    case 'duration':
      return typeof value === 'number' ? formatDuration(value) : text(value)
    case 'values':
      return typeof value === 'string' && EXPRESSION.test(value.trim())
        ? { expression: value, values: [] }
        : {
            expression: undefined,
            values: (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(
              listItemText,
            ),
          }
    default:
      // Only a wrong-shaped value lands here; it shows as JSON text rather than [object Object].
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return value.join('\n')
      }
      return value !== null && typeof value === 'object' ? JSON.stringify(value) : text(value)
  }
}

interface ValueContext {
  /** Options need labels, as a multi-select's do. */
  labelled?: boolean
}

function writtenValue(
  kind: Kind,
  draft: unknown,
  { labelled = false }: ValueContext = {},
): unknown {
  switch (kind) {
    case 'flag':
    case 'bool':
      return draft
    case 'json': {
      const raw = String(draft ?? '').trim()
      return raw ? parseJson(raw).value : undefined
    }
    case 'options':
      return optionsValue(draft as OptionsDraft, labelled)
    case 'values': {
      const list = draft as ValuesDraft
      if (list.expression !== undefined) {
        return list.expression.trim() || undefined
      }
      const values = list.values.map((value) => value.trim()).filter(Boolean)
      return values.length > 0 ? values.map(parseScalar) : undefined
    }
    case 'rows': {
      const list = draft as RowsDraft
      if (list.expression !== undefined) {
        return list.expression.trim() || undefined
      }
      // A field left empty in a default row is unset, not an empty string.
      const rows = list.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(
            ([, value]) => value !== '' && value !== undefined && value !== null,
          ),
        ),
      )
      return rows.length > 0 ? rows : undefined
    }
    case 'duration': {
      const raw = String(draft ?? '').trim()
      if (!raw) {
        return undefined
      }
      return EXPRESSION.test(raw) ? raw : (parseDuration(raw) ?? raw)
    }
    case 'ref':
    case 'choice':
      return String(draft ?? '').trim() || undefined
    case 'number': {
      const raw = String(draft ?? '').trim()
      if (!raw) {
        return undefined
      }
      return EXPRESSION.test(raw) ? raw : Number(raw)
    }
    case 'width': {
      const raw = String(draft ?? '').trim()
      if (!raw) {
        return undefined
      }
      return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw
    }
    case 'implies': {
      const entries = Object.entries(draft as ImpliesDraft).filter(
        ([, values]) => values.length > 0,
      )
      return entries.length > 0 ? Object.fromEntries(entries) : undefined
    }
    case 'providers': {
      const raw = String(draft ?? '').trim()
      if (!raw) {
        return undefined
      }
      return EXPRESSION.test(raw)
        ? raw
        : raw
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
    }
    case 'template':
      return typeof draft === 'string' ? draft.trim() || undefined : draft
    case 'textarea':
      return String(draft ?? '') === '' ? undefined : String(draft)
    default: {
      const raw = String(draft ?? '').trim()
      return raw ? raw : undefined
    }
  }
}

function valueError(
  prop: Prop,
  kind: Kind,
  draft: unknown,
  t: InputsEditorStrings,
  g: GraphEditorStrings,
): string | undefined {
  const value = writtenValue(kind, draft)
  if (prop.required && (value === undefined || value === '')) {
    return g.required
  }
  switch (kind) {
    case 'json': {
      const raw = String(draft ?? '').trim()
      const parsed = parseJson(raw)
      if (!raw) {
        return undefined
      }
      if (!parsed.ok) {
        return g.invalidJson
      }
      const list = Array.isArray(parsed.value)
      const object = !list && parsed.value === asRecord(parsed.value)
      return object || (list && prop.nested === 'any')
        ? undefined
        : prop.nested === 'any'
          ? t.jsonObjectOrList
          : t.jsonObject
    }
    case 'values': {
      const list = draft as ValuesDraft
      return list.expression !== undefined ? expressionError(list.expression, g) : undefined
    }
    case 'rows': {
      const list = draft as RowsDraft
      return list.expression !== undefined ? expressionError(list.expression, g) : undefined
    }
    case 'duration': {
      const raw = String(draft ?? '').trim()
      return raw && !EXPRESSION.test(raw) && parseDuration(raw) === null
        ? t.invalidDurationText
        : undefined
    }
    case 'number': {
      const raw = String(draft ?? '').trim()
      return raw && !EXPRESSION.test(raw) && !Number.isFinite(Number(raw))
        ? t.invalidNumber
        : undefined
    }
    case 'width':
      return value !== undefined && inputWidth(value) === undefined ? t.invalidWidth : undefined
    case 'flag':
      return flagError(draft as Flag, g)
    case 'options':
      return optionsError(draft as OptionsDraft, t, g)
    case 'ref': {
      const raw = String(draft ?? '').trim()
      if (!raw || EXPRESSION.test(raw)) {
        return undefined
      }
      // Some settings take only an expression, such as one reading a cluster input.
      if (prop.literal === false) {
        return g.invalidExpressionValue
      }
      return prop.choices && !prop.choices.includes(raw) ? g.invalidChoice(prop.key) : undefined
    }
    case 'choice': {
      const raw = String(draft ?? '').trim()
      return raw && prop.choices && !prop.choices.includes(raw)
        ? g.invalidChoice(prop.key)
        : undefined
    }
    case 'template':
      if (typeof draft === 'string') {
        return draft.trim() ? expressionError(draft, g) : g.required
      }
      return Object.keys(asRecord(draft)).length === 0 ? t.needsFields : undefined
    default:
      return prop.choices && typeof value === 'string' && !prop.choices.includes(value)
        ? g.invalidChoice(prop.key)
        : undefined
  }
}

/** A list's template fields, edited here since the form repeats them per row. */
function TemplateFields({
  fields,
  onChange,
  error,
  inputs,
  adopt,
  home,
}: {
  fields: Json
  onChange: (fields: Json) => void
  error: string | undefined
  inputs: Json
  adopt: (inputs: PendingInput[]) => void
  home: InputHome
}) {
  const t = useInputsEditorStrings()
  const { freeName } = useWorkflowEditing()
  const [editing, setEditing] = useState<{ name: string } | { create: true } | null>(null)
  const names = Object.keys(fields).filter((name) => name !== '$meta')
  const types = t.types as Record<string, string>
  const move = (from: number, to: number) => {
    const entries = Object.entries(fields)
    const [entry] = entries.splice(from, 1)
    if (entry) {
      entries.splice(to, 0, entry)
      onChange(Object.fromEntries(entries))
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      {names.length === 0 && <div className="text-xs theme-muted-text">{t.noFields}</div>}
      {names.map((name, i) => {
        const type = text(asRecord(fields[name])['type'])
        return (
          <div
            key={name}
            className="flex items-center gap-2 rounded-md border theme-border px-2 py-1 text-sm"
          >
            <span className="font-mono">{name}</span>
            <span className="rounded border theme-border px-1 text-xs theme-muted-text">
              {types[type] ?? type}
            </span>
            <div className="flex-1" />
            <IconButton
              icon={<EditIcon className="h-3.5 w-3.5" />}
              label={t.editInput}
              variant="ghost"
              size="sm"
              onClick={() => setEditing({ name })}
            />
            <IconButton
              icon={<ArrowUpIcon className="h-3.5 w-3.5" />}
              label={t.moveUp}
              variant="ghost"
              size="sm"
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            />
            <IconButton
              icon={<ArrowDownIcon className="h-3.5 w-3.5" />}
              label={t.moveDown}
              variant="ghost"
              size="sm"
              disabled={i === names.length - 1}
              onClick={() => move(i, i + 1)}
            />
            <IconButton
              icon={<TrashIcon className="h-3.5 w-3.5" />}
              label={t.deleteInput}
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange(Object.fromEntries(Object.entries(fields).filter(([key]) => key !== name)))
              }
            />
          </div>
        )
      })}
      <FieldError message={error} />
      <AddRowButton label={t.addField} onClick={() => setEditing({ create: true })} />
      {editing && (
        <InputDialog
          name={'name' in editing ? editing.name : nextFieldName(freeName, names)}
          definition={
            'name' in editing ? asRecord(fields[editing.name]) : newInputDefinition('string')
          }
          isNew={!('name' in editing)}
          siblings={names.filter((name) => !('name' in editing) || name !== editing.name)}
          allowStep={false}
          inputs={inputs}
          home={home}
          onClose={() => setEditing(null)}
          onSave={(name, definition, _patch, extra) => {
            adopt(extra)
            const entries = Object.entries(fields)
            if ('name' in editing) {
              onChange(
                Object.fromEntries(
                  entries.map(([key, value]) =>
                    key === editing.name ? [name, definition] : [key, value],
                  ),
                ),
              )
            } else {
              onChange({ ...fields, [name]: definition })
            }
          }}
        />
      )}
    </div>
  )
}

function nextFieldName(freeName: WorkflowEditing['freeName'], names: string[]): string {
  return freeName(names, (n) => `field_${n}`)
}

function ValuesField({
  label,
  draft,
  suggestions,
  onChange,
  error,
}: {
  label: string
  draft: ValuesDraft
  suggestions: string[]
  onChange: (draft: ValuesDraft) => void
  error: string | undefined
}) {
  const t = useInputsEditorStrings()
  if (draft.expression === undefined) {
    return (
      <StringListEditor
        values={draft.values}
        onChange={(values) => onChange({ ...draft, values })}
        addLabel={t.addValue}
        suggestions={suggestions}
        error={error}
      />
    )
  }
  return (
    <Input
      mono
      aria-label={label}
      value={draft.expression}
      error={error}
      onChange={(e) => onChange({ ...draft, expression: e.target.value })}
    />
  )
}

/** A list's default rows, entered through the same form a run shows. */
function RowsField({
  draft,
  template,
  label,
  onChange,
  error,
}: {
  draft: RowsDraft
  template: Json
  label: string
  onChange: (draft: RowsDraft) => void
  error: string | undefined
}) {
  const { convertInputs } = useWorkflowEngine()
  const formJSONs = useMemo(
    () => convertInputs({ rows: { type: 'list', label, template } }),
    [convertInputs, label, template],
  )
  // The list fills in row fields as it mounts; only what the user does counts as an edit.
  const touched = useRef(false)
  const touch = () => {
    touched.current = true
  }
  if (draft.expression !== undefined) {
    return (
      <Input
        mono
        aria-label={label}
        value={draft.expression}
        error={error}
        onChange={(e) => onChange({ ...draft, expression: e.target.value })}
      />
    )
  }
  return (
    <div
      className="flex flex-col gap-2 rounded-md border theme-border p-2"
      onClickCapture={touch}
      onInputCapture={touch}
      onKeyDownCapture={touch}
    >
      {/* This form previews the run form's list, so the editing rows around the dialog stay out of it. */}
      <FormEditingContext.Provider value={null}>
        <DynamicForm
          key={JSON.stringify(template)}
          formJSONs={formJSONs}
          initialValues={{ rows: draft.rows }}
          labelPosition="top"
          workflowForm
          setValues={(values) => {
            if (touched.current) {
              const rows = values['rows']
              onChange({
                expression: undefined,
                rows: Array.isArray(rows) ? rows.map(asRecord) : [],
              })
            }
          }}
        />
      </FormEditingContext.Provider>
      <FieldError message={error} />
    </div>
  )
}

function PropField({
  prop,
  kind,
  draft,
  original,
  error,
  onChange,
  suggestions,
  inputType,
  optionRows,
  source,
  adopt,
  allInputs,
  home,
  template,
  inputLabel,
}: {
  prop: Prop
  kind: Kind
  draft: unknown
  original: unknown
  error: string | undefined
  onChange: (draft: unknown) => void
  suggestions: string[]
  inputType: string
  optionRows: OptionRow[]
  source: InputSource
  adopt: (inputs: PendingInput[]) => void
  allInputs: Json
  home: InputHome
  /** The list's template as edited so far, for its default rows. */
  template: Json
  inputLabel: string
}) {
  const t = useInputsEditorStrings()
  const description = t.help[prop.help]
  const name = (t.fields as Record<string, string | undefined>)[prop.key] ?? prop.key
  const field = { label: name, yamlKey: prop.key, description }
  switch (kind) {
    case 'flag':
      return (
        <FlagField
          {...field}
          value={draft as Flag}
          original={original}
          fallback={prop.fallback ?? false}
          onChange={onChange}
          source={prop.conditional ? source : undefined}
        />
      )
    case 'ref':
      return (
        <ValueOrInputField
          {...field}
          value={String(draft ?? '')}
          onChange={onChange}
          source={source}
          types={prop.refTypes ?? []}
          literal={prop.literal ?? true}
          required={prop.required ?? false}
          error={error}
          suggestions={prop.choices ?? []}
        />
      )
    case 'bool': {
      const fallback = prop.fallback ?? false
      return (
        <div className="flex flex-col gap-1.5">
          <ToggleField
            {...field}
            checked={typeof draft === 'boolean' ? draft : fallback}
            onChange={(on) => onChange(on !== fallback ? on : original === on ? on : undefined)}
          />
          <FieldError message={error} />
        </div>
      )
    }
    case 'options': {
      const options = draft as OptionsDraft
      return (
        <LabelledField
          {...field}
          actions={
            <ExpressionToggle
              active={options.mode === 'expression'}
              onChange={(on) =>
                onChange({
                  ...options,
                  mode: on ? 'expression' : 'list',
                  text: '',
                })
              }
            />
          }
        >
          <OptionsEditor
            draft={draft as OptionsDraft}
            onChange={onChange}
            error={error}
            keyed={inputType === 'dropdown'}
            described={inputType === 'checkbox-group'}
          />
        </LabelledField>
      )
    }
    case 'values':
      return (
        <LabelledField
          {...field}
          actions={
            <ExpressionToggle
              active={(draft as ValuesDraft).expression !== undefined}
              onChange={(on) => onChange({ expression: on ? '' : undefined, values: [] })}
            />
          }
        >
          <ValuesField
            label={name}
            draft={draft as ValuesDraft}
            suggestions={
              inputType === 'multi-dropdown' || inputType === 'checkbox-group'
                ? optionRows.map((row) => row.value.trim()).filter(Boolean)
                : []
            }
            onChange={onChange}
            error={error}
          />
        </LabelledField>
      )
    case 'rows':
      return (
        <LabelledField
          {...field}
          actions={
            <ExpressionToggle
              active={(draft as RowsDraft).expression !== undefined}
              onChange={(on) => onChange({ expression: on ? '' : undefined, rows: [] })}
            />
          }
        >
          <RowsField
            draft={draft as RowsDraft}
            template={template}
            label={inputLabel}
            onChange={onChange}
            error={error}
          />
        </LabelledField>
      )
    case 'duration':
      return (
        <Input
          mono
          {...labelled(name, prop.key)}
          description={description}
          value={String(draft ?? '')}
          placeholder="HH:MM:SS"
          error={error}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'width':
      return (
        <Input
          mono
          {...labelled(name, prop.key)}
          description={description}
          value={String(draft ?? '')}
          placeholder="50%"
          error={error}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'template':
      return (
        <LabelledField
          {...field}
          actions={
            <ExpressionToggle
              active={typeof draft === 'string'}
              onChange={(on) => onChange(on ? '' : {})}
            />
          }
        >
          {typeof draft === 'string' ? (
            <Input
              mono
              aria-label={name}
              value={draft}
              error={error}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <TemplateFields
              fields={asRecord(draft)}
              onChange={onChange}
              error={error}
              inputs={allInputs}
              adopt={adopt}
              home={home}
            />
          )}
        </LabelledField>
      )
    case 'implies':
      return (
        <LabelledField {...field}>
          <ImpliesEditor draft={draft as ImpliesDraft} options={optionRows} onChange={onChange} />
        </LabelledField>
      )
    case 'choice': {
      const choiceLabels = (t.choices as Record<string, Record<string, string> | undefined>)[
        prop.key
      ]
      return (
        <LabelledField {...field}>
          <ChoiceButtons
            options={(prop.choices ?? []).map((choice) => ({
              value: choice,
              label: choiceLabels?.[choice] ?? choice,
            }))}
            value={String(draft ?? '') || (prop.choices?.[0] ?? '')}
            onChange={onChange}
          />
          <FieldError message={error} />
        </LabelledField>
      )
    }
    case 'json':
    case 'textarea':
      return prop.grow ? (
        <GrowingTextarea
          mono={!prop.prose}
          {...labelled(name, prop.key)}
          description={description}
          value={String(draft ?? '')}
          {...(error ? { error } : {})}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Textarea
          mono={!prop.prose}
          {...labelled(name, prop.key)}
          description={description}
          rows={kind === 'json' ? 4 : 6}
          value={String(draft ?? '')}
          {...(error ? { error } : {})}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      return (
        <SuggestedInput
          {...field}
          value={String(draft ?? '')}
          onChange={onChange}
          suggestions={prop.choices ?? (kind === 'language' ? LANGUAGES : suggestions)}
          error={error}
        />
      )
  }
}

function commonProp(key: CommonKey): Prop {
  if (key === 'width') {
    return { key, kind: 'width', help: 'width' }
  }
  const flag = (FLAG_FIELDS as readonly string[]).includes(key)
  return {
    key,
    kind: flag ? 'flag' : key === 'label' ? 'text' : 'textarea',
    help: key,
    ...(flag ? { conditional: true } : { prose: true }),
    ...(key === 'description' || key === 'tooltip' ? { grow: true } : {}),
  }
}

const COMMON_PROPS = ALL_COMMON.map(commonProp)

function isCommon(prop: Prop): boolean {
  return COMMON_PROPS.some((common) => draftKey(common) === draftKey(prop))
}

// Types may read the same key differently, such as a number or a text default.
function draftKey(prop: Prop): string {
  return `${prop.kind}:${prop.key}`
}

const ALL_PROPS: Prop[] = [
  ...new Map(
    [...COMMON_PROPS, ...Object.values(TYPE_PROPS).flat()].map((prop) => [draftKey(prop), prop]),
  ).values(),
]

/** An input a dialog creates when it saves, for a field that reads it. */
export interface PendingInput {
  name: string
  definition: Json
}

const SUGGESTED_NAMES: Record<string, string> = {
  'compute-clusters': 'cluster',
  'compute-resources': 'cluster',
  'slurm-accounts': 'account',
  'slurm-partitions': 'partition',
  'kubernetes-clusters': 'kubernetes_cluster',
  'kubernetes-namespaces': 'namespace',
  region: 'region',
  boolean: 'enabled',
  dropdown: 'choice',
  'multi-dropdown': 'choices',
  string: 'text',
}

export function allNames(editing: WorkflowEditing, map: Json, out: Set<string>): Set<string> {
  for (const [name, value] of Object.entries(map)) {
    out.add(name)
    const definition = asRecord(value)
    const childKey = editing.inputChildrenKey(definition['type'])
    if (childKey) {
      allNames(editing, asRecord(definition[childKey]), out)
    }
  }
  return out
}

function suggestedName(editing: WorkflowEditing, type: string, inputs: Json): string {
  const taken = allNames(editing, inputs, new Set())
  const base = SUGGESTED_NAMES[type]
  return base ? editing.nextName(taken, base) : editing.newInputName(taken)
}

/** Where a dialog puts the inputs it creates: the top level, or one wizard step. */
export interface InputHome {
  parent: string[]
  index?: number
}

// A wizard form draws only its steps, so new inputs join the last one.
function defaultHome(inputs: Json): InputHome {
  const wizard = asRecord(asRecord(inputs['$meta'])['wizard'])
  const steps = Object.entries(inputs).filter(
    ([name, value]) => name !== '$meta' && asRecord(value)['type'] === 'step',
  )
  const last = steps.at(-1)?.[0]
  return wizard['mode'] === 'wizard' && last ? { parent: [last] } : { parent: [] }
}

function homeContainer(editing: WorkflowEditing, inputs: Json, home: InputHome): Json {
  const [step] = home.parent
  if (!step) {
    return inputs
  }
  const key = editing.inputChildrenKey(text(asRecord(inputs[step])['type']))
  return key ? asRecord(asRecord(inputs[step])[key]) : {}
}

function withPending(
  editing: WorkflowEditing,
  inputs: Json,
  home: InputHome,
  pending: PendingInput[],
): Json {
  const added = Object.fromEntries(pending.map((input) => [input.name, input.definition]))
  const [step] = home.parent
  if (!step) {
    return { ...inputs, ...added }
  }
  const definition = asRecord(inputs[step])
  const key = editing.inputChildrenKey(text(definition['type'])) ?? 'options'
  return {
    ...inputs,
    [step]: {
      ...definition,
      [key]: { ...homeContainer(editing, inputs, home), ...added },
    },
  }
}

/** `edit` after the edits that add `created` at `home`, as one undo step. */
export function withCreatedInputs(
  editing: WorkflowEditing,
  created: PendingInput[],
  home: InputHome,
  edit: GraphEdit | null,
): GraphEdit | null {
  return editing.batchOf([
    ...created.map(
      (input, i): GraphEdit => ({
        type: 'addInput',
        parent: home.parent,
        ...(home.index !== undefined ? { index: home.index + i } : {}),
        name: input.name,
        definition: input.definition,
      }),
    ),
    ...(edit ? [edit] : []),
  ])
}

/** Inputs a dialog's fields can read, plus the ones it creates on save. */
export function useNewInputs(
  inputs: Json | undefined,
  home?: InputHome,
): {
  source: InputSource
  all: Json
  home: InputHome
  pending: PendingInput[]
  adopt: (created: PendingInput[]) => void
  dialog: ReactNode
  /** The form's edit with the inputs it made, or null when there's nothing to save. */
  save: (edit: GraphEdit | null) => GraphEdit | null
} {
  const editing = useWorkflowEditing()
  const root = asRecord(inputs)
  const place = home ?? defaultHome(root)
  const [pending, setPending] = useState<PendingInput[]>([])
  const [creating, setCreating] = useState<{
    type: string
    onCreated: (path: string[]) => void
  } | null>(null)
  const all = withPending(editing, root, place, pending)
  const source: InputSource = {
    refs: inputRefs(editing, all),
    create: (type, onCreated) => setCreating({ type, onCreated }),
  }
  const adopt = (created: PendingInput[]) => setPending((current) => [...current, ...created])
  const pathOf = (name: string) =>
    place.parent.length > 0 && !editing.wizardFlattens(root) ? [...place.parent, name] : [name]
  const dialog = creating ? (
    <InputDialog
      name={suggestedName(editing, creating.type, all)}
      definition={newInputDefinition(creating.type)}
      isNew
      lockedType
      siblings={[...allNames(editing, all, new Set())]}
      allowStep={false}
      inputs={all}
      home={place}
      onClose={() => setCreating(null)}
      onSave={(name, definition, _patch, extra) => {
        adopt([...extra, { name, definition }])
        creating.onCreated(pathOf(name))
      }}
    />
  ) : null
  return {
    source,
    all,
    home: place,
    pending,
    adopt,
    dialog,
    save: (edit) => withCreatedInputs(editing, pending, place, edit),
  }
}

/** Every setting of one input; `onSave` gets the whole definition and the change to it. */
interface InputDialogProps {
  name: string
  definition: Json
  isNew: boolean
  /** Names already taken in the same container. */
  siblings: string[]
  allowStep: boolean
  /** The workflow's inputs, for settings that read another input. */
  inputs?: Json | undefined
  /** Where inputs made for this dialog's settings will go. */
  home?: InputHome | undefined
  /** A new input made for one field keeps the type that field needs. */
  lockedType?: boolean
  /** `created` are inputs this dialog made for its own settings. */
  onSave: (
    name: string,
    definition: Json,
    patch: Required<FieldPatch>,
    created: PendingInput[],
  ) => void
  onDelete?: () => void
  onClose: () => void
  openOnAdd?: OpenOnAdd | undefined
}

/** Saving an input as YAML text; `path` and `source` give an existing input's text with its comments. */
export interface InputYaml {
  source?: string | undefined
  path?: InputPath | undefined
  onSave: (name: string, yaml: string) => void
}

/** An input's settings in a form, or as YAML when `yaml` says how to save it; switching carries the edits across. */
export function InputDialog({
  yaml,
  view,
  onViewChange,
  ...props
}: InputDialogProps & {
  yaml?: InputYaml | undefined
  view?: SettingsView | undefined
  onViewChange?: ((view: SettingsView) => void) | undefined
}) {
  return yaml ? (
    <InputViews {...props} textual={yaml} view={view} onViewChange={onViewChange} />
  ) : (
    <InputForm {...props} />
  )
}

function startingYaml(editing: WorkflowEditing, textual: InputYaml, definition: Json): string {
  if (textual.source !== undefined && textual.path) {
    try {
      return editing.inputYaml(textual.source, textual.path)
    } catch {
      // A definition the text can't be found for is shown as it's read.
    }
  }
  return editing.dumpYaml(definition)
}

function InputViews({
  textual,
  view,
  onViewChange,
  ...props
}: InputDialogProps & {
  textual: InputYaml
  view?: SettingsView | undefined
  onViewChange?: ((view: SettingsView) => void) | undefined
}) {
  const t = useInputsEditorStrings()
  const g = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const sections = useSectionMemory()
  const [original] = useState(() => (props.isNew ? {} : props.definition))
  const [opening] = useState(() => startingYaml(editing, textual, props.definition))
  // The YAML as last shown, and the settings the form starts from.
  const [shown, setShown] = useState(opening)
  const [base, setBase] = useState<Json>(props.definition)
  const [yaml, setYaml] = useState<string | null>(view === 'form' ? null : opening)
  const [name, setName] = useState(props.name)
  const [version, setVersion] = useState(0)
  const [problem, setProblem] = useState<string | undefined>()
  const draft = useRef<{ name: string; written: Json } | null>(null)
  const toYaml = () => {
    const current = draft.current
    if (current) {
      setName(current.name)
    }
    // The form's settings are written out again only when it changed them, so the text keeps its comments.
    const text =
      !current || isEmptyPatch(diffPatch(base, current.written))
        ? shown
        : editing.dumpYaml(current.written)
    setShown(text)
    setYaml(text)
    setProblem(undefined)
    onViewChange?.('yaml')
  }
  const toForm = () => {
    if (yaml === null) {
      return
    }
    const issue = yamlProblem(yaml, g, editing)
    if (issue) {
      setProblem(issue)
      return
    }
    setShown(yaml)
    setBase(asRecord(editing.loadYaml(yaml)))
    setYaml(null)
    setVersion((current) => current + 1)
    onViewChange?.('form')
  }
  const switcher = <ViewSwitch yaml={yaml !== null} onForm={toForm} onYaml={toYaml} />
  if (yaml === null) {
    return (
      <SectionMemory.Provider value={sections}>
        <InputForm
          key={version}
          {...props}
          name={name}
          definition={base}
          original={original}
          headerEnd={switcher}
          onDraft={(next, written) => {
            draft.current = { name: next, written }
          }}
        />
      </SectionMemory.Provider>
    )
  }
  const nextName = name.trim()
  const nameError = !editing.isValidInputName(nextName)
    ? t.invalidInputName
    : nextName !== props.name && props.siblings.includes(nextName)
      ? t.inputExists
      : undefined
  const dirty = props.isNew || nextName !== props.name || yaml !== opening
  return (
    <DialogShell
      title={t.editInput}
      onClose={props.onClose}
      dirty={dirty}
      saveDisabled={yamlProblem(yaml, g, editing) !== undefined || nameError !== undefined}
      onSubmit={() => {
        if (dirty) {
          textual.onSave(nextName, yaml)
        }
        props.onClose()
      }}
      headerEnd={switcher}
      openOnAdd={props.openOnAdd}
      {...(props.onDelete ? { footerStart: deleteButton(t, props) } : {})}
    >
      {/* The YAML holds the input's settings, not its key, so it's renamed here. */}
      <Input
        mono
        label={t.inputName}
        description={t.help.name}
        value={name}
        error={nameError}
        onChange={(e) => setName(e.target.value)}
      />
      <YamlPane
        path={INPUT_YAML_PATH}
        value={yaml}
        onChange={(text) => {
          setYaml(text)
          setProblem(undefined)
        }}
        problem={problem ?? yamlProblem(yaml, g, editing)}
        scoped={NO_SCOPED}
      />
    </DialogShell>
  )
}

function deleteButton(
  t: InputsEditorStrings,
  { onDelete, onClose }: Pick<InputDialogProps, 'onDelete' | 'onClose'>,
): ReactNode {
  return (
    <IconButton
      icon={<TrashIcon className="h-4 w-4" />}
      label={t.deleteInput}
      variant="ghost"
      size="sm"
      onClick={() => {
        onDelete?.()
        onClose()
      }}
    />
  )
}

function InputForm({
  name,
  definition,
  isNew,
  siblings,
  allowStep,
  inputs,
  home,
  lockedType = false,
  onSave,
  onDelete,
  onClose,
  openOnAdd,
  original: startOriginal,
  headerEnd,
  onDraft,
}: InputDialogProps & {
  /** What Save diffs against, when the form starts from settings edited as YAML. */
  original?: Json | undefined
  headerEnd?: ReactNode
  /** Called on each render with the name and settings Save would write. */
  onDraft?: ((name: string, written: Json) => void) | undefined
}) {
  const t = useInputsEditorStrings()
  const g = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const newInputs = useNewInputs(inputs, home)
  const [original] = useState(() => startOriginal ?? (isNew ? {} : definition))
  const [draftName, setDraftName] = useState(name)
  const [type, setType] = useState(() => text(definition['type']) || 'string')
  const [initial] = useState(() => {
    const out: Drafts = {}
    for (const prop of ALL_PROPS) {
      out[draftKey(prop)] = draftOf(effectiveKind(prop, definition[prop.key]), definition[prop.key])
    }
    return out
  })
  const [drafts, setDrafts] = useState<Drafts>(initial)
  const originalType = text(definition['type'])
  const optionsDraftNow = drafts[draftKey(OPTIONS)] as OptionsDraft | undefined
  const optionRows = optionsDraftNow?.mode === 'list' ? optionsDraftNow.rows : []
  // The schema has two dropdowns: a list with placeholder and autoselect, or options keyed by option-key.
  const keyedDropdown =
    type === 'dropdown' &&
    (optionsDraftNow?.mode === 'byKey' ||
      (optionsDraftNow?.mode === 'expression' &&
        String(drafts[draftKey(OPTION_KEY)] ?? '').trim() !== ''))
  // With multi on, a resource picker's default is a list, the way the form keeps its picks.
  const multi = drafts[draftKey(MULTI)] === true
  const shown = (prop: Prop) =>
    prop === RESOURCE_DEFAULTS
      ? multi
      : prop === RESOURCE_DEFAULT
        ? !multi
        : type !== 'dropdown'
          ? true
          : keyedDropdown
            ? prop.key !== 'placeholder' && prop.key !== 'autoselect'
            : prop.key !== 'option-key' || optionsDraftNow?.mode === 'expression'
  const settingProps = (TYPE_PROPS[type] ?? []).filter(shown)
  const props = [...commonKeys(type).map(commonProp), ...settingProps]
  const kindOf = (prop: Prop) => effectiveKind(prop, definition[prop.key])
  const context = { labelled: type === 'multi-dropdown' }
  // An untouched field keeps its YAML value exactly, so `5` isn't rewritten as '5'.
  const valueFor = (prop: Prop) => {
    const key = draftKey(prop)
    const kept = definition[prop.key]
    const becameList =
      kindOf(prop) === 'values' &&
      isScalar(kept) &&
      !(typeof kept === 'string' && EXPRESSION.test(kept.trim()))
    return sameValue(drafts[key], initial[key]) && !becameList
      ? kept
      : writtenValue(kindOf(prop), drafts[key], context)
  }
  const optionValues =
    type === 'dropdown' || type === 'radio' ? optionRows.map((row) => row.value) : []
  const slider = type === 'number' && valueFor(SLIDER) === true

  const trimmedName = draftName.trim()
  const errors: Record<string, string | undefined> = {
    name: !editing.isValidInputName(trimmedName)
      ? t.invalidInputName
      : siblings.includes(trimmedName) ||
          newInputs.pending.some((input) => input.name === trimmedName)
        ? t.inputExists
        : undefined,
  }
  for (const prop of props) {
    const key = draftKey(prop)
    const required =
      prop.required ||
      (keyedDropdown && optionsDraftNow?.mode === 'byKey' && prop === OPTION_KEY) ||
      (slider && ['min', 'max', 'step'].includes(prop.key))
    errors[key] =
      sameValue(drafts[key], initial[key]) && !required
        ? undefined
        : valueError({ ...prop, required }, kindOf(prop), drafts[key], t, g)
  }
  // A flattened group's fields sit beside it, so they can't share a name with its neighbours.
  const clash =
    type === 'group' && drafts[draftKey(FLATTEN)] === true
      ? Object.keys(asRecord(definition['items'])).find((child) => siblings.includes(child))
      : undefined
  if (clash) {
    errors[draftKey(FLATTEN)] = t.flattenClash(clash)
  }
  if (type === 'duration') {
    const hasLabel = valueFor(DISABLE_LABEL) !== undefined
    if (hasLabel !== (valueFor(DISABLE_VALUE) !== undefined)) {
      errors[draftKey(hasLabel ? DISABLE_VALUE : DISABLE_LABEL)] = t.disableNeedsBoth
    }
  }

  const nextDefinition = (): Json => {
    const next: Json = { type }
    for (const prop of props) {
      next[prop.key] = valueFor(prop)
    }
    const childKey = editing.inputChildrenKey(type)
    const previousKey = editing.inputChildrenKey(originalType)
    if (childKey && childKey !== 'template') {
      next[childKey] =
        (previousKey ? definition[previousKey] : undefined) ?? definition[childKey] ?? {}
    }
    // The schema takes one dropdown variant, so the other one's settings go.
    for (const prop of TYPE_PROPS[type] ?? []) {
      if (!settingProps.some((other) => other.key === prop.key)) {
        next[prop.key] = undefined
      }
    }
    // Settings this dialog doesn't show are kept, unless the type changed and they no longer apply.
    if (type !== originalType) {
      for (const key of Object.keys(original)) {
        if (!Object.hasOwn(next, key) && KNOWN_KEYS.has(key)) {
          next[key] = undefined
        }
      }
    }
    return next
  }

  const next = nextDefinition()
  const patch = diffPatch(original, next)
  const renamed = trimmedName !== name
  const dirty = isNew || renamed || !isEmptyPatch(patch)
  const invalid = Object.values(errors).some(Boolean)
  const setDraft = (key: string, value: unknown) =>
    setDrafts((current) => ({ ...current, [key]: value }))
  const changeType = (next: string) => {
    setType(next)
    if (!isNew) {
      return
    }
    // A new input starts from what the schema requires of its type.
    const seeded = newInputDefinition(next)
    for (const prop of TYPE_PROPS[next] ?? []) {
      const key = draftKey(prop)
      if (seeded[prop.key] !== undefined && sameValue(drafts[key], initial[key])) {
        setDraft(key, draftOf(prop.kind, seeded[prop.key]))
      }
    }
  }
  const renderProp = (prop: Prop) => (
    <PropField
      key={draftKey(prop)}
      prop={prop}
      kind={kindOf(prop)}
      draft={drafts[draftKey(prop)]}
      original={definition[prop.key]}
      error={errors[draftKey(prop)]}
      onChange={(value) => setDraft(draftKey(prop), value)}
      suggestions={prop.key === 'default' ? optionValues : []}
      inputType={type}
      optionRows={optionRows}
      source={newInputs.source}
      adopt={newInputs.adopt}
      allInputs={newInputs.all}
      home={newInputs.home}
      template={asRecord(drafts[draftKey(TEMPLATE)])}
      inputLabel={String(drafts[draftKey(commonProp('label'))] ?? '').trim() || trimmedName}
    />
  )
  const textProps = props.filter(
    (prop) =>
      ((TEXT_FIELDS as readonly string[]).includes(prop.key) || prop.key === 'width') &&
      isCommon(prop),
  )
  const behaviorProps = props.filter(
    (prop) => (FLAG_FIELDS as readonly string[]).includes(prop.key) && isCommon(prop),
  )
  // As in the job and step dialogs, a section starts open only when it holds something.
  const holds = (prop: Prop) => original[prop.key] !== undefined
  const erred = (prop: Prop) => errors[draftKey(prop)] !== undefined
  const fieldOpen = isNew || textProps.some(holds)
  const settingsOpen = settingProps.some((prop) => prop.required || holds(prop))

  const written = withoutUndefined(next)
  onDraft?.(trimmedName, written)

  return (
    <DialogShell
      title={t.editInput}
      onClose={onClose}
      dirty={dirty}
      locked={newInputs.dialog !== null}
      saveDisabled={invalid}
      onSubmit={() => {
        if (dirty) {
          onSave(trimmedName, written, patch, newInputs.pending)
        }
        onClose()
      }}
      headerEnd={headerEnd}
      openOnAdd={openOnAdd}
      {...(onDelete ? { footerStart: deleteButton(t, { onDelete, onClose }) } : {})}
    >
      <Input
        autoFocus
        mono
        label={t.inputName}
        description={t.help.name}
        value={draftName}
        error={errors['name']}
        onChange={(e) => setDraftName(e.target.value)}
      />
      <TypeSelect value={type} onChange={changeType} allowStep={allowStep} disabled={lockedType} />
      {!isNew && originalType && type !== originalType && (
        <div className="text-xs theme-muted-text">{t.typeChangeNote}</div>
      )}
      {textProps.length > 0 && (
        <Section title={t.sectionField} open={fieldOpen} alert={textProps.some(erred)}>
          {textProps.map(renderProp)}
        </Section>
      )}
      {settingProps.length > 0 && (
        <Section title={t.sectionSettings} open={settingsOpen} alert={settingProps.some(erred)}>
          {settingProps.map((prop) =>
            prop === DISABLE_VALUE ? null : prop === DISABLE_LABEL ? (
              <OptOutCheckbox
                key="opt-out"
                label={String(drafts[draftKey(DISABLE_LABEL)] ?? '')}
                value={String(drafts[draftKey(DISABLE_VALUE)] ?? '')}
                onLabel={(next) => setDraft(draftKey(DISABLE_LABEL), next)}
                onValue={(next) => setDraft(draftKey(DISABLE_VALUE), next)}
                errors={{
                  label: errors[draftKey(DISABLE_LABEL)],
                  value: errors[draftKey(DISABLE_VALUE)],
                }}
              />
            ) : (
              renderProp(prop)
            ),
          )}
        </Section>
      )}
      {behaviorProps.length > 0 && (
        <Section
          title={t.sectionBehavior}
          open={behaviorProps.some(holds)}
          alert={behaviorProps.some(erred)}
        >
          {behaviorProps.map(renderProp)}
        </Section>
      )}
      {newInputs.dialog}
    </DialogShell>
  )
}

/** A compact type chip for rows that list inputs. */
export function TypeBadge({ type }: { type: string }) {
  const t = useInputsEditorStrings()
  const types = t.types as Record<string, string>
  return (
    <span className={cx('rounded border theme-border px-1 text-[11px] leading-4 theme-muted-text')}>
      {types[type] ?? (type || '?')}
    </span>
  )
}
