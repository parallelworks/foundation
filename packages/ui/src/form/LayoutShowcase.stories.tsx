import type { Meta, StoryObj } from '@storybook/react-vite'
import { DynamicForm } from './Form'
import type { FormLayoutNode } from './layout'

const meta: Meta<typeof DynamicForm> = {
  title: 'UI/Form/LayoutShowcase',
  component: DynamicForm,
  tags: ['autodocs'],
  argTypes: {
    allowLayoutCSS: {
      control: 'boolean',
      description: 'Toggle all authored styling to compare with the layout defaults.',
    },
    formJSONs: {
      control: 'object',
      description: 'Edit the complete layout and CSS declarations here.',
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Working forms composed entirely with layout metadata and validated CSS declarations. Columns, spans, and shared rows come from the layout. Scoped color seeds, typography, borders, and spacing come from validated CSS. Every visible surface is part of the form configuration, including the title. Toggle allowLayoutCSS to return to the host theme.',
      },
    },
  },
}
export default meta

type DemoField = {
  type: string
  label: string
  default?: string | number | boolean
  [key: string]: unknown
}

function showcase(
  title: string,
  description: string,
  fields: Record<string, DemoField>,
  layout: FormLayoutNode,
  css: string,
): StoryObj<typeof DynamicForm> {
  const formJSONs = {
    $meta: {
      layout: { type: 'section' as const, label: title, description, css, children: [layout] },
    },
    ...fields,
  }
  return {
    args: {
      formJSONs,
      initialValues: Object.fromEntries(
        Object.entries(fields)
          .filter(([, field]) => field.default !== undefined)
          .map(([name, field]) => [name, field.default]),
      ),
      allowLayoutCSS: true,
      workflowForm: true,
      skipValueParse: true,
    },
    parameters: {
      docs: {
        description: { story: description },
        source: { code: JSON.stringify(formJSONs, null, 2), language: 'json' },
      },
    },
    render: (args) => <DynamicForm {...args} />,
  }
}

const RENDER_FIELDS: Record<string, DemoField> = {
  name: { type: 'string', label: 'Render name', default: 'Canyon / final frames' },
  frames: { type: 'string', label: 'Frame range', default: '1001–1240' },
  renderer: {
    type: 'dropdown',
    label: 'Renderer',
    options: ['Path tracer', 'Raster', 'Preview'],
    default: 'Path tracer',
  },
  width: { type: 'number', label: 'Width (px)', default: 3840 },
  height: { type: 'number', label: 'Height (px)', default: 2160 },
  samples: { type: 'number', label: 'Samples per pixel', default: 1024 },
  devices: { type: 'number', label: 'Devices', default: 8 },
  walltime: { type: 'duration', label: 'Time limit', default: 21600 },
  denoise: { type: 'boolean', label: 'Denoise', default: true },
  output: { type: 'string', label: 'Output directory', default: './renders/canyon' },
  format: {
    type: 'dropdown',
    label: 'Format',
    options: ['OpenEXR', 'PNG', 'TIFF'],
    default: 'OpenEXR',
  },
  notify: { type: 'boolean', label: 'Notify on completion', default: true },
  notes: {
    type: 'string',
    textarea: true,
    label: 'Render notes',
    default: 'Preserve the highlights on the canyon walls. Use the final camera path.',
    optional: true,
  },
}

