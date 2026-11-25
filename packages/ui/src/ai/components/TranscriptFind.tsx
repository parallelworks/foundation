import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { fieldBox } from '../../components/fieldBox'
import { IconButton } from '../../components/IconButton'
import { cx } from '../../cx'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, SearchIcon } from '../../icons'
import { useChatConfig } from '../core/config'
import { FIND_IN_TRANSCRIPT_EVENT } from '../core/events'
import { HIDDEN_WAIT_MS, listenWhileShown, onScreen } from '../core/onScreen'
import type { TextIndex } from '../core/textIndex'
import {
  countMatches,
  findPattern,
  findRanges,
  MAX_MATCHES,
  revealRange,
  rowOf,
  transcriptOf,
} from '../core/transcriptFind'
import type { ChatMessage as Message } from '../types'
import { isMac } from '../utils'

// The ::highlight() names ai.css paints.
const MATCHES = 'transcript-find'
const CURRENT = 'transcript-find-current'

/** A match: a range in a message the list draws, or the k-th match in the
 *  text of one it doesn't, which gets its range once that message is drawn. */
interface Hit {
  id: string | null
  k: number
  range: Range | null
  /** Above the messages drawn, among them, or below them. */
  where: 'before' | 'drawn' | 'after'
}

interface Found {
  hits: Hit[]
  current: number
  /** More may match than counted: a message not read yet, or the cap. */
  more: boolean
}

const NONE: Found = { hits: [], current: 0, more: false }

/** What find searches beyond what the list draws: every message of the
 *  conversation, the text the list read of those it doesn't draw, and a way
 *  to draw one. */
export interface FindSource {
  messages: Message[]
  index: TextIndex
  reveal: (messageId: string) => Promise<void>
}

// Painted with the CSS Custom Highlight API, so the transcript's DOM, which
// React owns, is never touched. A browser without it still counts and scrolls.
function paint({ hits, current }: Pick<Found, 'hits' | 'current'>) {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) {
    return
  }
  const shown = hits[current]?.range
  const others = hits.flatMap((hit) => (hit.range && hit.range !== shown ? [hit.range] : []))
  if (others.length > 0) {
    CSS.highlights.set(MATCHES, new Highlight(...others))
  } else {
    CSS.highlights.delete(MATCHES)
  }
  if (!shown) {
    CSS.highlights.delete(CURRENT)
    return
  }
  const highlight = new Highlight(shown)
  highlight.priority = 1
  CSS.highlights.set(CURRENT, highlight)
}

/** Every match of the query, in reading order: in the messages above those
 *  drawn, in those drawn, and in those below, up to MAX_MATCHES. */
function search(
  transcript: Element | null,
  query: string,
  source: FindSource | undefined,
): Omit<Found, 'current'> {
  if (!findPattern(query)) {
    return { hits: [], more: false }
  }
  const counted = new Map<string | null, number>()
  const drawn = (transcript ? findRanges(transcript, query) : []).map((range): Hit => {
    const id = transcript ? (rowOf(range.startContainer, transcript)?.dataset['row'] ?? null) : null
    const k = counted.get(id) ?? 0
    counted.set(id, k + 1)
    return { id, k, range, where: 'drawn' }
  })
  let more = drawn.length === MAX_MATCHES
  if (!source) {
    return { hits: drawn, more }
  }
  const { messages, index } = source
  const rows = new Set(
    [...(transcript?.querySelectorAll<HTMLElement>('[data-row]') ?? [])].map(
      (row) => row.dataset['row'],
    ),
  )
  const first = messages.findIndex((m) => rows.has(m.id))
  const last = messages.findLastIndex((m) => rows.has(m.id))
  const read = (from: number, to: number, where: Hit['where']) => {
    const hits: Hit[] = []
    for (const message of messages.slice(from, to)) {
      if (message.pseudo) {
        continue
      }
      const text = index.get(message)
      if (text === undefined) {
        more = true
        continue
      }
      const count = countMatches(text, query, MAX_MATCHES)
      for (let k = 0; k < count; k++) {
        hits.push({ id: message.id, k, range: null, where })
      }
    }
    return hits
  }
  const hits =
    first === -1
      ? read(0, messages.length, 'after')
      : [...read(0, first, 'before'), ...drawn, ...read(last + 1, messages.length, 'after')]
  if (hits.length > MAX_MATCHES) {
    more = true
  }
  return { hits: hits.slice(0, MAX_MATCHES), more }
}

/** The first match from the top of what the reader is looking at, as a
 *  browser's find starts from where the page is scrolled to. */
