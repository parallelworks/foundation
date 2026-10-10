// The workflow model the visual editor edits, owned here so the package never imports the host's
// workflow implementation. The names match the functions a host passes as `WorkflowEngine['editing']`.

/** A job's slot on the dependency graph's column/row grid. */
export interface GraphPosition {
  column: number
  row: number
}

/** Job name to grid slot, as stored on a workflow. */
export type GraphLayout = Record<string, GraphPosition>

/** One column's boxes, top to bottom, the row each box sits in, and the column's number. */
export interface LaidOutColumn {
  boxes: string[][]
  rows: number[]
  column: number
}

/**
 * The workflow editing the visual editor defers to: reading and rewriting the workflow's YAML,
 * its graph layout and its checks. A host built on a workflow package can pass that package's
 * functions of the same names.
 */
export interface WorkflowEditing {
  /** The job a `needs` entry points at, without a matrix's wait-for-any suffix. */
  needTarget: (need: string) => string
  /** Jobs whose matrix runs more than once as `<job>-<n>` members, the way a run lists them. */
  expandMatrixJobs: <T>(jobs: Record<string, T>) => Record<string, T>
  hasLayout: (layout: GraphLayout | undefined) => boolean
  layoutPosition: (layout: GraphLayout | undefined, job: string) => GraphPosition | undefined
  mapLayout: (
    layout: GraphLayout,
    fn: (position: GraphPosition, job: string) => GraphPosition | undefined,
  ) => GraphLayout
  /** Boxes and rows from a stored layout; jobs without a slot go below, grouped when `together` says. */
  boxesFromLayout: (
    jobNames: string[],
    deps: Record<string, string[]>,
    layout: GraphLayout,
    rules: { together: (a: string, b: string) => boolean; alone: (job: string) => boolean },
  ) => LaidOutColumn[]
}
