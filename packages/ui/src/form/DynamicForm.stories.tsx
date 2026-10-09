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

/** Inputs with a `width` (pixels, or a share of the row) sit side by side, label on top unless the
 * form sets `labelPosition`; below 24rem each share takes the whole row and a pixel width stays. */
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
      dataset: { type: 'string', label: 'Dataset', default: '/data/images' },
      epochs: { type: 'number', label: 'Epochs', default: 10, width: '33%' },
      batch: { type: 'number', label: 'Batch size', default: 64, width: '33%' },
      rate: { type: 'number', label: 'Learning rate', default: 0.001, width: '33%' },
      seed: { type: 'number', label: 'Seed', default: 42, width: 160 },
    },
    initialValues: {},
    skipValueParse: true,
  },
}

/** `anchor-below` stacks an input under the one shown before it, in that one's column, and the form's own
 * `$meta.labelPosition` holds for inputs in rows too. */
export const AnchoredBelow: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      $meta: { labelPosition: 'left' },
      cluster: { type: 'string', label: 'Cluster', default: 'gpu-cluster', width: '50%' },
      partition: { type: 'string', label: 'Partition', default: 'batch', width: '50%' },
      account: { type: 'string', label: 'Account', default: 'research', 'anchor-below': true },
      notes: { type: 'string', label: 'Notes' },
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
}

/** Options with labels of their own or numeric values, each picked by its default. */
export const Choices: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: CHOICE_JSONS,
    initialValues: { precision: 'bf16', workers: 2, features: ['log'] },
    skipValueParse: true,
    workflowForm: true,
  },
}

const WORKER_OPTIONS = {
  nodes: { type: 'number', label: 'Nodes', default: 2, width: '50%' },
  queue: {
    type: 'dropdown',
    label: 'Queue',
    default: 'gpu',
    options: ['gpu', 'cpu'],
    width: '50%',
  },
}

/** A page with `multi` repeats: each copy is a page, its values a row under the page's name, with Add after
 * the last copy and Remove on each, inside its `min` and `max`. A title list gives each copy its own. */
export const RepeatedPage: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      $meta: { wizard: { mode: 'wizard', submitLabel: 'Launch', navigation: { allowJump: true } } },
      workers: {
        type: 'step',
        title: ['GPU workers', 'CPU workers'],
        description: 'One page per worker site.',
        multi: true,
        max: 3,
        options: WORKER_OPTIONS,
      },
      review: {
        type: 'step',
        title: 'Review',
        options: { notify: { type: 'boolean', label: 'Email me when it finishes', default: true } },
      },
    },
    initialValues: {
      workers: [
        { nodes: 4, queue: 'gpu' },
        { nodes: 8, queue: 'cpu' },
      ],
    },
    skipValueParse: true,
  },
}

/** Without a `min`, a repeated page starts with no copies, as a list starts with no rows: its page offers the first. */
export const RepeatedPageEmpty: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: {
      $meta: { wizard: { mode: 'wizard', submitLabel: 'Launch' } },
      workers: {
        type: 'step',
        title: 'Worker site',
        description: 'One page per worker site.',
        multi: true,
        options: WORKER_OPTIONS,
      },
      review: {
        type: 'step',
        title: 'Review',
        options: { notify: { type: 'boolean', label: 'Email me when it finishes', default: true } },
      },
    },
    initialValues: {},
    skipValueParse: true,
  },
}

const WIZARD_IN_A_GROUP = {
  name: { type: 'string', label: 'Job name', default: 'train-resnet' },
  setup: {
    type: 'group',
    label: 'Cluster setup',
    items: {
      $meta: { wizard: { mode: 'wizard' } },
      compute: {
        type: 'step',
        title: 'Compute',
        options: {
          partition: {
            type: 'dropdown',
            label: 'Partition',
            default: 'gpu',
            options: ['gpu', 'cpu'],
          },
          nodes: { type: 'number', label: 'Nodes', default: 2 },
        },
      },
      storage: {
        type: 'step',
        title: 'Storage',
        options: { scratch: { type: 'number', label: 'Scratch (GB)', default: 100 } },
      },
    },
  },
}

/** A group's fields can be a wizard of their own, paged inside the form around it. */
export const WizardInAGroup: StoryObj<typeof DynamicForm> = {
  args: {
    formJSONs: WIZARD_IN_A_GROUP,
    initialValues: {},
    skipValueParse: true,
  },
}
