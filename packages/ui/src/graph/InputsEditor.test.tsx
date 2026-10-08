// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import * as parser from '@parallelworks/workflow-parser'
import { convertToDynamicForm } from '@parallelworks/workflow-parser'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The editor calls useWorkflowEngine(), which throws outside a UIProvider carrying one.
vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

// jsdom has no PointerEvent; without it pointer events lose button and coordinates.
if (!('PointerEvent' in window)) {
  Object.defineProperty(window, 'PointerEvent', { value: MouseEvent })
}

vi.mock('@parallelworks/workflow-parser', async () => ({
  ...(await vi.importActual<typeof import('@parallelworks/workflow-parser')>(
    '@parallelworks/workflow-parser',
  )),
  parseStringsOfObj: vi.fn(({ obj }: { obj: unknown }) => obj),
  parseStringsOfObjReady: true,
  callWhenParserInitialized: vi.fn((cb: (ready: boolean) => void) => {
    cb(true)
    return () => {}
  }),
  initializeParseStringsOfObj: vi.fn(() => Promise.resolve()),
}))

// Monaco can't run in jsdom; a textarea stands in, labelled by the model path.
vi.mock('../editor/Monaco', () => ({
  default: ({
    value,
    onChange,
    path,
  }: {
    value?: string
    onChange?: (value: string) => void
    path?: string
  }) => <textarea aria-label={path} value={value} onChange={(e) => onChange?.(e.target.value)} />,
}))
vi.mock('../components/Dropdown', () => import('../test/DropdownStandIn'))

import { DynamicForm } from '../form/Form'
import { suggestionsOf } from '../test/DropdownStandIn'
import ListStandIn from '../test/ListStandIn'
import type { DependencyGraphEditor, EditorProblem } from './editorApi'
import { GRAPH_EDITOR_STRINGS, INPUTS_EDITOR_STRINGS } from './editorStrings'
import { INPUT_TYPE_GROUPS, InputDialog, inputTypes, offeredInputKeys } from './InputDialog'
import { InputsFormEditor } from './InputsEditor'

afterEach(cleanup)

const INPUTS = {
  name: { type: 'string', label: 'Name' },
  secret: { type: 'string', hidden: true },
  settings: {
    type: 'group',
    label: 'Settings',
    items: { size: { type: 'number', label: 'Size' } },
  },
}

function editor(overrides: Partial<DependencyGraphEditor> = {}): DependencyGraphEditor {
  return {
    onEdit: vi.fn(() => ({ yml: '', layout: undefined })),
    canUndo: true,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    // Most of these drive the form; the dialog opens as YAML unless told otherwise.
    settingsView: 'form',
    ...overrides,
  }
}

function renderForm(e: DependencyGraphEditor, inputs = INPUTS) {
  return render(
    <InputsFormEditor editor={e} inputs={inputs}>
      <DynamicForm formJSONs={convertToDynamicForm(inputs)} initialValues={{}} workflowForm />
    </InputsFormEditor>,
  )
}

function row(path: string[]): HTMLElement {
  const el = document.querySelector(`[data-input-path='${JSON.stringify(path)}']`)
  if (!(el instanceof HTMLElement)) {
    throw new Error(`no row for ${path.join('.')}`)
  }
  return el
}

// The add menu lists types by group; the types these tests add are all basic ones.
function pickType(label: string) {
  const menu = screen.getByRole('menu')
  fireEvent.click(within(menu).getByText('Basic'))
  fireEvent.click(within(menu).getByText(label))
}

