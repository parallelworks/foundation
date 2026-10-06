import type { Meta, StoryObj } from '@storybook/react-vite'
import { useWorkflowEditing } from '../components/Provider'
import { asRecord } from './editorFields'
import { JobDialog, type SettingsView, StepDialog } from './GraphEditorDialogs'
import { SAMPLE_WORKFLOW } from './stories/harness'

const meta: Meta = {
  title: 'UI/Workflow/Job and step dialogs',
  parameters: {
    docs: {
      description: {
        component:
          'The dialogs the graph editor opens for a job or a step. Each edits its settings as a ' +
          'form or as YAML, and Save sends them as one undoable edit.',
      },
    },
  },
}
export default meta

const COMPUTE_TARGET = `jobs:
  simulate:
    runs-on:
      mode: environment
      targetId: hpc-cluster
      environmentId: gpu-partition
      schedulingParams:
        walltime: '02:00:00'
    steps:
      - name: run
        run: ./simulate.sh
`

function Dialog({
  source,
  job,
  step,
  view = 'form',
}: {
  source: string
  job: string
  step?: number
  view?: SettingsView
}) {
  const editing = useWorkflowEditing()
  const workflow = asRecord(editing.loadYaml(source))
  const jobs = asRecord(workflow['jobs'])
  const inputs = asRecord(asRecord(asRecord(workflow['on'])['execute'])['inputs'])
  const shared = {
    inputs,
    workflow,
    source,
    view,
    onEdit: () => {},
    onClose: () => {},
  }
  if (step === undefined) {
    return <JobDialog {...shared} job={job} jobs={jobs} />
  }
  const steps = asRecord(jobs[job])['steps']
  return (
    <StepDialog
      {...shared}
      job={job}
      index={step}
      steps={Array.isArray(steps) ? steps : []}
      usesSuggestions={['workflow/deploy', 'marketplace/notify']}
    />
  )
}

/** A job's needs, condition, remote host, compute environment, matrix, env and outputs. */
export const EditJob: StoryObj = {
  render: () => <Dialog source={SAMPLE_WORKFLOW} job="build" />,
}

/** A matrix job opens as Edit matrix, with its variables in a section of their own. */
export const EditMatrixJob: StoryObj = {
  render: () => <Dialog source={SAMPLE_WORKFLOW} job="train" />,
}

/** A job that runs on a compute target, as a compute target input writes it. */
export const ComputeTarget: StoryObj = {
  render: () => <Dialog source={COMPUTE_TARGET} job="simulate" />,
}

/** A job's settings as YAML, checked against the job's part of the workflow schema. */
export const EditJobAsYaml: StoryObj = {
  render: () => <Dialog source={SAMPLE_WORKFLOW} job="build" view="yaml" />,
}

/** A step that runs a script, with what it can read a click away. */
export const EditRunStep: StoryObj = {
  render: () => <Dialog source={SAMPLE_WORKFLOW} job="build" step={0} />,
}

/** A step that uses a built-in action, with the action's own inputs. */
export const EditActionStep: StoryObj = {
  render: () => <Dialog source={SAMPLE_WORKFLOW} job="checkout" step={0} />,
}
