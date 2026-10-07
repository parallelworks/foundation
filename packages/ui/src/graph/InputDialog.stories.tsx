import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Json } from './editorFields'
import { InputDialog } from './InputDialog'

const meta: Meta<typeof InputDialog> = {
  title: 'UI/Workflow/InputDialog',
  component: InputDialog,
  parameters: {
    docs: {
      description: {
        component:
          'Every setting of one workflow input, in sections that open where the input already ' +
          'sets something. The type picker offers every input type the workflow schema takes.',
      },
    },
  },
  args: {
    isNew: false,
    siblings: [],
    allowStep: false,
    onSave: () => {},
    onClose: () => {},
    yaml: { onSave: () => {} },
    view: 'form',
  },
  argTypes: {
    definition: { control: 'object' },
    yaml: {
      control: false,
      description: 'How the host saves the input as YAML; without it the dialog is only a form.',
    },
    view: { control: 'inline-radio', options: ['form', 'yaml'] },
  },
}
export default meta

const INPUTS: Json = {
  dataset: { type: 'string', label: 'Dataset' },
  epochs: { type: 'number', label: 'Epochs', default: 10 },
}

export const EditString: StoryObj<typeof InputDialog> = {
  args: {
    name: 'dataset',
    definition: {
      type: 'string',
      label: 'Dataset',
      description: 'Where the training data lives.',
      default: 's3://datasets/images',
      placeholder: 's3://bucket/path',
    },
    inputs: INPUTS,
  },
}

export const EditDropdown: StoryObj<typeof InputDialog> = {
  args: {
    name: 'gpus',
    definition: {
      type: 'dropdown',
      label: 'GPUs',
      options: [
        { label: 'One', value: 1 },
        { label: 'Two', value: 2 },
        { label: 'Four', value: 4 },
      ],
      default: 2,
    },
    inputs: INPUTS,
  },
}

/** A new input picks its type first; a compute target takes only the shared settings. */
export const NewComputeTarget: StoryObj<typeof InputDialog> = {
  args: {
    name: 'target',
    definition: { type: 'compute-target' },
    isNew: true,
    inputs: INPUTS,
  },
}

/** An input's settings as YAML, with its comments kept. */
export const EditAsYaml: StoryObj<typeof InputDialog> = {
  args: {
    name: 'epochs',
    definition: { type: 'number', label: 'Epochs', default: 10 },
    inputs: INPUTS,
    view: 'yaml',
    yaml: {
      source:
        'on:\n  execute:\n    inputs:\n      epochs:\n        # How long to train\n        type: number\n        label: Epochs\n        default: 10\n',
      path: ['epochs'],
      onSave: () => {},
    },
  },
}