export const RenderStudio = showcase(
  'Render studio',
  'From the first sample to the final frame. Configure your image, reserve the compute, and send it to delivery.',
  RENDER_FIELDS,
  {
    type: 'stack',
    css: 'gap: 2rem; padding-top: 1.5rem;',
    children: [
      { type: 'field', field: 'name', css: 'max-width: 44rem;' },
      {
        type: 'grid',
        columns: { base: 1, md: [2, 1], lg: [3, 1] },
        css: 'gap: 1.5rem;',
        children: [
          {
            type: 'section',
            label: 'Image & compute',
            description: 'Set the image quality and the resources for the batch.',
            css: '--form-surface: #1b222c; --form-accent: #d4ed7a; padding: clamp(1rem, 3%, 2rem); border: 1px solid #424b58; border-radius: 1rem; gap: 1.75rem; font-size: 1.5rem;',
            children: [
              {
                type: 'grid',
                columns: { base: 1, sm: [1, 2] },
                css: 'gap: 1.25rem;',
                children: [
                  { type: 'field', field: 'frames' },
                  { type: 'field', field: 'renderer' },
                ],
              },
              {
                type: 'grid',
                columns: { base: 1, sm: 2, md: 3 },
                css: 'gap: 0.75rem;',
                children: [
                  { type: 'field', field: 'width' },
                  { type: 'field', field: 'height' },
                  { type: 'field', field: 'samples' },
                ],
              },
              {
                type: 'grid',
                columns: { base: 1, sm: 2, md: 3 },
                css: 'gap: 0.75rem;',
                children: [
                  { type: 'field', field: 'devices' },
                  { type: 'field', field: 'walltime' },
                  { type: 'field', field: 'denoise', span: { sm: 2, md: 1 } },
                ],
              },
              { type: 'field', field: 'notes', css: 'padding-top: 0.5rem;' },
            ],
          },
          {
            type: 'section',
            label: 'Delivery',
            description: 'Choose where the finished frames go.',
            css: '--form-surface: #d4ed7a; --form-accent: #25320f; padding: 1.5rem; border-radius: 1rem; gap: 1.75rem; font-size: 1.5rem;',
            children: [
              { type: 'field', field: 'output' },
              { type: 'field', field: 'format' },
              { type: 'field', field: 'notify' },
            ],
          },
        ],
      },
    ],
  },
  '--form-surface: #10151d; --form-accent: #d4ed7a; padding: clamp(1rem, 4%, 3rem); border-radius: 1rem; font-family: "Geist Sans", sans-serif; font-size: 3rem; font-weight: 600; line-height: 1.1;',
)

const SWEEP_AXES = [
  {
    name: 'resolution',
    label: 'Resolution',
    description: 'Pixels on the longest edge.',
    values: [512, 2048, 512],
  },
  {
    name: 'samples',
    label: 'Samples',
    description: 'Samples per candidate.',
    values: [32, 128, 32],
  },
  {
    name: 'iterations',
    label: 'Iterations',
    description: 'Refinement passes per candidate.',
    values: [10, 30, 10],
  },
  {
    name: 'seed',
    label: 'Seed',
    description: 'Repeat each combination with a distinct seed.',
    values: [1, 4, 1],
  },
]
const SWEEP_FIELDS: Record<string, DemoField> = {
  name: { type: 'string', label: 'Sweep name', default: 'Quality / cost frontier' },
  ...Object.fromEntries(
    SWEEP_AXES.flatMap((axis) =>
      ['start', 'stop', 'step'].map((bound, index) => [
        `${axis.name}_${bound}`,
        {
          type: 'number',
          label: bound === 'start' ? 'From' : bound === 'stop' ? 'Through' : 'Step',
          default: axis.values[index],
        },
      ]),
    ),
  ),
  concurrency: { type: 'number', label: 'Maximum parallel runs', default: 16 },
  budget: { type: 'duration', label: 'Time limit per run', default: 1800 },
  fail_fast: { type: 'boolean', label: 'Stop on first failure', default: false },
}

export const ParameterMatrix = showcase(
  'Parameter matrix',
  'Build a sweep across four independent axes. Compare the bounds, set your limits, and find the useful edge.',
  SWEEP_FIELDS,
  {
    type: 'stack',
    css: 'gap: 2rem; padding-top: 1.5rem;',
    children: [
      { type: 'field', field: 'name', css: 'max-width: 36rem;' },
      {
        type: 'grid',
        columns: { base: 1, sm: 2, md: 4 },
        align: 'rows',
        gap: 'sm',
        css: 'column-gap: 1rem;',
        children: SWEEP_AXES.map((axis, index) => ({
          type: 'section',
          label: axis.label,
          description: axis.description,
          css: `--form-surface: ${['#f5cbbb', '#ecd99f', '#c8ded7', '#ccd8ef'][index]}; --form-accent: #342d29; padding: 1rem; border-top: 4px solid #342d29; font-size: 1.25rem;`,
          children: ['start', 'stop', 'step'].map((bound) => ({
            type: 'field',
            field: `${axis.name}_${bound}`,
            css: 'font-family: "Geist Mono", monospace; padding-block: 0.375rem;',
          })),
        })),
      },
      {
        type: 'section',
        label: 'Run limits',
        css: '--form-surface: #342d29; --form-accent: #ecd99f; padding: 1.5rem; font-size: 1.25rem;',
        children: [
          {
            type: 'grid',
            columns: { base: 1, md: 2, lg: 3 },
            css: 'gap: 1.5rem; max-width: 56rem;',
            children: [
              { type: 'field', field: 'concurrency' },
              { type: 'field', field: 'budget' },
              { type: 'field', field: 'fail_fast' },
            ],
          },
        ],
      },
    ],
  },
  '--form-surface: #faf6ef; --form-accent: #342d29; padding: clamp(1rem, 4%, 3rem); border: 2px solid #342d29; font-family: "Geist Sans", sans-serif; font-size: 3rem; font-weight: 700; line-height: 1.1;',
)

