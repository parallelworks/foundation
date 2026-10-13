import { memo, type ReactNode } from 'react'
import { BoxGrip } from './editorRows'
import { emptyRowsStyle } from './gridSpacing'
import { type JobHandlers, Joblist } from './JobSummary'
import { useLineage, useLineageStore } from './lineage'
import type { WorkflowJob } from './types'

// The opacity a node, and a connector, outside the hovered job's lineage take, which a graph level
// sets on its wrapper while a job is hovered. Every level sets its own, so a nested graph follows
// only its own hover; and as the rest dim through these, hovering re-renders only its lineage.
const NODE_DIM = '--dag-node-dim'
const EDGE_DIM = '--dag-edge-dim'
export const nodeDim = `var(${NODE_DIM}, 1)`
export const edgeDim = `var(${EDGE_DIM}, 1)`

/** Dims what of a graph level isn't in the hovered job's lineage, while one is hovered. */
export function setDimmed(wrapper: HTMLElement, hovering: boolean) {
  wrapper.style.setProperty(NODE_DIM, hovering ? '0.5' : '1')
  wrapper.style.setProperty(EDGE_DIM, hovering ? '0.3' : '1')
}

interface NodeShell {
  id: string
  /** Empty rows of its column above this node. */
  rowsAbove: number
  zBase: number
}

/** One node of the graph: its jobs' box, raised above connectors while its lineage is shown. */
export function GraphNode({
  id,
  job,
  rowsAbove,
  zBase,
  children,
}: NodeShell & {
  /** The job hovering the node shows the lineage of. */
  job: string
  children: ReactNode
}) {
  const lineage = useLineageStore()
  // In the hovered lineage it doesn't dim; while the lineage shows, it's above the connectors.
  const highlight = useLineage((l) => l.node(job), 0)
  const enter = () => lineage?.hover(job)
  const leave = () => lineage?.hover(null)
  return (
    <div
      id={id}
      role="none"
      className="relative m-24"
      style={{ zIndex: (highlight > 0 ? 25 : 1) + zBase, ...emptyRowsStyle(rowsAbove) }}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
    >
      <div className="absolute inset-0 rounded-2xl bg-(--theme-panel-bg)" />
      <div
        className="relative border-solid shadow py-4 px-8 rounded-xl border-4 whitespace-nowrap bg-(--theme-panel-bg) text-2xl"
        style={{
          opacity: highlight === 2 ? 1 : nodeDim,
          transition: `opacity ${lineage?.animT ?? 0}s`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** A node of jobs that share their needs and dependents. */
export const JobNode = memo(function JobNode({
  jobNames,
  jobs,
  handlers,
  preview,
  editable,
  ...shell
}: NodeShell & {
  jobNames: string[]
  jobs: Record<string, WorkflowJob>
  handlers: JobHandlers
  preview: boolean
  editable: boolean
}) {
  return (
    <GraphNode {...shell} job={jobNames[0] ?? ''}>
      {editable && jobNames.length > 1 && <BoxGrip jobs={jobNames} />}
      <Joblist
        jobs={jobs}
        jobNames={jobNames}
        {...handlers}
        growWidth={true}
        preview={preview}
        editable={editable}
      />
    </GraphNode>
  )
})
