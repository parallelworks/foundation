import type { WorkflowJob } from './types'

/** How the graph and the job list name a job; a matrix run carries its place in the matrix. */
export function formatJobLabel(jobName: string, job?: WorkflowJob): string {
  const matrix = job?._matrix
  if (matrix?.originaljob && matrix.totalingroup !== 1) {
    const name =
      matrix.originaljob[0]!.toUpperCase() + matrix.originaljob.slice(1)
    return `${name} (${(matrix.index ?? 0) + 1}/${matrix.totalingroup ?? '?'})`
  }
  // A matrix that made one job is named as that job.
  const name = matrix?.originaljob ?? jobName
  return (name[0]!.toUpperCase() + name.slice(1)).replace(/_/g, ' ')
}
