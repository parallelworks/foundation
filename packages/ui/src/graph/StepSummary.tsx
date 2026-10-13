import { Loader } from '../components/Loader'
import Markdown from '../components/Markdown'
import { useRunFile, useStrings } from '../components/Provider'

// A summary is written once, when its step ends, so it is fetched without polling.
export function StepSummary({ runSlug, path }: { runSlug: string; path: string }) {
  const { dag } = useStrings()
  const { data, isLoading, error } = useRunFile(runSlug, path)
  return (
    <div className="panel border rounded min-h-0 flex-1 overflow-y-auto p-4">
      {isLoading && data === undefined ? (
        <Loader label={dag.loadingSummary} size={24} />
      ) : error || data === undefined ? (
        <p className="text-xs theme-muted-text">{dag.summaryLoadFailed}</p>
      ) : (
        <Markdown httpsImagesOnly compact>
          {data}
        </Markdown>
      )}
    </div>
  )
}
