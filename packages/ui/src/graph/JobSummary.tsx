import cx from 'classnames'
import { DocumentIcon, OpenInNewGraphIcon } from '../icons'
import { TOOLTIP_ID } from '../components/Tooltip'
import type { ReactNode } from 'react'
import { Reveal } from './Reveal'
import type { WorkflowJob, WorkflowSubworkflow } from './types'
import { Indicator } from '../components/Indicator'
import {
  useNavigation,
  useSlots,
  useStrings,
  useWorkflowEngine,
} from '../components/Provider'
import { AddStepButton, EditableJobRow, EditableStepRow } from './GraphEditor'
import { formatJobLabel } from './jobLabel'

// Opens a subworkflow step's source: an in-app workflow, the repository page
// the server resolved, or a marketplace item, depending on the `uses` scheme.
function UsesIcon({
  uses,
  subworkflow,
}: {
  uses?: string | undefined
  subworkflow: WorkflowSubworkflow
}) {
  const navigation = useNavigation()
  const slots = useSlots()
  const { jobActions } = useStrings()
  if (!uses || !slots.workflowIcon) {
    return null
  }
  const open = () => navigation.openStepSource(uses, subworkflow.sourceUrl)
  return (
    <button
      type='button'
      aria-label={jobActions.openOriginalWorkflow}
      data-tooltip-id={TOOLTIP_ID}
      data-tooltip-content={jobActions.openOriginalWorkflow}
      onClick={open}
      className='cursor-pointer'
    >
      {slots.workflowIcon({
        image: subworkflow.image,
        type: subworkflow.type,
        className: 'ml-1.5 h-[1.2em] w-[1.2em]',
      })}
    </button>
  )
}

export function Joblist(inputs: {
  jobs: Record<string, WorkflowJob>
  jobNames: string[]
  onJobClick: (jobName: string) => void
  onStepClick: (jobName: string, stepName: string | number) => void
  onStepLogClick?: (jobName: string, stepIndex: number) => void
  // The secondary subworkflow action bound to the icon (the primary is the step
  // click); the icon opens the subworkflow in its own graph.
  onSubworkflowIcon?: (jobName: string, stepIndex: number) => void
  isSubworkflowExpanded?: (jobName: string, stepIndex: number) => boolean
  renderSubworkflow?: (jobName: string, stepIndex: number) => ReactNode
  isStepsOpen: (jobName: string) => boolean
  // Graph only: animate box width as steps reveal; off in the sidebar so long
  // names and icons wrap instead.
  growWidth?: boolean
  preview?: boolean
  editable?: boolean
  /** Steps take edits where their jobs don't, as a matrix's runs show its one job's steps. */
  editableSteps?: boolean
}) {
  const { jobActions } = useStrings()
  const engine = useWorkflowEngine()
  return inputs.jobNames.map(jobName => {
    // Skip synthetic matrix group nodes — rendered by the caller, not Joblist
    if (inputs.jobs[jobName]?._matrixGroup) {
      return null
    }
    const jobStatus = inputs.jobs[jobName]?.status
    const jobLabel = formatJobLabel(jobName, inputs.jobs[jobName])
    const toggle = (
      <button
        type='button'
        aria-expanded={inputs.isStepsOpen(jobName)}
        onClick={() => inputs.onJobClick(jobName)}
        className={cx(
          'flex items-center gap-x-1.5 w-full text-left',
          jobStatus === 'skipped' || jobStatus === 'skipped-failed'
            ? 'cursor-default'
            : 'cursor-pointer'
        )}
      >
        {!inputs.preview && <Indicator status={inputs.jobs[jobName]?.status} />}
        <div className='font-medium'>{jobLabel}</div>
      </button>
    )
    return (
      <div key={'job-' + jobName} className='py-1 select-none'>
        {inputs.editable ? (
          <EditableJobRow job={jobName} label={jobLabel}>
            {toggle}
          </EditableJobRow>
        ) : (
          toggle
        )}
        <Reveal
          open={inputs.isStepsOpen(jobName)}
          growWidth={inputs.growWidth ?? false}
        >
          <div className='flex flex-col gap-y-0.5 mt-0.5'>
            {(inputs.jobs[jobName]?.steps || []).map((step, i) => {
              const stepLabel = engine.stepLabel(step, i)
              const subJobs = step.subworkflow?.jobs
              const canExpand =
                !!inputs.renderSubworkflow &&
                !!subJobs &&
                Object.keys(subJobs).length > 0
              const stepButton = (
                <button
                  type='button'
                  onClick={() => inputs.onStepClick(jobName, i)}
                  className={cx(
                    inputs.preview ? 'ml-1.5' : 'ml-4',
                    'gap-x-1.5 flex items-center text-left'
                  )}
                  data-testid={stepLabel}
                >
                  {inputs.preview ? '↳' : <Indicator status={step.status} />}
                  <div>{stepLabel}</div>
                </button>
              )
              return (
                <div key={'step-' + jobName + '-' + i}>
                  <div
                    className={cx(
                      'flex items-center',
                      step.status === 'skipped' ||
                        step.status === 'skipped-failed'
                        ? 'cursor-default'
                        : 'cursor-pointer'
                    )}
                  >
                    {(inputs.editable || inputs.editableSteps) &&
                    !step.linkedStep ? (
                      <EditableStepRow
                        job={
                          inputs.jobs[jobName]?._matrix?.originaljob ?? jobName
                        }
                        index={i}
                        label={stepLabel}
                      >
                        {stepButton}
                      </EditableStepRow>
                    ) : (
                      stepButton
                    )}
                    {step.subworkflow && (
                      <>
                        {inputs.onStepLogClick && (
                          <button
                            type='button'
                            aria-label={jobActions.openSubworkflowLogs}
                            data-tooltip-id={TOOLTIP_ID}
                            data-tooltip-content={
                              jobActions.openSubworkflowLogs
                            }
                            onClick={e => {
                              e.stopPropagation()
                              inputs.onStepLogClick?.(jobName, i)
                            }}
                            className='link ml-1'
                          >
                            <DocumentIcon className='w-[1.2em] h-[1.2em]' />
                          </button>
                        )}
                        <UsesIcon
                          uses={step.uses}
                          subworkflow={step.subworkflow}
                        />
                        {inputs.onSubworkflowIcon && (
                          <button
                            type='button'
                            aria-label={jobActions.openInNewGraph}
                            data-tooltip-id={TOOLTIP_ID}
                            data-tooltip-content={jobActions.openInNewGraph}
                            onClick={e => {
                              e.stopPropagation()
                              inputs.onSubworkflowIcon?.(jobName, i)
                            }}
                            className='link ml-1'
                          >
                            <OpenInNewGraphIcon className='w-[1.2em] h-[1.2em]' />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {canExpand && inputs.renderSubworkflow?.(jobName, i)}
                </div>
              )
            })}
            {inputs.editable && <AddStepButton job={jobName} />}
          </div>
        </Reveal>
      </div>
    )
  })
}
