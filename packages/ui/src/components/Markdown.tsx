import { lazy, Suspense, useEffect, useState } from 'react'
import type { Components, ControlsConfig } from 'streamdown'
import { cx } from '../cx'

export interface MarkdownProps {
  children: string
  /** Renders as text still arriving: a caret, and unfinished syntax left open. */
  isStreaming?: boolean
  /** The copy and download buttons on code blocks, tables and diagrams. */
  controls?: ControlsConfig
  /** Per-tag overrides of the rendered elements. */
  components?: Components
  httpsImagesOnly?: boolean
  /** Sets it at the page's text size, for Markdown inside other UI rather than a document of its own. */
  compact?: boolean
}

// Streamdown pulls in the whole shiki + katex stack (~230KB compressed), so it
// only loads when markdown actually renders instead of riding the layout chunk
// onto every page.
type Impl = typeof import('./MarkdownImpl')
let loaded: Impl | undefined
let loading: Promise<Impl> | undefined

/** Starts loading the renderer ahead of the markdown that needs it. A failed
 *  load is forgotten, so the next render tries again. */
export function preloadMarkdown(): Promise<Impl> {
  loading ??= import('./MarkdownImpl').then(
    (impl) => {
      loaded = impl
      return impl
    },
    (error: unknown) => {
      loading = undefined
      throw error
    },
  )
  return loading
}

const LazyMarkdownImpl = lazy(preloadMarkdown)

/** True once the renderer has loaded or failed, or `waitMs` has passed, so a
 *  host can hold markdown back rather than show it as plain text that then
 *  reflows. Starts the load. */
export function useMarkdownReady(waitMs: number): boolean {
  const [ready, setReady] = useState(() => loaded !== undefined)
  useEffect(() => {
    if (ready) {
      return
    }
    let live = true
    const done = () => {
      if (live) {
        setReady(true)
      }
    }
    const timer = setTimeout(done, waitMs)
    preloadMarkdown().then(done, done)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [ready, waitMs])
  return ready
}

/** Markdown, with highlighted code, math and mermaid diagrams. Links leave in a
 *  new tab, and inline code breaks after path separators. */
export default function Markdown(props: MarkdownProps) {
  // A lazy component shows its fallback on its first render even once its
  // module has loaded, so markdown that mounts after the load skips it. Picked
  // once per instance: switching would remount it.
  const [MarkdownImpl] = useState(() => loaded?.default ?? LazyMarkdownImpl)
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