// The suggestions a field offers, as the dropdown stand-in lists them.
describe('InputsFormEditor', () => {
  it('gives every input a row, hidden and grouped ones included', () => {
    renderForm(editor())
    expect(within(row(['name'])).getByText('Text')).toBeInTheDocument()
    expect(within(row(['secret'])).getByText('hidden')).toBeInTheDocument()
    expect(within(row(['settings', 'size'])).getByText('Number')).toBeInTheDocument()
    expect(screen.getByText('Add input')).toBeInTheDocument()
    expect(screen.getByText('Add field')).toBeInTheDocument()
  })

  it('adds an input of the picked type at the end once its dialog saves', () => {
    const e = editor()
    renderForm(e)
    fireEvent.click(screen.getByText('Add input'))
    pickType('Number')
    expect(screen.getByLabelText('Name')).toHaveValue('input_1')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'addInput',
      parent: [],
      index: 3,
      name: 'input_1',
      definition: { type: 'number' },
    })
  })

  it('lists the type groups and finds any type by search', () => {
    renderForm(editor())
    fireEvent.click(screen.getByText('Add input'))
    const menu = screen.getByRole('menu')
    const types = INPUTS_EDITOR_STRINGS.types as Record<string, string>
    const labels = () =>
      within(menu)
        .getAllByRole('button')
        .map((button) => button.textContent)
    expect(labels()).toEqual(
      INPUT_TYPE_GROUPS.map(([group]) => INPUTS_EDITOR_STRINGS.typeGroups[group]),
    )
    const search = within(menu).getByRole('searchbox', { name: 'Search types' })
    expect(search).toHaveFocus()
    fireEvent.change(search, { target: { value: 'nothing like it' } })
    expect(within(menu).getByText('No matching types')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'kubernetes-pv' } })
    expect(labels()).toEqual([types['kubernetes-pvc']])
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(screen.getByLabelText('Type')).toHaveValue(types['kubernetes-pvc'])
  })

  it('lists the form’s gestures and keys from its toolbar', () => {
    renderForm(editor())
    fireEvent.click(screen.getByRole('button', { name: 'Shortcuts' }))
    const list = screen.getByRole('dialog', { name: 'Shortcuts' })
    expect(within(list).getByText(GRAPH_EDITOR_STRINGS.shortcutDoes.moveInput)).toBeInTheDocument()
  })

  it('scrolls a picked problem’s input into view and opens it', () => {
    let show: ((problem: EditorProblem) => boolean) | undefined
    renderForm(
      editor({
        registerShow: (next) => {
          show = next
          return () => {}
        },
      }),
    )
    const row = document.querySelector('[data-input-path=\'["name"]\']') as HTMLElement
    const scroll = vi.fn()
    row.scrollIntoView = scroll
    act(() => {
      expect(show?.({ message: '', line: 3, input: ['name'] })).toBe(true)
    })
    expect(scroll).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog', { name: 'Edit input' })).toBeInTheDocument()
    expect(show?.({ message: '', line: 3, input: ['nowhere'] })).toBe(false)
  })

  it('adds a field inside a group', () => {
    const e = editor()
    renderForm(e)
    fireEvent.click(screen.getByText('Add field'))
    pickType('Switch')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'addInput',
        parent: ['settings'],
        index: 1,
        definition: { type: 'boolean' },
      }),
    )
  })

  it('takes focus back after an edit from a row, so undo keys still reach the form', async () => {
    const e = editor()
    renderForm(e)
    const form = row(['name']).closest<HTMLElement>('[tabindex="0"]') as HTMLElement
    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Delete input' }))
    await waitFor(() => expect(form).toHaveFocus())
    fireEvent.keyDown(form, { key: 'z', metaKey: true })
    expect(e.onUndo).toHaveBeenCalledOnce()
  })

  it('removes, moves and edits from a row', () => {
    const e = editor()
    renderForm(e)
    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Delete input' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'deleteInput',
      path: ['name'],
    })

    fireEvent.contextMenu(row(['name']), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Move down'))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['name']],
      parent: [],
      index: 2,
    })

    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Edit input' }))
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Full name' },
    })
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'full_name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateInput',
      path: ['name'],
      name: 'full_name',
      set: { label: 'Full name' },
      unset: [],
    })
  })

  it('lists the fields of a hidden group so they stay editable', () => {
    const e = editor()
    renderForm(e, {
      ...INPUTS,
      advanced: {
        type: 'group',
        hidden: true,
        items: { depth: { type: 'number' } },
      },
    } as typeof INPUTS)
    expect(within(row(['advanced'])).getAllByText('hidden')).toHaveLength(1)
    expect(within(row(['advanced', 'depth'])).queryByText('hidden')).toBeNull()
    const adds = within(row(['advanced'])).getAllByText('Add field')
    fireEvent.click(adds[0] as HTMLElement)
    pickType('Text')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'addInput', parent: ['advanced'] }),
    )
  })

  it('edits every wizard page at once', () => {
    renderForm(editor(), {
      $meta: { wizard: { mode: 'wizard' } },
      first: {
        type: 'step',
        title: 'First',
        options: { a: { type: 'string' } },
      },
      second: {
        type: 'step',
        title: 'Second',
        options: { b: { type: 'string' } },
      },
    } as unknown as typeof INPUTS)
    expect(row(['first', 'a'])).toBeInTheDocument()
    expect(row(['second', 'b'])).toBeInTheDocument()
    expect(within(row(['second'])).getByText('Wizard step')).toBeInTheDocument()
  })

  it('offers the form’s inputs to a setting that reads one', () => {
    const e = editor()
    renderForm(e, {
      cluster: { type: 'compute-clusters', label: 'Cluster' },
      partition: { type: 'slurm-partitions', resource: '' },
    } as unknown as typeof INPUTS)
    fireEvent.click(within(row(['partition'])).getByRole('button', { name: 'Edit input' }))
    const resource = screen.getByLabelText('Cluster')
    expect(suggestionsOf(resource).map((option) => [option.value, option.label])).toEqual([
      ['${{ inputs.cluster }}', 'Cluster'],
    ])
    // Only an expression reads another input.
    fireEvent.change(resource, { target: { value: 'cluster' } })
    expect(screen.getByText(GRAPH_EDITOR_STRINGS.invalidExpressionValue)).toBeInTheDocument()
    fireEvent.change(resource, { target: { value: '${{ inputs.cluster }}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateInput',
      path: ['partition'],
      set: { resource: '${{ inputs.cluster }}' },
      unset: [],
    })
  })

  it('adds an input made for a setting just before the field that reads it', () => {
    const e = editor()
    renderForm(e, {
      name: { type: 'string' },
      partition: { type: 'slurm-partitions', resource: '' },
    } as unknown as typeof INPUTS)
    fireEvent.click(within(row(['partition'])).getByRole('button', { name: 'Edit input' }))
    fireEvent.click(screen.getByRole('button', { name: 'New Cluster input…' }))
    const dialogs = screen.getAllByRole('dialog')
    const created = dialogs[dialogs.length - 1] as HTMLElement
    expect(within(created).getByLabelText('Name')).toHaveValue('cluster')
    fireEvent.click(within(created).getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'addInput',
          parent: [],
          index: 1,
          name: 'cluster',
          definition: { type: 'compute-clusters' },
        },
        {
          type: 'updateInput',
          path: ['partition'],
          set: { resource: '${{ inputs.cluster }}' },
          unset: [],
        },
      ],
    })
  })

  it('keeps an input made in a wizard inside the step that reads it', () => {
    const e = editor()
    renderForm(e, {
      $meta: { wizard: { mode: 'wizard' } },
      first: {
        type: 'step',
        title: 'First',
        options: { partition: { type: 'slurm-partitions', resource: '' } },
      },
    } as unknown as typeof INPUTS)
    fireEvent.click(
      within(row(['first', 'partition'])).getByRole('button', {
        name: 'Edit input',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'New Cluster input…' }))
    const dialogs = screen.getAllByRole('dialog')
    const created = dialogs[dialogs.length - 1] as HTMLElement
    fireEvent.click(within(created).getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'addInput',
          parent: ['first'],
          index: 0,
          name: 'cluster',
          definition: { type: 'compute-clusters' },
        },
        {
          type: 'updateInput',
          path: ['first', 'partition'],
          set: { resource: '${{ inputs.cluster }}' },
          unset: [],
        },
      ],
    })
  })

  it('keeps each row’s index current when the inputs are reordered', () => {
    const e = editor()
    const { rerender } = renderForm(e)
    const reordered = {
      settings: INPUTS.settings,
      name: INPUTS.name,
      secret: INPUTS.secret,
    }
    rerender(
      <InputsFormEditor editor={e} inputs={reordered}>
        <DynamicForm formJSONs={convertToDynamicForm(reordered)} initialValues={{}} workflowForm />
      </InputsFormEditor>,
    )
    expect(row(['settings']).dataset['inputIndex']).toBe('0')
    expect(row(['name']).dataset['inputIndex']).toBe('1')
    expect(row(['secret']).dataset['inputIndex']).toBe('2')
  })

  it('follows two inputs with the same definition when they trade places', () => {
    const e = editor()
    const first = { x: { type: 'string' }, y: { type: 'string' } }
    const { rerender } = renderForm(e, first as unknown as typeof INPUTS)
    const swapped = { y: { type: 'string' }, x: { type: 'string' } }
    rerender(
      <InputsFormEditor editor={e} inputs={swapped}>
        <DynamicForm formJSONs={convertToDynamicForm(swapped)} initialValues={{}} workflowForm />
      </InputsFormEditor>,
    )
    const paths = [...document.querySelectorAll('[data-input-path]')].map((el) =>
      el.getAttribute('data-input-path'),
    )
    expect(paths).toEqual(['["y"]', '["x"]'])
  })

  it('opens a row’s toolbar above its field only while the pointer is over that row', () => {
    renderForm(editor())
    // The strip the toolbar opens in, which sits above the field rather than over it.
    const toolbar = (path: string[]) =>
      within(row(path)).getAllByRole('button', { name: 'Edit input' })[0]?.parentElement
        ?.parentElement as HTMLElement
    expect(toolbar(['name'])).toHaveClass('h-0')
    expect(toolbar(['name'])).not.toHaveClass('absolute')
    fireEvent.pointerOver(row(['name']))
    expect(toolbar(['name'])).toHaveClass('h-7')
    fireEvent.pointerOver(row(['settings', 'size']))
    expect(toolbar(['name'])).toHaveClass('h-0')
    expect(toolbar(['settings', 'size'])).toHaveClass('h-7')
    expect(toolbar(['settings'])).toHaveClass('h-0')
  })

  it('opens an input as YAML and saves the text as written', async () => {
    const e = editor({ settingsView: 'yaml' })
    renderForm(e)
    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Edit input' }))
    const text = await screen.findByLabelText('file:///workflow-input.yaml')
    expect(text).toHaveValue('type: string\nlabel: Name\n')
    fireEvent.change(text, {
      target: { value: 'type: string\nlabel: Full name # shown\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'setInputYaml',
      path: ['name'],
      yaml: 'type: string\nlabel: Full name # shown\n',
    })
  })

  it('renames an input from its YAML view', async () => {
    const e = editor({ settingsView: 'yaml' })
    renderForm(e)
    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Edit input' }))
    await screen.findByLabelText('file:///workflow-input.yaml')
    const name = screen.getByLabelText('Name')
    expect(name).toHaveValue('name')
    fireEvent.change(name, { target: { value: 'settings' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(name, { target: { value: 'full_name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'updateInput', path: ['name'], name: 'full_name' },
        {
          type: 'setInputYaml',
          path: ['full_name'],
          yaml: 'type: string\nlabel: Name\n',
        },
      ],
    })
  })

  it('carries YAML edits into the form, which saves them with its own', async () => {
    const onSettingsViewChange = vi.fn()
    const e = editor({ settingsView: 'yaml', onSettingsViewChange })
    renderForm(e)
    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Edit input' }))
    fireEvent.change(await screen.findByLabelText('file:///workflow-input.yaml'), {
      target: { value: 'type: string\nlabel: Full name\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Form' }))
    expect(onSettingsViewChange).toHaveBeenCalledWith('form')
    expect(screen.getByLabelText('Label')).toHaveValue('Full name')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'updateInput',
        path: ['name'],
        set: { label: 'Full name' },
      }),
    )
  })

  it('adds an input straight away when new ones skip their dialog', () => {
    const e = editor({ openOnAdd: false, onOpenOnAddChange: vi.fn() })
    renderForm(e)
    fireEvent.click(screen.getByText('Add input'))
    pickType('Number')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'addInput',
      parent: [],
      index: 3,
      name: 'input_1',
      definition: { type: 'number' },
    })
  })

  it('shows an empty state with an add button for a form without inputs', () => {
    renderForm(editor(), {} as typeof INPUTS)
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.noInputs)).toBeInTheDocument()
    expect(screen.getByText('Add input')).toBeInTheDocument()
  })
})

