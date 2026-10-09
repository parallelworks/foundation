// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import * as parser from '@parallelworks/workflow-parser'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The dialog calls useWorkflowEngine(), which throws outside a UIProvider carrying one.
vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

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

import { suggestionsOf } from '../test/DropdownStandIn'
import { INPUTS_EDITOR_STRINGS } from './editorStrings'
import { InputDialog, inputTypes, offeredInputKeys } from './InputDialog'

afterEach(cleanup)

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
    const [first, second] = screen.getAllByRole('combobox', { name: /, item \d+$/ })
    fireEvent.change(first as HTMLElement, { target: { value: 'b' } })
    fireEvent.change(second as HTMLElement, {
      target: { value: 'clusters/mycluster' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        default: ['b', 'clusters/mycluster'],
      }),
      { set: { default: ['b', 'clusters/mycluster'] }, unset: [] },
      [],
    )
  })

  it('turns a cluster default into a list once several can be picked', () => {
    const onSave = open({
      type: 'compute-clusters',
      default: 'clusters/one',
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Multiple choices' }))
    const add = screen.getByRole('button', { name: 'Add value' })
    fireEvent.click(add)
    const rows = screen.getAllByRole('combobox', { name: /, item \d+$/ })
    expect(rows[0]).toHaveValue('clusters/one')
    fireEvent.change(rows[1] as HTMLElement, {
      target: { value: 'clusters/two' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        multi: true,
        default: ['clusters/one', 'clusters/two'],
      }),
      {
        set: {
          default: ['clusters/one', 'clusters/two'],
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
      expect(offeredInputKeys(parser, type).includes('anchor-below')).toBe(type !== 'step')
    }
  })

  it('makes a wizard step a repeatable page from its dialog', () => {
    const onSave = open({ type: 'step', title: 'Host', options: {} })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Repeatable page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'step', title: 'Host', options: {}, multi: true },
      { set: { multi: true }, unset: [] },
      [],
    )
  })

  it('gives a repeatable page a title per copy and its fewest and most copies from its dialog', () => {
    const onSave = open({ type: 'step', title: 'Host', multi: true, options: {} })
    // The description's comes first, in the Field section.
    const [, titlePerCopy] = screen.getAllByRole('checkbox', { name: 'One per copy' })
    fireEvent.click(titlePerCopy as HTMLElement)
    fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'step', title: ['Host'], multi: true, min: 1, max: 3, options: {} },
      { set: { title: ['Host'], min: 1, max: 3 }, unset: [] },
      [],
    )
  })

  it('shows a page’s description, and saves the one typed', () => {
    const onSave = open({ type: 'step', title: 'Host', description: 'Pick a site', options: {} })
    const description = screen.getByDisplayValue('Pick a site')
    fireEvent.change(description, { target: { value: 'Pick a region' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'step', title: 'Host', description: 'Pick a region', options: {} },
      { set: { description: 'Pick a region' }, unset: [] },
      [],
    )
  })

  it('puts an input below the one before it from its dialog', () => {
    const onSave = open({ type: 'string' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Below the input before it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'string', 'anchor-below': true },
      { set: { 'anchor-below': true }, unset: [] },
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

describe('InputDialog in two views', () => {
  function openViews(definition: Record<string, unknown>, inputs?: Record<string, unknown>) {
    const onSave = vi.fn()
    const onYaml = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={definition}
        isNew={false}
        siblings={[]}
        allowStep
        inputs={inputs}
        onSave={onSave}
        onClose={() => {}}
        yaml={{ onSave: onYaml }}
        view="form"
      />,
    )
    return { onSave, onYaml }
  }
  const yamlText = async () =>
    ((await screen.findByLabelText('file:///workflow-input.yaml')) as HTMLTextAreaElement).value
  const toYaml = () => fireEvent.click(screen.getByRole('button', { name: 'YAML' }))
  const toForm = () => fireEvent.click(screen.getByRole('button', { name: 'Form' }))

  it('carries a setting the form cleared into the YAML', async () => {
    openViews({ type: 'string', label: 'Dataset', hidden: true })
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: '' } })
    toYaml()
    expect(await yamlText()).not.toContain('Dataset')
  })

  it('keeps a rename across a trip to the YAML and back', () => {
    const { onSave } = openViews({ type: 'string' })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'renamed' } })
    toYaml()
    toForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith('renamed', { type: 'string' }, expect.anything(), [])
  })

  it('drops the old type’s settings after a trip to the YAML and back', () => {
    const { onSave } = openViews({ type: 'string', placeholder: 'Name' })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'number' } })
    toYaml()
    toForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'number' },
      { set: { type: 'number' }, unset: ['placeholder'] },
      [],
    )
  })

  it('drops a setting the type changed in the YAML no longer takes, once saved from the form', async () => {
    const onSave = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={{ type: 'string', placeholder: 'Name' }}
        isNew={false}
        siblings={[]}
        allowStep
        onSave={onSave}
        onClose={() => {}}
        yaml={{ onSave: () => {} }}
        view="yaml"
      />,
    )
    fireEvent.change(await screen.findByLabelText('file:///workflow-input.yaml'), {
      target: { value: 'type: number\nplaceholder: Name\n' },
    })
    toForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'number' },
      { set: { type: 'number' }, unset: ['placeholder'] },
      [],
    )
  })

  it('saves the inputs it made for a setting with the YAML', () => {
    const { onYaml } = openViews({ type: 'slurm-accounts' }, {})
    fireEvent.click(screen.getByRole('button', { name: 'New Cluster input…' }))
    const dialogs = screen.getAllByRole('dialog')
    fireEvent.click(
      within(dialogs[dialogs.length - 1] as HTMLElement).getByRole('button', { name: 'Save' }),
    )
    toYaml()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onYaml).toHaveBeenCalledWith('field', expect.stringContaining('inputs.cluster'), [
      expect.objectContaining({ name: 'cluster' }),
    ])
  })
})

