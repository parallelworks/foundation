import type { Meta, StoryObj } from '@storybook/react-vite'
import { DynamicForm } from './Form'

const meta: Meta<typeof DynamicForm> = {
  title: 'UI/Form/DynamicForm',
  component: DynamicForm,
  parameters: {
    docs: {
      description: {
        component:
          'The form engine gates on the wasm expression parser: run ' +
          '`pnpm -F @parallelworks/workflow-parser generate-wasm` once locally ' +
          'or the form stays on its loading state.',
      },
    },
  },
}
export default meta

const FORM_JSONS = {
  settings: {
    type: 'group',
    label: 'Cluster settings',
    items: {
      name: {
        type: 'string',
        label: 'Name',
        default: 'demo-cluster',
        tooltip: 'A unique cluster name',
      },
      nodes: { type: 'number', label: 'Nodes', default: 2, min: 1, max: 16 },
      monitoring: {
        type: 'boolean',
        label: 'Enable monitoring',
        default: true,
      },
      size: {
        type: 'dropdown',
        label: 'Instance size',
        default: 'medium',
        options: ['small', 'medium', 'large'],
      },
      walltime: { type: 'duration', label: 'Walltime', default: '1h30m' },
      scheduler: {
        type: 'radio',
        label: 'Scheduler',
        default: 'slurm',
        options: ['slurm', 'pbs'],
      },
    },
  },
}

export const ClusterSettings: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: FORM_JSONS,
    initialValues: {},
    skipValueParse: true,
  },
}

export const CompactLabels: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: FORM_JSONS,
    initialValues: {},
    skipValueParse: true,
    labelPosition: 'top',
    spaceCompact: true,
  },
}

// As a workflow's inputs convert: a list's template becomes its options.
const CHOICE_JSONS = {
  precision: {
    type: 'radio',
    label: 'Precision',
    options: ['fp16', { label: 'Brain float', value: 'bf16' }],
    default: 'bf16',
  },
  workers: { type: 'radio', label: 'Workers', options: [1, 2, 4], default: 2 },
  features: {
    type: 'checkbox-group',
    label: 'Features',
    options: [
      { label: 'Logging', value: 'log' },
      { label: 'Metrics', value: 'metrics', description: 'Sends usage numbers' },
      'tracing',
    ],
    default: ['log'],
  },
  hosts: {
    type: 'list',
    label: 'Hosts',
    default: [{ name: 'node-1' }, { name: 'node-2' }],
    options: { name: { type: 'string', label: 'Name' } },
  },
}

/** Options with labels of their own or numeric values, and a list starting from its default rows. */
export const Choices: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: CHOICE_JSONS,
    initialValues: {},
    skipValueParse: true,
    workflowForm: true,
  },
}