describe('InputDialog', () => {
  function open(
    definition: Record<string, unknown>,
    options: {
      isNew?: boolean
      siblings?: string[]
      inputs?: Record<string, unknown>
    } = {},
  ) {
    const onSave = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={definition}
        isNew={options.isNew ?? false}
        siblings={options.siblings ?? []}
        allowStep
        inputs={options.inputs}
        onSave={onSave}
        onClose={() => {}}
      />,
    )
    return onSave
  }

  // Like the job and step dialogs: a section starts open only when it holds something.
  it('opens only the sections that hold something', () => {
    const openSections = () =>
      [...document.querySelectorAll('details')]
        .filter((section) => section.open)
        .map((section) => section.querySelector('summary')?.textContent)
    open({ type: 'string' })
    expect(openSections()).toEqual([])
    cleanup()
    open({ type: 'string', label: 'Dataset', optional: true })
    expect(openSections()).toEqual(['Field', 'Behavior'])
    cleanup()
    // A dropdown can't do without its options, so its settings start open.
    open({ type: 'dropdown', options: ['a'] })
    expect(openSections()).toEqual(['Settings'])
    cleanup()
    open({ type: 'string' }, { isNew: true })
    expect(openSections()).toEqual(['Field'])
    // Nothing folds or unfolds on its own later, except to show a problem that blocks Save.
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'zone' },
    })
    expect(openSections()).toEqual(['Field', 'Settings'])
  })

  it('takes an expression in number and duration settings', () => {
    let onSave = open({ type: 'number' })
    fireEvent.change(screen.getByLabelText('Minimum'), {
      target: { value: '${{ inputs.low }}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'number', min: '${{ inputs.low }}' },
      expect.anything(),
      [],
    )
    cleanup()
    onSave = open({ type: 'duration' })
    fireEvent.change(screen.getByLabelText('Default'), {
      target: { value: '${{ inputs.limit }}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'duration', default: '${{ inputs.limit }}' },
      expect.anything(),
      [],
    )
  })

  it('switches options and a hidden flag to expressions from the form', () => {
    const onSave = open({ type: 'dropdown', options: ['a'] })
    const toggles = () => screen.getAllByRole('button', { name: 'Use an expression instead' })
    // The options' switch comes first, then the flags in Behavior.
    fireEvent.click(toggles()[0] as HTMLElement)
    fireEvent.change(screen.getByLabelText('Options'), {
      target: { value: '${{ inputs.choices }}' },
    })
    const hidden = screen.getByText('Hidden', { selector: 'span' }).parentElement?.parentElement
      ?.parentElement as HTMLElement
    fireEvent.click(within(hidden).getByRole('button', { name: 'Use an expression instead' }))
    fireEvent.change(screen.getByLabelText('Hidden'), {
      target: { value: '${{ inputs.simple }}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      {
        type: 'dropdown',
        options: '${{ inputs.choices }}',
        hidden: '${{ inputs.simple }}',
      },
      expect.anything(),
      [],
    )
  })

  it('links options so ticking one ticks others', () => {
    const onSave = open({
      type: 'checkbox-group',
      options: ['logs', 'checkpoints', 'all'],
    })
    const row = screen.getByText('all also ticks').parentElement as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'logs' }))
    fireEvent.click(within(row).getByRole('button', { name: 'checkpoints' }))
    expect(within(row).getByRole('button', { name: 'logs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ implies: { all: ['logs', 'checkpoints'] } }),
      expect.anything(),
      [],
    )
  })

  it('describes every setting of the type', () => {
    open({ type: 'number' })
    const help = INPUTS_EDITOR_STRINGS.help
    for (const text of [
      help.name,
      help.label,
      help.description,
      help.tooltip,
      help.default,
      help.minNumber,
      help.maxNumber,
      help.step,
      help.slider,
      help.optional,
      help.hidden,
      help.disabled,
      help.ignore,
      INPUTS_EDITOR_STRINGS.typeHelp.number,
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })

  it('keeps untouched values exactly and saves only what changed', () => {
    const onSave = open({ type: 'number', default: 5, label: 'Count' })
    fireEvent.change(screen.getByLabelText('Minimum'), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'number', label: 'Count', default: 5, min: 1 },
      { set: { min: 1 }, unset: [] },
      [],
    )
  })

  it('drops settings the new type does not take', () => {
    const onSave = open({ type: 'string', placeholder: 'Name', label: 'X' })
    fireEvent.change(screen.getByLabelText('Type'), {
      target: { value: 'number' },
    })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.typeChangeNote)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'number', label: 'X' },
      { set: { type: 'number' }, unset: ['placeholder'] },
      [],
    )
  })

  it('edits dropdown options as value and label rows', () => {
    const onSave = open({
      type: 'dropdown',
      options: [{ value: 'a', label: 'A' }, 'b'],
    })
    // The input's own Label comes first, then each option's.
    const labels = screen.getAllByLabelText('Label')
    fireEvent.change(labels.at(-1) as HTMLElement, { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      {
        type: 'dropdown',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      {
        set: {
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
        unset: [],
      },
      [],
    )
  })

  it('requires what the schema requires before a new input saves', () => {
    const onSave = open({ type: 'header', text: '' }, { isNew: true })
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Cluster' },
    })
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'header', text: 'Cluster' },
      { set: { type: 'header', text: 'Cluster' }, unset: [] },
      [],
    )
  })

  it('refuses a name already used next to it', () => {
    open({ type: 'string' }, { siblings: ['taken'] })
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'taken' },
    })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.inputExists)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('keeps a dropdown to one of the schema’s two variants', () => {
    const onSave = open(
      {
        type: 'dropdown',
        options: [{ value: 'a', label: 'A' }],
        placeholder: 'Pick',
      },
      { inputs: { k: { type: 'dropdown', options: ['x'] } } },
    )
    expect(screen.getByLabelText('Hint text')).toBeInTheDocument()
    expect(screen.queryByLabelText('Options depend on')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Per value of another input' }))
    fireEvent.change(screen.getByLabelText('Options'), {
      target: { value: '{"x": ["a"]}' },
    })
    expect(screen.queryByLabelText('Hint text')).toBeNull()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Options depend on'), {
      target: { value: '${{ inputs.k }}' },
    })
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledWith(
      'field',
      {
        type: 'dropdown',
        options: { x: ['a'] },
        'option-key': '${{ inputs.k }}',
      },
      {
        set: { options: { x: ['a'] }, 'option-key': '${{ inputs.k }}' },
        unset: ['placeholder'],
      },
      [],
    )
  })

  it('takes any list of values as a multi-select default', () => {
    const onSave = open({
      type: 'multi-dropdown',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    })
    const add = screen.getByRole('button', { name: 'Add value' })
    fireEvent.click(add)
    fireEvent.click(add)
    const [first, second] = screen.getAllByLabelText('Add value', {
      selector: 'input',
    })
    fireEvent.change(first as HTMLElement, { target: { value: 'b' } })
    fireEvent.change(second as HTMLElement, {
      target: { value: 'pw://greybackup/mycluster' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        default: ['b', 'pw://greybackup/mycluster'],
      }),
      { set: { default: ['b', 'pw://greybackup/mycluster'] }, unset: [] },
      [],
    )
  })

  it('turns a cluster default into a list once several can be picked', () => {
    const onSave = open({
      type: 'compute-clusters',
      default: 'pw://greybackup/one',
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Multiple choices' }))
    const add = screen.getByRole('button', { name: 'Add value' })
    fireEvent.click(add)
    const rows = screen.getAllByLabelText('Add value', { selector: 'input' })
    expect(rows[0]).toHaveValue('pw://greybackup/one')
    fireEvent.change(rows[1] as HTMLElement, {
      target: { value: 'pw://greybackup/two' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        multi: true,
        default: ['pw://greybackup/one', 'pw://greybackup/two'],
      }),
      {
        set: {
          default: ['pw://greybackup/one', 'pw://greybackup/two'],
          multi: true,
        },
        unset: [],
      },
      [],
    )
  })

  it('flattens a group unless a field would clash with an input beside it', () => {
    const onSave = open(
      { type: 'group', items: { size: { type: 'number' } } },
      { siblings: ['size'] },
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Leave out the group name' }))
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.flattenClash('size'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    cleanup()
    const clean = open({ type: 'group', items: { size: { type: 'number' } } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Leave out the group name' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(clean).toHaveBeenCalledWith(
      'field',
      { type: 'group', flatten: true, items: { size: { type: 'number' } } },
      { set: { flatten: true }, unset: [] },
      [],
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reads and writes a duration as HH:MM:SS, stored in seconds', () => {
    const onSave = open({ type: 'duration', default: 3600 })
    expect(screen.getByLabelText('Default')).toHaveValue('01:00:00')
    fireEvent.change(screen.getByLabelText('Minimum'), {
      target: { value: '90m' },
    })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.invalidDurationText)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Minimum'), {
      target: { value: '00:01:30' },
    })
    expect(screen.queryByLabelText('Checkbox text')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Checkbox to turn it off' }))
    fireEvent.change(screen.getByLabelText('Checkbox text'), {
      target: { value: 'Unlimited' },
    })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.disableNeedsBoth)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Value when ticked'), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      {
        type: 'duration',
        default: 3600,
        min: 90,
        disableLabel: 'Unlimited',
        disableValue: 0,
      },
      {
        set: { min: 90, disableLabel: 'Unlimited', disableValue: 0 },
        unset: [],
      },
      [],
    )
  })

  it('reads a width as pixels or a share of the row, and nothing else', () => {
    const onSave = open({ type: 'string', width: 320 })
    expect(screen.getByLabelText('Width')).toHaveValue('320')
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '50px' } })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.invalidWidth)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '50%' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'string', width: '50%' },
      { set: { width: '50%' }, unset: [] },
      [],
    )
    cleanup()
    const cleared = open({ type: 'string', width: '50%' })
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(cleared).toHaveBeenCalledWith(
      'field',
      { type: 'string' },
      { set: {}, unset: ['width'] },
      [],
    )
  })

  it('offers a width, and a place below the input before, on every input but a wizard step', () => {
    for (const type of inputTypes()) {
      expect(offeredInputKeys(parser, type).includes('width')).toBe(type !== 'step')
      expect(offeredInputKeys(parser, type).includes('below')).toBe(type !== 'step')
    }
  })

  it('puts an input below the one before it from its dialog', () => {
    const onSave = open({ type: 'string' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Below the input before it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'string', below: true },
      { set: { below: true }, unset: [] },
      [],
    )
  })

  it('offers radio options as default values and picks the layout by name', () => {
    const onSave = open({
      type: 'radio',
      options: ['fp16', 'fp32'],
      optionLabelPosition: 'side',
    })
    const input = screen.getByLabelText('Default')
    expect(suggestionsOf(input).map((option) => option.value)).toEqual(['fp16', 'fp32'])
    // A layout the schema doesn't know picks neither.
    for (const name of ['Side by side', 'One per line']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
    fireEvent.click(screen.getByRole('button', { name: 'One per line' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ optionLabelPosition: 'top' }),
      expect.anything(),
      [],
    )
  })

  it('gives each checkbox a description', () => {
    const onSave = open({ type: 'checkbox-group', options: ['logs'] })
    const optionDescription = screen
      .getAllByLabelText('Description')
      .find((element) => element.tagName === 'INPUT') as HTMLElement
    fireEvent.change(optionDescription, {
      target: { value: 'stdout and stderr' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        options: [{ value: 'logs', description: 'stdout and stderr' }],
      }),
      expect.anything(),
      [],
    )
  })

  it('keeps a list’s default rows as written until they are edited', () => {
    const onSave = open({
      type: 'list',
      label: 'Hosts',
      template: { host: { type: 'string' } },
      default: [{ host: 'a' }],
    })
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Servers' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ default: [{ host: 'a' }] }),
      { set: { label: 'Servers' }, unset: [] },
      [],
    )
  })

  it('needs min, max and step once the slider is on', () => {
    open({ type: 'number' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Slider' }))
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    for (const [label, value] of [
      ['Minimum', '1'],
      ['Maximum', '9'],
      ['Step size', '1'],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    expect(save).toBeEnabled()
  })

  it('keeps a multi-line tooltip on several lines', () => {
    open({ type: 'string', tooltip: 'first\nsecond' })
    const tooltip = screen.getByLabelText('Tooltip')
    expect(tooltip.tagName).toBe('TEXTAREA')
    expect(tooltip).toHaveValue('first\nsecond')
  })

  it('edits a list’s template fields in a nested dialog', () => {
    const onSave = open({
      type: 'list',
      template: { host: { type: 'string' } },
    })
    fireEvent.click(screen.getByText('Add field'))
    const dialogs = screen.getAllByRole('dialog')
    const nested = dialogs[dialogs.length - 1] as HTMLElement
    fireEvent.change(within(nested).getByLabelText('Name'), {
      target: { value: 'port' },
    })
    fireEvent.change(within(nested).getByLabelText('Type'), {
      target: { value: 'number' },
    })
    fireEvent.click(within(nested).getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      {
        type: 'list',
        template: { host: { type: 'string' }, port: { type: 'number' } },
      },
      {
        set: {
          template: { host: { type: 'string' }, port: { type: 'number' } },
        },
        unset: [],
      },
      [],
    )
  })
})

describe('problems in the inputs', () => {
  it('marks an input with its problems, and shows the first one’s line on a click', () => {
    const onReveal = vi.fn()
    renderForm(
      editor({
        onReveal,
        problems: [
          {
            message: 'Size is not a number',
            line: 12,
            input: ['settings', 'size'],
          },
          { message: 'a job problem', line: 20, job: 'build' },
        ],
      }),
    )
    const flagged = row(['settings', 'size'])
    const badge = within(flagged).getByRole('button', { name: '1 problem' })
    expect(badge.dataset['tooltipContent']).toBe('Size is not a number')
    expect(within(row(['name'])).queryByRole('button', { name: '1 problem' })).toBeNull()
    fireEvent.click(badge)
    expect(onReveal).toHaveBeenCalledWith({ line: 12 })
  })
})

describe('selecting inputs', () => {
  // jsdom lays nothing out, so each row gets a rect by hand.
  function layOut() {
    const rects: [string[], [number, number, number, number]][] = [
      [['name'], [0, 0, 300, 40]],
      [['secret'], [0, 50, 300, 16]],
      [['settings'], [0, 80, 300, 120]],
      [
        ['settings', 'size'],
        [10, 110, 280, 40],
      ],
    ]
    for (const [path, [x, y, w, h]] of rects) {
      row(path).getBoundingClientRect = () => new DOMRect(x, y, w, h)
    }
  }
  const selected = () =>
    [...document.querySelectorAll('[data-input-path][data-selected]')]
      .map((el) => el.getAttribute('data-input-path'))
      .sort()
  const form = () => row(['name']).closest('[tabindex="0"]') as HTMLElement

  // Each release is followed by the click a browser sends after it.
  function shiftClick(path: string[], at: [number, number]) {
    fireEvent.pointerDown(row(path), {
      button: 0,
      shiftKey: true,
      clientX: at[0],
      clientY: at[1],
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: at[0], clientY: at[1] })
    })
    fireEvent.click(row(path), { shiftKey: true })
  }
  function box(from: [number, number], to: [number, number]) {
    fireEvent.pointerDown(form(), {
      button: 0,
      shiftKey: true,
      clientX: from[0],
      clientY: from[1],
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] })
    })
    fireEvent.click(form(), { shiftKey: true })
  }
  function drag(handle: HTMLElement, from: [number, number], to: [number, number]) {
    fireEvent.pointerDown(handle, { button: 0, clientX: from[0], clientY: from[1] })
    act(() => {
      fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] })
    })
    fireEvent.click(handle)
  }

  it('toggles an input with shift-click, and clears on Escape or a click between fields', () => {
    renderForm(editor())
    layOut()
    shiftClick(['name'], [5, 5])
    shiftClick(['settings', 'size'], [20, 120])
    expect(selected()).toEqual(['["name"]', '["settings","size"]'])
    shiftClick(['name'], [5, 5])
    expect(selected()).toEqual(['["settings","size"]'])
    fireEvent.keyDown(form(), { key: 'Escape' })
    expect(selected()).toEqual([])
    shiftClick(['name'], [5, 5])
    fireEvent.pointerDown(form(), { button: 0, clientX: 5, clientY: 45 })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 45 })
    })
    expect(selected()).toEqual([])
  })

  it('selects with a box: whole inputs across the form, or the fields of the group holding it', () => {
    renderForm(editor())
    layOut()
    box([-10, -10], [310, 90])
    expect(selected()).toEqual(['["name"]', '["secret"]', '["settings"]'])
    fireEvent.keyDown(form(), { key: 'Escape' })
    box([5, 105], [295, 160])
    expect(selected()).toEqual(['["settings","size"]'])
  })

  it('moves the selected inputs together from any one of their handles', () => {
    const e = editor()
    const { rerender } = renderForm(e)
    layOut()
    shiftClick(['secret'], [5, 55])
    shiftClick(['name'], [5, 5])
    const handle = row(['name']).querySelector('[data-drag-handle]') as HTMLElement
    drag(handle, [5, 5], [5, 112])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['name'], ['secret']],
      parent: ['settings'],
      index: 0,
    })
    // They stay selected once the page has made the move.
    const moved = {
      settings: {
        ...INPUTS.settings,
        items: {
          name: INPUTS.name,
          secret: INPUTS.secret,
          ...INPUTS.settings.items,
        },
      },
    }
    rerender(
      <InputsFormEditor editor={e} inputs={moved}>
        <DynamicForm formJSONs={convertToDynamicForm(moved)} initialValues={{}} workflowForm />
      </InputsFormEditor>,
    )
    expect(selected()).toEqual(['["settings","name"]', '["settings","secret"]'])
  })

  it('deletes the selected inputs as one edit, leaving a field being typed in alone', () => {
    const e = editor()
    renderForm(e)
    layOut()
    shiftClick(['name'], [5, 5])
    shiftClick(['settings'], [5, 85])
    fireEvent.keyDown(screen.getAllByRole('textbox')[0] as HTMLElement, {
      key: 'Backspace',
    })
    expect(e.onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(form(), { key: 'Delete' })
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'deleteInput', path: ['name'] },
        { type: 'deleteInput', path: ['settings'] },
      ],
    })
    expect(selected()).toEqual([])
  })

  // A field's own label, or a group's title.
  const titleOf = (path: string[]) => {
    const title = row(path).querySelector('[data-field-label]')
    if (!(title instanceof HTMLElement)) {
      throw new Error(`no label for ${path.join('.')}`)
    }
    return title
  }
  // Whether the click after the press went on, which on a label hands it to the label's field.
  const clickLabel = (path: string[]) => {
    const label = titleOf(path)
    fireEvent.pointerDown(label, { button: 0, clientX: 5, clientY: 5 })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 5 })
    })
    return fireEvent.click(label)
  }

  it('highlights an input when its label is clicked, leaving its field alone', () => {
    renderForm(editor())
    const field = row(['settings', 'size']).querySelector('input') as HTMLInputElement
    expect(clickLabel(['settings', 'size'])).toBe(false)
    expect(selected()).toEqual([JSON.stringify(['settings', 'size'])])
    expect(field).not.toHaveFocus()
    expect(form()).toHaveFocus()
  })

  it('moves an input dragged by its label', () => {
    const e = editor()
    renderForm(e)
    layOut()
    drag(titleOf(['name']), [5, 5], [5, 112])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['name']],
      parent: ['settings'],
      index: 0,
    })
  })

  it('drags every selected input from one of their labels, and a click on it selects just that one', () => {
    const e = editor()
    renderForm(e)
    layOut()
    shiftClick(['secret'], [5, 55])
    shiftClick(['name'], [5, 5])
    clickLabel(['name'])
    expect(selected()).toEqual([JSON.stringify(['name'])])
    shiftClick(['secret'], [5, 55])
    drag(titleOf(['name']), [5, 5], [5, 112])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['name'], ['secret']],
      parent: ['settings'],
      index: 0,
    })
  })

  it('folds a group from its title on a click, and moves it from its title in a drag', () => {
    const e = editor()
    renderForm(e)
    layOut()
    const title = titleOf(['settings'])
    const open = title.getAttribute('aria-expanded')
    expect(clickLabel(['settings'])).toBe(true)
    expect(title).toHaveAttribute('aria-expanded', open === 'true' ? 'false' : 'true')
    drag(titleOf(['settings']), [5, 85], [5, 45])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['settings']],
      parent: [],
      index: 1,
    })
    expect(titleOf(['settings'])).toHaveAttribute(
      'aria-expanded',
      open === 'true' ? 'false' : 'true',
    )
  })

  it('moves the highlighted input down with the arrow keys', () => {
    const e = editor()
    renderForm(e)
    clickLabel(['name'])
    fireEvent.keyDown(form(), { key: 'ArrowDown' })
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['name']],
      parent: [],
      index: 2,
    })
  })

  it('leaves the first input where it is on arrow up', () => {
    const e = editor()
    renderForm(e)
    clickLabel(['name'])
    fireEvent.keyDown(form(), { key: 'ArrowUp' })
    expect(e.onEdit).not.toHaveBeenCalled()
  })
})

