import type { GraphEdit, InputPath, WorkflowEditing } from '../editing'

type Json = Record<string, unknown>

const asRecord = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}

/** Whether a list of inputs is drawn as a wizard, one step at a time. */
export function isWizard(list: unknown): boolean {
  return asRecord(asRecord(asRecord(list)['$meta'])['wizard'])['mode'] === 'wizard'
}

const isStep = (definition: unknown) => asRecord(definition)['type'] === 'step'

/**
 * What splitting a form into pages adds besides its `$meta`: a wizard draws only its steps, so the
 * inputs outside one go into a first step, and a form with no steps gets one to show.
 */
export function firstPageEdits(
  editing: WorkflowEditing,
  inputs: unknown,
  title: string,
): GraphEdit[] {
  const list = asRecord(inputs)
  const names = Object.keys(list).filter((name) => !name.startsWith('$'))
  const loose = names.filter((name) => !isStep(list[name]))
  if (loose.length === 0 && names.length > 0) {
    return []
  }
  const page = editing.nextName(names, 'step_1')
  return [
    { type: 'addInput', parent: [], index: 0, name: page, definition: newStep(title) },
    ...(loose.length > 0
      ? [
          {
            type: 'moveInputs' as const,
            paths: loose.map((name) => [name]),
            parent: [page],
            index: 0,
          },
        ]
      : []),
  ]
}

/** The edits that split a form into pages, keeping any wizard settings it already has. */
export function splitIntoPagesEdits(
  editing: WorkflowEditing,
  inputs: unknown,
  title: string,
): GraphEdit[] {
  const wizard = asRecord(asRecord(asRecord(inputs)['$meta'])['wizard'])
  return [
    { type: 'updateWorkflow', inputsMeta: { set: { wizard: { ...wizard, mode: 'wizard' } } } },
    ...firstPageEdits(editing, inputs, title),
  ]
}

/**
 * A wizard step added where the inputs aren't a wizard comes as a wizard of its own: a group whose
 * fields are read as the form's own, holding the step.
 */
export function wizardGroupDefinition(label: string, title: string): Json {
  return {
    type: 'group',
    label,
    flatten: true,
    items: { $meta: { wizard: { mode: 'wizard' } }, step_1: newStep(title) },
  }
}

function newStep(title: string): Json {
  return { type: 'step', title, options: {} }
}

/** Whether a wizard step added in `parent` can show: anywhere but a list's rows. */
export function stepAllowedIn(definitionAt: (path: InputPath) => Json, parent: InputPath): boolean {
  return parent.length === 0 || definitionAt(parent)['type'] !== 'list'
}
