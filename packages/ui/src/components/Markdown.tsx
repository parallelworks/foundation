import cx from 'classnames'
import { lazy, Suspense } from 'react'
import type { ControlsConfig } from 'streamdown'

export interface MarkdownProps {
  children: string
  isStreaming?: boolean
  controls?: ControlsConfig
  mermaid?: boolean
  httpsImagesOnly?: boolean
  /** Sets it at the page's text size, for Markdown inside other UI rather than a document of its own. */
  compact?: boolean
}

// Streamdown pulls in the whole shiki + katex stack (~230KB compressed), so it
// only loads when markdown actually renders instead of riding the layout chunk
// onto every page.
const MarkdownImpl = lazy(() => import('./MarkdownImpl'))

export default function Markdown(props: MarkdownProps) {
  return (
    <Suspense
      fallback={
        <div
          className={cx(
            'markdown whitespace-pre-wrap text-start w-full',
            props.compact && 'markdown-compact',
          )}
        >
          {props.children}
        </div>
      }
    >
      <MarkdownImpl {...props} />
    </Suspense>
  )
}