describe('inputs side by side', () => {
  const ROWS = {
    a: { type: 'string', label: 'A' },
    b: { type: 'string', label: 'B' },
    c: { type: 'string', label: 'C' },
  }
  const HALVES = {
    a: { type: 'string', label: 'A', width: '50%' },
    b: { type: 'string', label: 'B', width: '50%' },
    c: { type: 'string', label: 'C' },
  }
  const render = (e: DependencyGraphEditor, inputs: Record<string, unknown>) =>
    renderForm(e, inputs as typeof INPUTS)
  // jsdom lays nothing out, so each row, and each cell the form puts it in, gets a rect by hand.
  function layOut(rects: Record<string, [number, number, number, number]>) {
    for (const [name, [x, y, w, h]] of Object.entries(rects)) {
      const el = row([name])
      el.getBoundingClientRect = () => new DOMRect(x, y, w, h)
      const cell = el.closest<HTMLElement>('[data-input-cell]')
      if (cell) {
        cell.getBoundingClientRect = () => new DOMRect(x - 8, y, w + 16, h)
        const flow = cell.parentElement as HTMLElement
        flow.getBoundingClientRect = () => new DOMRect(-8, 0, 616, 200)
      }
    }
  }
  function drag(handle: HTMLElement, from: [number, number], to: [number, number]) {
    fireEvent.pointerDown(handle, { button: 0, clientX: from[0], clientY: from[1] })
    act(() => {
      fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] })
    })
    fireEvent.click(handle)
  }
  const handleOf = (name: string) => row([name]).querySelector('[data-drag-handle]') as HTMLElement
  const form = () => row(['a']).closest('[tabindex="0"]') as HTMLElement

  it('puts an input dragged sideways onto another’s edge beside it, sharing the line evenly', () => {
    const e = editor()
    render(e, ROWS)
    layOut({ a: [0, 0, 600, 40], b: [0, 50, 600, 40], c: [0, 100, 600, 40] })
    drag(handleOf('c'), [480, 105], [590, 20])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'moveInputs', paths: [['c']], parent: [], index: 1 },
        { type: 'updateInput', path: ['a'], set: { width: '50%' } },
        { type: 'updateInput', path: ['c'], set: { width: '50%' } },
      ],
    })
  })

  it('drops above or below an input from the top or bottom half of its middle', () => {
    const e = editor()
    render(e, ROWS)
    layOut({ a: [0, 0, 600, 40], b: [0, 50, 600, 40], c: [0, 100, 600, 40] })
    drag(handleOf('c'), [480, 105], [300, 10])
    expect(e.onEdit).toHaveBeenLastCalledWith({
      type: 'moveInputs',
      paths: [['c']],
      parent: [],
      index: 0,
    })
    drag(handleOf('a'), [480, 5], [300, 70])
    expect(e.onEdit).toHaveBeenLastCalledWith({
      type: 'moveInputs',
      paths: [['a']],
      parent: [],
      index: 2,
    })
  })

  it('keeps the width of an input that sat alone on its line when it moves', () => {
    const e = editor()
    render(e, { a: { type: 'string', label: 'A', width: '50%' }, b: ROWS.b, c: ROWS.c })
    layOut({ a: [0, 0, 292, 40], b: [0, 50, 600, 40], c: [0, 100, 600, 40] })
    drag(handleOf('a'), [200, 5], [300, 130])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['a']],
      parent: [],
      index: 3,
    })
  })

  it('gives an input dragged out of a shared line, and the one left there, the full width', () => {
    const e = editor()
    render(e, HALVES)
    layOut({ a: [0, 0, 292, 40], b: [308, 0, 292, 40], c: [0, 50, 600, 40] })
    drag(handleOf('b'), [400, 5], [400, 95])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'moveInputs', paths: [['b']], parent: [], index: 3 },
        { type: 'updateInput', path: ['a'], unset: ['width'] },
        { type: 'updateInput', path: ['b'], unset: ['width'] },
      ],
    })
  })

  it('gives a new input dropped beside another an even share of its line', () => {
    const e = editor()
    render(e, ROWS)
    layOut({ a: [0, 0, 600, 40], b: [0, 50, 600, 40], c: [0, 100, 600, 40] })
    drag(screen.getByText('Input').closest('button') as HTMLElement, [540, 300], [590, 20])
    pickType('Number')
    expect(screen.getByLabelText('Width')).toHaveValue('50%')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'updateInput', path: ['a'], set: { width: '50%' } },
        {
          type: 'addInput',
          parent: [],
          index: 1,
          name: 'input_1',
          definition: { type: 'number', width: '50%' },
        },
      ],
    })
  })

  it('resizes two inputs sharing a line from the edge between them, in 5% steps', () => {
    const e = editor()
    render(e, HALVES)
    layOut({ a: [0, 0, 292, 40], b: [308, 0, 292, 40], c: [0, 50, 600, 40] })
    expect(screen.queryByRole('separator')).toBeNull()
    fireEvent.pointerMove(form(), { clientX: 300, clientY: 20 })
    const edge = screen.getByRole('separator', { name: INPUTS_EDITOR_STRINGS.resizeInputs })
    expect(edge).toHaveAttribute('aria-valuenow', '50')
    drag(edge, [300, 20], [176, 20])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'updateInput', path: ['a'], set: { width: '30%' } },
        { type: 'updateInput', path: ['b'], set: { width: '70%' } },
      ],
    })
  })

  // A hidden input sits between two halves: the run form keeps them on one line, so the editor does.
  const SPLIT = {
    a: HALVES.a,
    h: { type: 'string', label: 'H', hidden: true },
    b: HALVES.b,
    c: HALVES.c,
  }
  const SPLIT_LAYOUT: Record<string, [number, number, number, number]> = {
    a: [0, 0, 292, 40],
    b: [308, 0, 292, 40],
    c: [0, 50, 600, 40],
    h: [0, 100, 600, 16],
  }

  it('lists a hidden input after the ones the form shows, never between two sharing a line', () => {
    render(editor(), SPLIT)
    layOut(SPLIT_LAYOUT)
    expect(row(['h'])).toHaveAttribute('data-input-hidden')
    fireEvent.pointerMove(form(), { clientX: 300, clientY: 20 })
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '50')
  })

  it('lands a shown input dropped on a hidden one after the shown inputs', () => {
    const e = editor()
    render(e, SPLIT)
    layOut(SPLIT_LAYOUT)
    drag(handleOf('a'), [200, 5], [300, 108])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'moveInputs', paths: [['a']], parent: [], index: 4 },
        { type: 'updateInput', path: ['b'], unset: ['width'] },
        { type: 'updateInput', path: ['a'], unset: ['width'] },
      ],
    })
  })

  it('never puts a hidden input beside another', () => {
    const e = editor()
    render(e, SPLIT)
    layOut(SPLIT_LAYOUT)
    drag(handleOf('h'), [300, 105], [280, 30])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['h']],
      parent: [],
      index: 3,
    })
  })

  // a | b | c on one line, a third each.
  const THIRDS = {
    a: { type: 'string', label: 'A', width: '33%' },
    b: { type: 'string', label: 'B', width: '33%' },
    c: { type: 'string', label: 'C', width: '33%' },
  }
  const THIRDS_LAYOUT: Record<string, [number, number, number, number]> = {
    a: [0, 0, 184, 40],
    b: [208, 0, 184, 40],
    c: [416, 0, 184, 40],
  }

  it('stacks an input dropped on the lower half of one sharing a row under it, in its column', () => {
    const e = editor()
    render(e, THIRDS)
    layOut(THIRDS_LAYOUT)
    drag(handleOf('c'), [500, 5], [300, 30])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'updateInput', path: ['a'], set: { width: '50%' } },
        { type: 'updateInput', path: ['b'], set: { width: '50%' } },
        { type: 'updateInput', path: ['c'], set: { below: true }, unset: ['width'] },
      ],
    })
  })

  it('moves the next input up to head a column when its head leaves', () => {
    const e = editor()
    render(e, { ...HALVES, c: { type: 'string', label: 'C', below: true } })
    layOut({ a: [0, 0, 292, 40], b: [308, 0, 292, 40], c: [308, 50, 292, 40] })
    expect(row(['c']).parentElement).toBe(row(['b']).parentElement)
    drag(handleOf('b'), [400, 5], [300, 140])
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'moveInputs', paths: [['b']], parent: [], index: 3 },
        { type: 'updateInput', path: ['c'], set: { width: '50%' }, unset: ['below'] },
        { type: 'updateInput', path: ['b'], unset: ['width'] },
      ],
    })
  })

  it('puts a new input dropped on the lower half of one in a column under it', () => {
    const e = editor()
    render(e, HALVES)
    layOut({ a: [0, 0, 292, 40], b: [308, 0, 292, 40], c: [0, 50, 600, 40] })
    drag(screen.getByText('Input').closest('button') as HTMLElement, [540, 300], [450, 30])
    pickType('Number')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'addInput',
      parent: [],
      index: 2,
      name: 'input_1',
      definition: { type: 'number', below: true },
    })
  })

  it('moves the edge between two inputs with the arrow keys', () => {
    const e = editor()
    render(e, HALVES)
    layOut({ a: [0, 0, 292, 40], b: [308, 0, 292, 40], c: [0, 50, 600, 40] })
    fireEvent.pointerMove(form(), { clientX: 300, clientY: 20 })
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' })
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'updateInput', path: ['a'], set: { width: '45%' } },
        { type: 'updateInput', path: ['b'], set: { width: '55%' } },
      ],
    })
  })
})

