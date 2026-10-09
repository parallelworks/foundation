import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo } from 'react'
import { useWorkflowEditing, useWorkflowEngine } from '../components/Provider'
import { DynamicForm } from '../form/Form'
import { initializeValues } from '../form/lib'
import type { EditorProblem } from './editorApi'
import { InputsFormEditor } from './InputsEditor'
import { useStoryWorkflow } from './stories/harness'

const meta: Meta<typeof InputsFormEditor> = {
  title: 'UI/Workflow/InputsFormEditor',
  component: InputsFormEditor,
  argTypes: {
    editor: {
      control: false,
      description: 'The callbacks that make the run form editable, as for the graph.',
    },
    inputs: { control: false, description: 'The workflow’s input definitions the form draws.' },
    children: { control: false, description: 'The run form, drawn from the same inputs.' },
  },
}
export default meta

const INPUTS_WORKFLOW = `on:
  execute:
    inputs:
      title:
        type: header
        text: Training run
      dataset:
        type: string
        label: Dataset
        description: Where the training data lives.
        default: s3://datasets/images
      epochs:
        type: number
        label: Epochs
        default: 10
        min: 1
      precision:
        type: radio
        label: Precision
        options: [fp16, bf16, fp32]
        default: bf16
      resources:
        type: group
        label: Resources
        items:
          gpus:
            type: dropdown
            label: GPUs
            options: [1, 2, 4, 8]
            default: 2
          walltime:
            type: duration
            label: Time limit
            default: 3600
      notify:
        type: boolean
        label: Email me when it finishes
        default: true
jobs:
  train:
    steps:
      - run: python train.py --epochs \${{ inputs.epochs }}
`

function EditableForm({ source, problems }: { source: string; problems?: EditorProblem[] }) {
  const story = useStoryWorkflow(source)
  const editing = useWorkflowEditing()
  const engine = useWorkflowEngine()
  const inputs = useMemo(
    () => editing.workflowInputsSchema(story.workflow),
    [editing, story.workflow],
  )
  const formJSONs = useMemo(() => engine.convertInputs(inputs ?? {}), [engine, inputs])
  // The form starts from the inputs' defaults, as a host's run form does.
  const initialValues = useMemo(() => initializeValues(formJSONs) ?? {}, [formJSONs])
  // In a padded panel, as an app's editing page shows the form.
  return (
    <div className="relative max-w-2xl p-4 panel">
      <InputsFormEditor
        editor={story.editor(
          problems
            ? {
                problems,
                listedProblems: problems.map((problem) => ({ ...problem, pick: () => {} })),
              }
            : {},
        )}
        inputs={inputs}
      >
        <DynamicForm
          formJSONs={formJSONs}
          initialValues={initialValues}
          reinitialize
          workflowForm
          skipValueParse
        />
      </InputsFormEditor>
    </div>
  )
}

/**
 * The run form as an editor: hover an input for its toolbar, click its label to select it,
 * drag the label or the grip to move it, and add inputs from the bar below. Edits undo.
 */
export const Editable: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={INPUTS_WORKFLOW} />,
}

/** A problem marks the input it's in, and the bar counts and lists it. */
export const WithProblems: StoryObj<typeof InputsFormEditor> = {
  render: () => (
    <EditableForm
      source={INPUTS_WORKFLOW}
      problems={[
        {
          message: 'The default isn’t one of the options.',
          line: 20,
          input: ['precision'],
        },
      ]}
    />
  ),
}

const SIDE_BY_SIDE_WORKFLOW = `on:
  execute:
    inputs:
      dataset:
        type: string
        label: Dataset
        default: s3://datasets/images
        width: 50%
      seed:
        type: number
        label: Seed
        default: 42
        hidden: true
      epochs:
        type: number
        label: Epochs
        default: 10
        width: 50%
      batch:
        type: number
        label: Batch size
        default: 64
        anchor-below: true
      precision:
        type: radio
        label: Precision
        options: [fp16, bf16, fp32]
        default: bf16
      resources:
        type: group
        label: Resources
        items:
          gpus:
            type: dropdown
            label: GPUs
            options: [1, 2, 4, 8]
            default: 2
            width: 50%
          walltime:
            type: duration
            label: Time limit
            default: 3600
            width: 50%
jobs:
  train:
    steps:
      - run: python train.py --epochs \${{ inputs.epochs }}
`

/** Dataset beside Epochs over Batch size (`anchor-below`). Drop on an input's side for a column beside it, on
 * its lower half to go under it; drag the edge between columns to resize. Hidden Seed is listed last. */
export const SideBySide: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={SIDE_BY_SIDE_WORKFLOW} />,
}

const WIZARD_WORKFLOW = `on:
  execute:
    inputs:
      $meta:
        wizard:
          mode: wizard
          submitLabel: Launch
          navigation:
            allowJump: true
      cluster:
        type: step
        title: Cluster
        description: Where the job runs.
        options:
          partition:
            type: dropdown
            label: Partition
            options: [gpu, cpu, debug]
            default: gpu
          nodes:
            type: number
            label: Nodes
            default: 2
      workers:
        type: step
        title: Worker site
        description: One page per worker site.
        multi: true
        max: 3
        options:
          site:
            type: string
            label: Site
            default: us-east
          gpus:
            type: number
            label: GPUs per node
            default: 4
      review:
        type: step
        title: Review
        options:
          notify:
            type: boolean
            label: Email me when it finishes
            default: true
jobs:
  train:
    steps:
      - run: python train.py
`

/** A wizard is built as it runs, one page at a time: turn pages with its own buttons or the bar's Page,
 * add one with + Page, and split or unsplit a group's or list's inputs from its row. */
export const Wizard: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={WIZARD_WORKFLOW} />,
}

/** A workflow without inputs yet. */
export const Empty: StoryObj<typeof InputsFormEditor> = {
  render: () => <EditableForm source={'jobs:\n  main:\n    steps:\n      - run: echo hi\n'} />,
}
