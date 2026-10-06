import type { Meta, StoryObj } from '@storybook/react-vite'
import { useWorkflowEditing } from '../components/Provider'
import { asRecord } from './editorFields'
import type { SettingsView } from './GraphEditorDialogs'
import { WorkflowSettingsDialog } from './WorkflowSettingsDialog'

const meta: Meta<typeof WorkflowSettingsDialog> = {
  title: 'UI/Workflow/WorkflowSettingsDialog',
  component: WorkflowSettingsDialog,
  parameters: {
    docs: {
      description: {
        component:
          'The workflow’s own settings, everything but its jobs and trigger: environment, time ' +
          'limit, permissions, sessions, links, variables and the input form’s layout.',
      },
    },
  },
}
export default meta

const SETTINGS_WORKFLOW = `env:
  LOG_LEVEL: info
timeout: '04:00:00'
permissions:
  - '*'
sessions:
  notebook:
    type: link
    redirect: true
needs:
  organizationVariables: [LICENSE_SERVER]
jobs:
  main:
    steps:
      - run: echo hi
`

function Settings({ view }: { view: SettingsView }) {
  const editing = useWorkflowEditing()
  const workflow = asRecord(editing.loadYaml(SETTINGS_WORKFLOW))
  return (
    <WorkflowSettingsDialog
      workflow={workflow}
      source={SETTINGS_WORKFLOW}
      view={view}
      onEdit={() => {}}
      onClose={() => {}}
    />
  )
}

export const Form: StoryObj<typeof WorkflowSettingsDialog> = {
  render: () => <Settings view="form" />,
}

/** The same settings as YAML; switching to the form carries the edits across. */
export const Yaml: StoryObj<typeof WorkflowSettingsDialog> = {
  render: () => <Settings view="yaml" />,
}