describe('list templates', () => {
  const HOSTS = {
    hosts: {
      type: 'list',
      label: 'Hosts',
      template: {
        name: { type: 'string', label: 'Name' },
        port: { type: 'number', label: 'Port' },
        creds: {
          type: 'group',
          label: 'Credentials',
          items: { user: { type: 'string', label: 'User' } },
        },
      },
    },
  }
  function renderList(e: DependencyGraphEditor, values: Record<string, unknown> = {}) {
    return render(
      <InputsFormEditor editor={e} inputs={HOSTS}>
        <DynamicForm
          formJSONs={convertToDynamicForm(HOSTS)}
          initialValues={values}
          workflowForm
          fields={{ list: ListStandIn }}
        />
      </InputsFormEditor>,
    )
  }
  const rowsOf = (path: string[]) =>
    document.querySelectorAll(`[data-input-path='${JSON.stringify(path)}']`)

  it('edits a list’s template in place through its first row, a group in it too', async () => {
    renderList(editor())
    await waitFor(() => expect(rowsOf(['hosts', 'name'])).toHaveLength(1))
    expect(rowsOf(['hosts', 'creds', 'user'])).toHaveLength(1)
    expect(within(row(['hosts', 'port'])).getByText('Number')).toBeInTheDocument()
  })

  it('shows the rows after the first as the form draws them, without editing them', () => {
    renderList(editor(), { hosts: [{ name: 'a' }, { name: 'b' }] })
    expect(screen.getByDisplayValue('a')).toBeInTheDocument()
    expect(screen.getByDisplayValue('b')).toBeInTheDocument()
    expect(rowsOf(['hosts', 'name'])).toHaveLength(1)
    expect(row(['hosts', 'name'])).toContainElement(screen.getByDisplayValue('a'))
  })

  it('moves a template field among the template’s own', () => {
    const e = editor()
    renderList(e, { hosts: [{}] })
    const label = row(['hosts', 'port']).querySelector('[data-field-label]') as HTMLElement
    fireEvent.pointerDown(label, { button: 0, clientX: 5, clientY: 5 })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 5 })
    })
    fireEvent.click(label)
    fireEvent.keyDown(row(['hosts']).closest('[tabindex="0"]') as HTMLElement, { key: 'ArrowUp' })
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['hosts', 'port']],
      parent: ['hosts'],
      index: 0,
    })
  })
})