function fromView(hits: Hit[], transcript: Element | null): number {
  const top = transcript?.closest('[role="log"]')?.getBoundingClientRect().top
  const index = hits.findIndex(
    (hit) =>
      hit.where === 'after' ||
      (hit.where === 'drawn' &&
        (top === undefined ||
          !hit.range ||
          typeof hit.range.getBoundingClientRect !== 'function' ||
          hit.range.getBoundingClientRect().top >= top)),
  )
  return index === -1 ? Math.max(hits.length - 1, 0) : index
}

/** Where hit is among hits found again, or for a message that matches fewer
 *  times now, its last match there. */
function sameHit(hits: Hit[], hit: Hit | undefined): number {
  if (!hit) {
    return -1
  }
  const at = hits.findIndex((h) => h.id === hit.id && h.k === hit.k)
  return at !== -1 || hit.id === null ? at : hits.findLastIndex((h) => h.id === hit.id)
}

/** Find in the transcript under root: ⌘F or FIND_IN_TRANSCRIPT_EVENT opens it,
 *  and it finds again as the transcript streams. With a source, it also finds
 *  in the messages the list doesn't draw, and draws one to show a match in it. */
export function useTranscriptFind(
  root: RefObject<HTMLElement | null>,
  enabled: boolean,
  source?: FindSource,
) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found>(NONE)
  const [focusTick, setFocusTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const foundRef = useRef(found)
  const queryRef = useRef(query)
  const sourceRef = useRef(source)
  useLayoutEffect(() => {
    queryRef.current = query
    sourceRef.current = source
  })
  // Each landing on a match; one that finishes after a newer one began does nothing.
  const landing = useRef(0)

  const show = useCallback(() => {
    if (!inputRef.current) {
      const active = document.activeElement
      returnFocus.current = active instanceof HTMLElement ? active : null
    }
    setOpen(true)
    setFocusTick((n) => n + 1)
  }, [])

  const settle = useCallback((next: Found) => {
    foundRef.current = next
    setFound(next)
  }, [])

  // Shows the match at target: one in a message the list doesn't draw is drawn first.
  const land = useCallback(
    async (base: Omit<Found, 'current'>, target: number) => {
      const ticket = ++landing.current
      const hit = base.hits[target]
      settle({ ...base, current: target })
      if (hit && !hit.range && hit.id !== null && sourceRef.current) {
        await sourceRef.current.reveal(hit.id)
        if (ticket !== landing.current) {
          return
        }
        const again = search(transcriptOf(root.current), queryRef.current, sourceRef.current)
        const at = sameHit(again.hits, hit)
        settle({
          ...again,
          current: at === -1 ? Math.min(target, Math.max(again.hits.length - 1, 0)) : at,
        })
      }
      const range = foundRef.current.hits[foundRef.current.current]?.range
      if (range) {
        revealRange(range)
      }
    },
    [root, settle],
  )

  const step = useCallback(
    (by: 1 | -1) => {
      const { hits, current } = foundRef.current
      if (hits.length > 0) {
        void land(foundRef.current, (current + by + hits.length) % hits.length)
      }
    },
    [land],
  )
  useEffect(() => {
    if (!enabled) {
      return
    }
    const findKey = (e: KeyboardEvent) =>
      (isMac() ? e.metaKey : e.ctrlKey) && !e.altKey && ['f', 'g'].includes(e.key.toLowerCase())
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      // ⇧⌘F is the conversation shortcuts' search, and a dialog keeps its own keys.
      if (
        key === 'f' &&
        !e.shiftKey &&
        !e.defaultPrevented &&
        !document.querySelector('[aria-modal="true"]')
      ) {
        e.preventDefault()
        show()
      } else if (key === 'g' && inputRef.current) {
        e.preventDefault()
        step(e.shiftKey ? -1 : 1)
      }
    }
    const onFind = () => {
      if (onScreen(root.current)) {
        show()
      }
    }
    const stopKeys = listenWhileShown(document, () => root.current, findKey, onKeyDown)
    document.addEventListener(FIND_IN_TRANSCRIPT_EVENT, onFind)
    return () => {
      stopKeys()
      document.removeEventListener(FIND_IN_TRANSCRIPT_EVENT, onFind)
    }
  }, [enabled, show, step, root])

  useEffect(() => {
    if (open && focusTick > 0) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [open, focusTick])

  useEffect(() => {
    if (!open) {
      landing.current++
      settle(NONE)
      return
    }
    const transcript = transcriptOf(root.current)
    const base = search(transcript, query, sourceRef.current)
    void land(base, fromView(base.hits, transcript))
  }, [open, query, root, land, settle])

  // Streaming adds text, a remount replaces it, and the list reads the messages
  // it doesn't draw. Find again, keeping the reader's place rather than
  // scrolling them away from what they are reading.
  const index = source?.index
  useEffect(() => {
    const target = root.current
    if (!open || !query.trim() || !target) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const again = () => {
      if (timer) {
        return
      }
      timer = setTimeout(function find() {
        // Nothing in a hidden transcript can be found: what was stays until it shows.
        if (!onScreen(target)) {
          timer = setTimeout(find, HIDDEN_WAIT_MS)
          return
        }
        timer = undefined
        const prev = foundRef.current
        const transcript = transcriptOf(target)
        const next = search(transcript, query, sourceRef.current)
        // The first matches found while the list reads are shown as find shows any.
        if (prev.hits.length === 0 && next.hits.length > 0) {
          void land(next, fromView(next.hits, transcript))
          return
        }
        const at = sameHit(next.hits, prev.hits[prev.current])
        settle({
          ...next,
          current: at === -1 ? Math.min(prev.current, Math.max(next.hits.length - 1, 0)) : at,
        })
      }, 200)
    }
    const observer = new MutationObserver((records) => {
      const transcript = transcriptOf(target)
      // The bar's own count, the composer and the rows the list reads change
      // too; only the messages, or a remount above them, can change what matches.
      if (
        records.some(
          (r) => !transcript || transcript.contains(r.target) || r.target.contains(transcript),
        )
      ) {
        again()
      }
    })
    observer.observe(target, { childList: true, subtree: true, characterData: true })
    const stop = index?.subscribe(again)
    return () => {
      observer.disconnect()
      stop?.()
      clearTimeout(timer)
    }
  }, [open, query, root, index, land, settle])

  // The highlights are the page's, not this view's: only clear what this view painted,
  // so another view mounting or unmounting leaves an open find's matches alone.
  const painted = useRef(false)
  useEffect(() => {
    const ranged = found.hits.some((hit) => hit.range)
    if (ranged || painted.current) {
      paint(found)
      painted.current = ranged
    }
  }, [found])
  useEffect(
    () => () => {
      if (painted.current) {
        paint(NONE)
      }
    },
    [],
  )

  const close = useCallback(() => {
    setOpen(false)
    const target = returnFocus.current
    returnFocus.current = null
    if (target?.isConnected) {
      target.focus()
    }
  }, [])
  const next = useCallback(() => step(1), [step])
  const previous = useCallback(() => step(-1), [step])

  return {
    open: enabled && open,
    query,
    setQuery,
    total: found.hits.length,
    current: found.current,
    more: found.more,
    next,
    previous,
    close,
    inputRef,
  }
}