describe('InputDialog keeps what it does not show', () => {
  function open(definition: Record<string, unknown>) {
    const onSave = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={definition}
        isNew={false}
        siblings={[]}
        allowStep
        onSave={onSave}
        onClose={() => {}}
      />,
    )
    return onSave
  }

  it('returns settings it has no field for along with the ones it changed', () => {
    const onSave = open({ type: 'string', label: 'Host', 'x-note': 'kept' })
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Hostname' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'string', label: 'Hostname', 'x-note': 'kept' },
      { set: { label: 'Hostname' }, unset: [] },
      [],
    )
  })

  it('offers a text field’s length, case and characters to strip', () => {
    open({ type: 'string', minLength: 2, maxLength: 8, lowercase: true, sanitize: '[^a-z]' })
    expect(screen.getByLabelText('Shortest')).toHaveValue('2')
    expect(screen.getByLabelText('Longest')).toHaveValue('8')
    expect(screen.getByLabelText('Characters to strip')).toHaveValue('[^a-z]')
  })

  it('checks a kept setting the new type can’t hold, as options keyed by another input', () => {
    open({ type: 'dropdown', options: { aws: ['a'] }, 'option-key': '${{ inputs.csp }}' })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'multi-dropdown' } })
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.optionsByKeyDropdownOnly)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('carries a group’s fields into a list’s template', () => {
    const onSave = open({ type: 'group', items: { host: { type: 'string' } } })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'list' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      { type: 'list', template: { host: { type: 'string' } } },
      expect.anything(),
      [],
    )
  })

  it('labels a numeric option and saves a default picking it as the number', () => {
    const onSave = open({ type: 'dropdown', options: [{ value: 'a', label: 'A' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }))
    const values = screen.getAllByRole('textbox', { name: 'Value' })
    fireEvent.change(values[values.length - 1] as HTMLElement, { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Default'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({
        options: [
          { value: 'a', label: 'A' },
          { value: 4, label: '4' },
        ],
        default: 4,
      }),
      expect.anything(),
      [],
    )
  })

  it('moves a renamed template field’s value in the default rows, and drops a removed one’s', () => {
    const onSave = open({
      type: 'list',
      template: { host: { type: 'string' }, port: { type: 'number' } },
      default: [{ host: 'a', port: 22 }],
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit input' })[0] as HTMLElement)
    const dialogs = screen.getAllByRole('dialog')
    const nested = dialogs[dialogs.length - 1] as HTMLElement
    fireEvent.change(within(nested).getByLabelText('Name'), { target: { value: 'hostname' } })
    fireEvent.click(within(nested).getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete input' })[1] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      'field',
      expect.objectContaining({ default: [{ hostname: 'a' }] }),
      expect.anything(),
      [],
    )
  })

  it('leaves the list’s dialog open on Escape in a field’s dialog', () => {
    const onClose = vi.fn()
    render(
      <InputDialog
        name="field"
        definition={{ type: 'list', template: { host: { type: 'string' } } }}
        isNew={false}
        siblings={[]}
        allowStep
        onSave={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText('Add field'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('takes the opt-out value as a duration’s default, and only a number for it', () => {
    open({ type: 'duration', disableLabel: 'Never', disableValue: -1, default: -1 })
    expect(screen.getByLabelText('Default')).toHaveValue('-1')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})
