import type { RunStatus } from '../engine'
import { CancelIcon, FailIcon, NotRunningIcon, RunningIcon, SkipIcon, SuccessIcon } from '../icons'

export function Indicator({ status }: { status: RunStatus }) {
  return (
    <div className="h-2 flex items-center text-(--theme-panel-bg)">
      {status === 'started' || status === 'running' ? (
        <RunningIcon
          className="rounded-full text-(--theme-warning) animate-spin"
          data-testid="running-indicator"
        />
      ) : status === 'completed' ? (
        <SuccessIcon
          className="text-(--theme-success)"
          style={{ transform: 'scale(1.25)' }}
          data-testid="completed-indicator"
        />
      ) : status === 'failed' || status === 'error' ? (
        <FailIcon
          className="text-(--theme-error)"
          style={{ transform: 'scale(1.25)' }}
          data-testid="failed-indicator"
        />
      ) : status === 'skipped' || status === 'skipped-failed' ? (
        <SkipIcon
          className="text-(--theme-muted-text-color)"
          style={{ transform: 'scale(1.25)' }}
          data-testid="skipped-indicator"
        />
      ) : status === 'canceled' ? (
        <CancelIcon
          className="text-(--theme-info)"
          style={{ transform: 'scale(1.5)' }}
          data-testid="canceled-indicator"
        />
      ) : status === 'faulted' ? (
        <RunningIcon
          className="rounded-full text-(--theme-error) animate-spin"
          data-testid="faulted-indicator"
        />
      ) : status === 'canceling' ? (
        <RunningIcon
          className="rounded-full text-(--theme-info) animate-spin"
          data-testid="canceling-indicator"
        />
      ) : (
        <NotRunningIcon
          className="rounded-full text-(--theme-muted-text-color)"
          data-testid="not-running-indicator"
        />
      )}
    </div>
  )
}
