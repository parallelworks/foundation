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

/**
 * Inputs with a `width` share a row when they fit: a number is pixels, a percentage a share of
 * the row. An input sharing a row has its label on top unless the form sets `labelPosition`.
 * A form narrower than 36rem gives every input the full width.
 */
export const WithWidths: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      name: { type: 'string', label: 'Job name', default: 'train-resnet', width: '50%' },
      queue: {
        type: 'dropdown',
        label: 'Queue',
        default: 'gpu',
        options: ['cpu', 'gpu', 'debug'],
        width: '25%',
      },
      priority: { type: 'number', label: 'Priority', default: 5, width: '25%' },
      dataset: { type: 'string', label: 'Dataset', default: 's3://datasets/images' },
      epochs: { type: 'number', label: 'Epochs', default: 10, width: '33%' },
      batch: { type: 'number', label: 'Batch size', default: 64, width: '33%' },
      rate: { type: 'number', label: 'Learning rate', default: 0.001, width: '33%' },
      seed: { type: 'number', label: 'Seed', default: 42, width: 160 },
    },
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