const BRIEF_FIELDS: Record<string, DemoField> = {
  name: { type: 'string', label: 'Experiment title', default: 'A quieter city' },
  question: {
    type: 'string',
    textarea: true,
    label: 'Research question',
    default:
      'How does the placement of green corridors affect street-level noise during the morning commute?',
  },
  dataset: { type: 'string', label: 'Dataset', default: './data/morning-commute.csv' },
  region: {
    type: 'dropdown',
    label: 'Study area',
    options: ['Central district', 'Riverside', 'Whole city'],
    default: 'Central district',
  },
  trials: { type: 'number', label: 'Trials', default: 48 },
  confidence: {
    type: 'dropdown',
    label: 'Confidence level',
    options: ['90%', '95%', '99%'],
    default: '95%',
  },
  hypothesis: {
    type: 'string',
    textarea: true,
    label: 'Working hypothesis',
    default:
      'Continuous green corridors will reduce noise more consistently than isolated pockets with the same total area.',
  },
  output: { type: 'string', label: 'Results directory', default: './results/green-corridors' },
  notify: { type: 'boolean', label: 'Notify when results are ready', default: true },
}

export const ResearchBrief = showcase(
  'Research brief',
  'A quieter city. An experiment in green corridors, the morning commute, and the spaces in between.',
  BRIEF_FIELDS,
  {
    type: 'grid',
    columns: { base: 1, md: 3 },
    css: 'column-gap: clamp(1rem, 4%, 3rem); row-gap: 2.5rem; padding-top: 1.5rem; font-family: "Geist Sans", sans-serif;',
    children: [
      { type: 'field', field: 'name', span: { md: 3 }, css: 'max-width: 42rem;' },
      {
        type: 'field',
        field: 'question',
        span: { md: 2 },
        css: 'padding-top: 1.5rem; border-top: 2px solid #733d38;',
      },
      {
        type: 'section',
        label: 'Evidence',
        css: '--form-surface: #e5dacb; --form-accent: #733d38; padding: 1.5rem; gap: 1.25rem; font-family: serif; font-size: 1.5rem;',
        children: [
          { type: 'field', field: 'dataset', css: 'font-family: "Geist Sans", sans-serif;' },
          { type: 'field', field: 'region', css: 'font-family: "Geist Sans", sans-serif;' },
        ],
      },
      {
        type: 'section',
        label: 'Method',
        css: 'gap: 1.25rem; padding-top: 1.5rem; border-top: 2px solid #733d38; font-size: 1.5rem; font-family: serif;',
        children: [
          { type: 'field', field: 'trials', css: 'font-family: "Geist Sans", sans-serif;' },
          { type: 'field', field: 'confidence', css: 'font-family: "Geist Sans", sans-serif;' },
        ],
      },
      {
        type: 'field',
        field: 'hypothesis',
        span: { md: 2 },
        css: 'padding-top: 1.5rem; border-top: 2px solid #733d38;',
      },
      {
        type: 'section',
        label: 'Delivery',
        span: { md: 3 },
        css: '--form-surface: #733d38; --form-accent: #f7efe2; padding: 1.5rem; font-family: serif; font-size: 1.5rem;',
        children: [
          {
            type: 'grid',
            columns: { base: 1, md: [2, 1] },
            css: 'gap: 1.5rem; font-family: "Geist Sans", sans-serif;',
            children: [
              { type: 'field', field: 'output' },
              { type: 'field', field: 'notify' },
            ],
          },
        ],
      },
    ],
  },
  '--form-surface: #f7efe2; --form-accent: #733d38; padding: clamp(1rem, 4%, 3rem); border-top: 8px solid #733d38; font-family: serif; font-size: 3rem; font-weight: 400; line-height: 1.1;',
)

export const RenderStudioNarrow: StoryObj<typeof DynamicForm> = {
  ...RenderStudio,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
}