export type TranscriptFind = ReturnType<typeof useTranscriptFind>

/** The find bar over the transcript, in line with its column. */
export function TranscriptFindBar({ find }: { find: TranscriptFind }) {
  const { strings } = useChatConfig()
  const t = strings.find
  if (!find.open) {
    return null
  }
  const { total, current, more } = find
  // While the list still reads the messages it doesn't draw, the count says more may come.
  const count = !find.query.trim()
    ? ''
    : total === 0
      ? more
        ? ''
        : t.none
      : (more ? t.countCapped : t.count)(current + 1, total)

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Closes the bar, and only the bar: a running turn keeps going.
      e.preventDefault()
      find.close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        find.previous()
      } else {
        find.next()
      }
    }
  }

  return (
    <search
      aria-label={t.label}
      data-testid="transcript-find"
      className="block border-b theme-border bg-(--theme-panel-bg)"
    >
      <div className="mx-auto flex w-full max-w-[var(--chat-column,50rem)] items-center gap-1 px-4 py-2">
        <label
          className={cx(
            fieldBox({ size: 'sm', within: true, padded: false }),
            'flex flex-1 cursor-text items-center gap-2 px-2',
          )}
        >
          <SearchIcon aria-hidden="true" className="size-3 shrink-0 theme-muted-text" />
          <input
            ref={find.inputRef}
            type="text"
            value={find.query}
            onChange={(e) => find.setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t.label}
            placeholder={t.label}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-(--theme-placeholder)"
          />
          <span
            role="status"
            data-testid="transcript-find-count"
            className="shrink-0 tabular-nums theme-muted-text"
          >
            {count}
          </span>
        </label>
        <IconButton
          icon={<ChevronUpIcon />}
          label={t.previous}
          variant="ghost"
          size="sm"
          disabled={total === 0}
          onClick={find.previous}
        />
        <IconButton
          icon={<ChevronDownIcon />}
          label={t.next}
          variant="ghost"
          size="sm"
          disabled={total === 0}
          onClick={find.next}
        />
        <IconButton
          icon={<CloseIcon />}
          label={t.close}
          variant="ghost"
          size="sm"
          onClick={find.close}
        />
      </div>
    </search>
  )
}
