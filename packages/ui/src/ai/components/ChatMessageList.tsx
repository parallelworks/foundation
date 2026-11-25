import {
  type ComponentProps,
  memo,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useStrings } from '../../components/Provider'
import { useElapsed } from '../../components/relativeTime'
import { cx } from '../../cx'
import { formatDuration } from '../../format'
import { CheckIcon, ClockIcon } from '../../icons'
import { useChat, useChatStream } from '../core/ChatProvider'
import { type ApprovalAnswerHandler, useChatConfig } from '../core/config'
import { ReaderHoldContext } from '../core/readerHold'
import { createRowMemory, RowMemoryContext, useExpandAll } from '../core/rowMemory'
import type { TextIndex } from '../core/textIndex'
import { rowOf, visibleText } from '../core/transcriptFind'
import type { ChatMessage as Message } from '../types'
import Markdown from '../ui/Markdown'
import AgentMessageParts from './agent/AgentMessageParts'
import ChatMessage from './ChatMessage'
import { Reasoning, ReasoningBody } from './Reasoning'

// How long after a click or key press inside the thread its growth counts as
// the reader's own.
const READER_GROWTH_MS = 600

const NO_MESSAGES: Message[] = []

// About how many parts the list draws at a time: it starts with this many and
// draws as many again while fewer than DRAW_SCREENS screens of turns lie
// beyond the view on a side. Every row drawn holds memory, which a phone has
// little of: a long agent session drawn whole is enough for the browser to
// close the tab.
const WINDOW_PARTS = 100
const DRAW_SCREENS = 2
// Whole turns further than this from the view are let go of, so scrolling
// through a long conversation holds a few screens of it either side rather
// than all it passed. Further than DRAW_SCREENS, so what was let go of is not
// drawn again at once.
const KEEP_SCREENS = 4

/** Where a window of about WINDOW_PARTS parts that ends before `end` starts:
 *  at the prompt of the turn it reaches into, so each turn drawn has its prompt. */
function windowStart(messages: Message[], end: number): number {
  let i = end
  let held = 0
  while (i > 0 && held < WINDOW_PARTS) {
    i--
    held += 1 + (messages[i]?.parts?.length ?? 0)
  }
  return turnStart(messages, i)
}

/** Where a window of about WINDOW_PARTS parts that starts at `start` ends:
 *  with the turn it reaches into. */
function windowEnd(messages: Message[], start: number): number {
  let i = start
  let held = 0
  while (i < messages.length && held < WINDOW_PARTS) {
    held += 1 + (messages[i]?.parts?.length ?? 0)
    i++
  }
  return i > start ? turnEnd(messages, i - 1) : i
}

/** The prompt that opens the turn `i` is in. */
function turnStart(messages: Message[], i: number): number {
  let at = i
  while (at > 0 && messages[at]?.role !== 'user') {
    at--
  }
  return at
}

/** Where the turn `i` is in ends: before the next prompt. */
function turnEnd(messages: Message[], i: number): number {
  let at = i + 1
  while (at < messages.length && messages[at]?.role !== 'user') {
    at++
  }
  return at
}

/** Rows the list must not let go of: one a reader is selecting text in, or
 *  one they reached with the keyboard, which would otherwise lose its place. */
function heldRows(content: Element): HTMLElement[] {
  const doc = content.ownerDocument
  const rows: (HTMLElement | null)[] = []
  const selection = doc.getSelection()
  if (selection && !selection.isCollapsed) {
    rows.push(rowOf(selection.anchorNode, content), rowOf(selection.focusNode, content))
  }
  const active = doc.activeElement
  if (active && active !== doc.body && active.matches(':focus-visible')) {
    rows.push(rowOf(active, content))
  }
  return rows.filter((row): row is HTMLElement => row !== null)
}

// About how many parts the list reads at a time for a search, between which
// the page goes on.
const READ_PARTS = 50

/** The next messages to read for a search: those the list doesn't draw and
 *  hasn't read, about READ_PARTS parts of them, nearest the window first. */
function unread(messages: Message[], start: number, end: number, index: TextIndex): Message[] {
  const picked: number[] = []
  let parts = 0
  let up = start - 1
  let down = end
  let upward = true
  while (parts < READ_PARTS && (up >= 0 || down < messages.length)) {
    const i = (upward && up >= 0) || down >= messages.length ? up-- : down++
    upward = !upward
    const message = messages[i]
    if (!message || message.pseudo || index.get(message) !== undefined) {
      continue
    }
    picked.push(i)
    parts += 1 + (message.parts?.length ?? 0)
  }
  return picked.sort((a, b) => a - b).flatMap((i) => messages[i] ?? [])
}

const jumpClasses =
  'chat-composer chat-jump rounded-full px-3 py-1.5 text-xs font-medium theme-text transition-colors'

export type QueueDelivery = 'afterReply' | 'nextStep'

interface ChatMessageListProps {
  messages: Message[]
  allMessages: Message[]
  /** The reply being written. Left unset, the list shows the chat provider's
   *  own stream; a host that streams elsewhere passes its reply, or null. */
  streamingMessage?: Message | null
  queuedMessages?: Message[]
  onRemoveQueued?: (id: string) => void
  /** Which queued messages can still be taken back; all of them when unset.
   *  One that cannot has been handed to the running turn. */
  canRemoveQueued?: (id: string) => boolean
  /** Puts every queued message that can still be taken back into the
   *  composer, as ↑ there does. Set, the queue shows its status once under
   *  the last message of each run that reads alike, and Edit on the last
   *  line, in place of a line and Remove under each message. */
  onEditQueued?: (() => void) | undefined
  /** When a queued message reaches the model: once the running reply
   *  finishes (the chat provider's queue), or between the agent's steps for a
   *  host that steers the turn in progress. A host with both kinds says which
   *  each message is. */
  queueDelivery?: QueueDelivery | ((messageId: string) => QueueDelivery)
  editingMessageId?: string | null | undefined
  showAuthor?: boolean
  currentUsername?: string
  onNavigateBranch?: (messageId: string) => void
  onEditMessage?: ((messageId: string) => void) | undefined
  onSaveEdit?: (messageId: string, content: string) => void
  onCancelEdit?: () => void
  onRegenerateMessage?: ((messageId: string) => void) | undefined
  onRetryMessage?: ((messageId: string) => void) | undefined
  onOpenReasoning?: (reasoning: string, duration: number | null) => void
  onApprovalAnswer?: ApprovalAnswerHandler
  inputElement?: ReactNode
  /** Whether a turn is in flight, when the host tracks that itself rather
   *  than streaming through the provider. */
  isStreaming?: boolean
  /** Rows without their own side padding, for a host that pads the column. */
  flush?: boolean
  /** Draws the transcript as a terminal does: every run of tool calls folds
   *  from its first call, failures and running calls included, and a thought
   *  shows whole while it streams. */
  foldEveryRun?: boolean
  /** Names the list, a live log, for assistive technology. Defaults to the
   *  chat strings' `thread.label`. */
  label?: string
  /** Rendered after the last message, inside the scrolling column. */
  footer?: ReactNode
  /** Off for a host that shows the turn's activity elsewhere, so the wait
   *  for the first frame is not announced twice. */
  workingIndicator?: boolean
  /** Pins the prompt of the turn in view to the top once it scrolls out of
   *  sight, as a terminal transcript does; a click returns to it. */
  pinPrompt?: boolean
  /** Draws every message at once, for a host that needs all of them on the
   *  page. Otherwise a long conversation draws its end, then the turns near the
   *  view as the reader scrolls, letting go of those it left far behind. */
  whole?: boolean
  /** Keeps the text a reader sees in each message the list doesn't draw, for
   *  a search of the whole conversation that doesn't draw it all. */
  textIndex?: TextIndex | undefined
  /** Reads the messages it doesn't draw into textIndex, a few at a time. */
  indexing?: boolean | undefined
  ref?: Ref<ChatMessageListHandle> | undefined
}

export interface ChatMessageListHandle {
  /** Returns to the newest content and follows it again. */
  jumpToLatest: () => void
  /** Draws the turn a message is in and brings the message into view;
   *  resolves once it is drawn. */
  reveal: (messageId: string) => Promise<void>
}

export default function ChatMessageList({
  messages,
  allMessages,
  streamingMessage: streamingMessageProp,
  queuedMessages,
  onRemoveQueued,
  canRemoveQueued,
  onEditQueued,
  queueDelivery = 'afterReply',
  editingMessageId,
  showAuthor,
  currentUsername,
  onNavigateBranch,
  onEditMessage,
  onSaveEdit,
  onCancelEdit,
  onRegenerateMessage,
  onRetryMessage,
  onOpenReasoning,
  onApprovalAnswer,
  inputElement,
  isStreaming: isStreamingProp,
  flush,
  foldEveryRun,
  label,
  footer,
  workingIndicator = true,
  pinPrompt,
  whole = false,
  textIndex,
  indexing = false,
  ref,
}: ChatMessageListProps) {
  const { adapter, isStreaming: providerStreaming } = useChat()
  const { isThinking, streamingContent, streamingReasoning, streamingParts, thinkingStartTime } =
    useChatStream()
  const isStreaming = isStreamingProp ?? providerStreaming
  const conversationId = messages[0]?.conversationId
  // One object per token rather than per render, so the streaming row's memo
  // holds while something else re-renders the list.
  // Once tool calls have started, the reply's text streams among them in the
  // parts, in the order it came, rather than as one block below them.
  const textInParts = streamingParts.some((part) => part.kind === 'text')
  const providerStreamingMessage = useMemo<Message | null>(
    () =>
      providerStreaming && streamingContent && !textInParts
        ? {
            id: 'streaming',
            role: 'assistant',
            content: streamingContent,
            timestamp: '',
            ...(conversationId ? { conversationId } : {}),
          }
        : null,
    [providerStreaming, streamingContent, textInParts, conversationId],
  )
  const streamingMessage =
    streamingMessageProp === undefined ? providerStreamingMessage : streamingMessageProp
  const streamingPartsMessage = useMemo<Message>(
    () => ({ id: 'streaming-parts', role: 'assistant', parts: streamingParts }),
    [streamingParts],
  )
  const { strings } = useChatConfig()
  const tThinking = strings.thinking
  // Stable across renders so memoized ChatMessage rows don't re-render on
  // every streamed token.
  const attachmentDownloadUrl = useMemo(() => {
    const attachments = adapter.attachments
    return attachments ? (id: string) => attachments.downloadUrl(id) : undefined
  }, [adapter])
  const onOpenAttachment = useMemo(() => {
    const open = adapter.attachments?.onOpen
    return open ? open.bind(adapter.attachments) : undefined
  }, [adapter])
  // A row looks through every message only to attribute its turn or to move between branches. A
  // host that streams its own reply rebuilds the array for every frame of it, which would
  // re-render every finished row that reads neither.
  const readsEveryMessage = (!!showAuthor && !!currentUsername) || !!onNavigateBranch
  const rowMessages = readsEveryMessage ? allMessages : NO_MESSAGES
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const floorRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const reasoningScrollRef = useRef<HTMLDivElement>(null)

  const messageCount = messages.length
  const streamingText = streamingMessage?.content
  const streamingMessageParts = streamingMessage?.parts

  const [finalThinkingDuration, setFinalThinkingDuration] = useState<number | null>(null)
  const [reasoningOpen, setReasoningOpen] = useState(false)

  // Track when thinking finishes to capture the final duration
  const wasThinkingRef = useRef(false)
  useEffect(() => {
    if (isThinking && !wasThinkingRef.current) {
      // Started thinking
      wasThinkingRef.current = true
      setFinalThinkingDuration(null)
    } else if (!isThinking && wasThinkingRef.current && thinkingStartTime) {
      // Stopped thinking - capture final duration
      wasThinkingRef.current = false
      setFinalThinkingDuration(Date.now() - thinkingStartTime)
    }
  }, [isThinking, thinkingStartTime])

  // Reset when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      wasThinkingRef.current = false
      setFinalThinkingDuration(null)
      setReasoningOpen(false)
    }
  }, [isStreaming])

  // Auto-scroll reasoning preview to bottom as content streams
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content change
  useEffect(() => {
    if (reasoningScrollRef.current && isThinking) {
      reasoningScrollRef.current.scrollTop = reasoningScrollRef.current.scrollHeight
    }
  }, [streamingReasoning, isThinking])

  // The first message drawn once the reader has left the end or scrolled up
  // for more; until then the window follows the end as the conversation grows.
  const [from, setFrom] = useState<string | null>(null)
  // The last message drawn once the reader has scrolled far enough from the
  // end that it was let go of; until then the window reaches the end.
  const [to, setTo] = useState<string | null>(null)
  const endStart = useMemo(() => windowStart(messages, messages.length), [messages])
  const indexOf = useMemo(() => new Map(messages.map((m, i) => [m.id, i])), [messages])
  const fromIndex = from === null ? -1 : (indexOf.get(from) ?? -1)
  const toIndex = to === null ? -1 : (indexOf.get(to) ?? -1)
  const start = whole ? 0 : fromIndex >= 0 ? fromIndex : endStart
  const end = whole || toIndex < start ? messages.length : toIndex + 1
  const attached = end === messages.length
  const drawn = useMemo(
    () => (start === 0 && end === messages.length ? messages : messages.slice(start, end)),
    [messages, start, end],
  )
  // What the reader opened in rows let go of, for when they are drawn again. Expand-all opens or
  // closes every block at once, those not drawn included, and a new conversation starts afresh.
  const expandAll = useExpandAll()
  const [conversations, setConversations] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new memory for each, not read from them
  const memory = useMemo(() => createRowMemory(), [expandAll, conversations])
  const windowRef = useRef({ messages, indexOf, start, end, whole, editingMessageId, textIndex })
  useLayoutEffect(() => {
    windowRef.current = { messages, indexOf, start, end, whole, editingMessageId, textIndex }
  })
  // What a search read of the messages depends on what the reader opened in them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new memory means what was read is stale
  useEffect(() => {
    textIndex?.clear()
  }, [memory, textIndex])
  // The messages a search is reading now: drawn out of sight, read, let go of.
  const [reading, setReading] = useState<Message[]>(NO_MESSAGES)
  const readerRef = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new memory clears what was read, so reading starts again
  useEffect(() => {
    if (!indexing || !textIndex || reading.length > 0) {
      return
    }
    // The page goes on between batches.
    const timer = setTimeout(() => {
      const next = unread(messages, start, end, textIndex)
      if (next.length > 0) {
        setReading(next)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [indexing, textIndex, reading, messages, start, end, memory])
  useLayoutEffect(() => {
    if (reading.length === 0 || !textIndex) {
      return
    }
    const rows = [...(readerRef.current?.children ?? [])]
    for (const message of reading) {
      const row = rows.find((r) => r instanceof HTMLElement && r.dataset['row'] === message.id)
      textIndex.set(message, row ? visibleText(row) : '')
    }
    setReading(NO_MESSAGES)
  }, [reading, textIndex])
  // The first row in view and where it was, so the rows drawn or let go of
  // around it leave what the reader is looking at where it is.
  const keptRef = useRef<{ row: Element; top: number } | null>(null)
  const jumpedRef = useRef(false)
  // A message reveal is drawing, and what to call once it shows.
  const revealRef = useRef<{ id: string; done: () => void } | null>(null)

  // Draws the turns beyond either edge of the window once the reader is
  // within DRAW_SCREENS of it, or the window doesn't fill the view, and lets
  // go of whole turns more than KEEP_SCREENS from the view.
  const fitWindow = useCallback(() => {
    const el = containerRef.current
    const content = contentRef.current
    if (!el || !content) {
      return
    }
    const rows = [...content.querySelectorAll<HTMLElement>(':scope > [data-row]')]
    const box = el.getBoundingClientRect()
    // While the reply being written fills the view no row is in it, and the
    // last row, just above, stands for the place to keep.
    const shown = rows.find((row) => row.getBoundingClientRect().bottom > box.top) ?? rows.at(-1)
    keptRef.current = shown ? { row: shown, top: shown.getBoundingClientRect().top } : null
    const { messages: all, indexOf: at, start: first, end: last, whole: every } = windowRef.current
    const view = el.clientHeight
    // Not laid out yet, as in a hidden tab: its size says nothing about what fills it.
    if (every || view === 0 || rows.length === 0) {
      return
    }
    if (first > 0 && el.scrollTop <= view * DRAW_SCREENS) {
      setFrom(all[windowStart(all, first)]?.id ?? null)
      return
    }
    if (last < all.length && el.scrollHeight - el.scrollTop - view <= view * DRAW_SCREENS) {
      const next = windowEnd(all, last)
      setTo(next >= all.length ? null : (all[next - 1]?.id ?? null))
      return
    }
    const indexOfRow = (row: HTMLElement | undefined) => at.get(row?.dataset['row'] ?? '') ?? -1
    const keepTop = box.top - view * KEEP_SCREENS
    const keepBottom = box.top + view + view * KEEP_SCREENS
    const near = rows.filter((row) => {
      const r = row.getBoundingClientRect()
      return r.bottom >= keepTop && r.top <= keepBottom
    })
    const held = heldRows(content).map(indexOfRow)
    const editing = windowRef.current.editingMessageId
    if (editing) {
      held.push(at.get(editing) ?? -1)
    }
    const keep = [...held.filter((i) => i >= first && i < last), ...near.map(indexOfRow)]
    const lowest = keep.length > 0 ? Math.min(...keep) : indexOfRow(rows.at(-1))
    const highest = keep.length > 0 ? Math.max(...keep) : indexOfRow(rows[0])
    // A search reads a row let go of from what it showed, as the reader left it.
    const remember = (gone: (i: number) => boolean) => {
      const index = windowRef.current.textIndex
      for (const row of index ? rows : []) {
        const message = all[indexOfRow(row)]
        if (message && gone(indexOfRow(row))) {
          index?.set(message, visibleText(row))
        }
      }
    }
    const keepFrom = turnStart(all, lowest)
    if (keepFrom > first) {
      remember((i) => i < keepFrom)
      setFrom(all[keepFrom]?.id ?? null)
      return
    }
    const keepTo = turnEnd(all, highest)
    if (keepTo < last) {
      remember((i) => i >= keepTo)
      setTo(all[keepTo - 1]?.id ?? null)
    }
  }, [])

  // Stick-to-bottom: follow new content only while the user sits at the
  // bottom. Scrolling up releases it; scrolling back down to the bottom
  // re-arms it. Release must win over the autoscroll that grows the content
  // under the user, so wheel/touch release immediately (before any scroll
  // event is interpreted) and the scroll handler only re-arms on downward
  // movement — an upward scroll that stays within the threshold can never
  // flip the flag back.
  const isNearBottomRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  // Mirrors the ref for the jump control; the ref stays the source of truth
  // for the scroll effects so a re-render never races them.
  const [pinned, setPinned] = useState(true)
  // When the reader last clicked or typed in the rows: growth that soon after is theirs.
  const touchedAtRef = useRef(Number.NEGATIVE_INFINITY)
  const releaseReaderHold = useCallback(() => {
    touchedAtRef.current = Number.NEGATIVE_INFINITY
  }, [])

  const handleScroll = useCallback(() => {
    if (!containerRef.current) {
      return
    }
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const scrolledDown = scrollTop >= lastScrollTopRef.current
    lastScrollTopRef.current = scrollTop
    const { messages: all, end: last } = windowRef.current
    if (scrollHeight - scrollTop - clientHeight < 24) {
      // The foot of a window that doesn't reach the end is not the latest.
      if (scrolledDown && last === all.length) {
        isNearBottomRef.current = true
      }
    } else if (!scrolledDown) {
      // Only moving up leaves the bottom. Content that grows before a scroll to
      // it reports, such as a picture loading, opens a gap on the way down.
      isNearBottomRef.current = false
    }
    setPinned(isNearBottomRef.current)
    fitWindow()
  }, [fitWindow])

  // Reads the position first: a jump up that its scroll event has not reported
  // yet has to count, or following would undo it before it was ever seen.
  const followBottom = useCallback(() => {
    const el = containerRef.current
    if (!el || !isNearBottomRef.current) {
      return
    }
    handleScroll()
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight
      lastScrollTopRef.current = el.scrollTop
    }
  }, [handleScroll])

  // Assigned, not animated: smooth scroll is throttled to nothing in a hidden tab.
  const jumpToLatest = useCallback(() => {
    const el = containerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      lastScrollTopRef.current = el.scrollTop
      isNearBottomRef.current = true
      setPinned(true)
    }
    // A window that had let go of the end draws it, and goes to it once drawn.
    jumpedRef.current = windowRef.current.end < windowRef.current.messages.length
    setFrom(null)
    setTo(null)
  }, [])

  const reveal = useCallback(
    (id: string) =>
      new Promise<void>((resolve) => {
        const { messages: all, indexOf: at, start: first, end: last } = windowRef.current
        const i = at.get(id)
        if (i === undefined || (i >= first && i < last)) {
          resolve()
          return
        }
        revealRef.current?.done()
        revealRef.current = { id, done: resolve }
        isNearBottomRef.current = false
        setPinned(false)
        const from = turnStart(all, i)
        const to = Math.max(windowEnd(all, from), turnEnd(all, i))
        setFrom(all[from]?.id ?? null)
        setTo(to >= all.length ? null : (all[to - 1]?.id ?? null))
      }),
    [],
  )

  // A reader who left the end keeps the turns they left it from, as new
  // ones arrive below.
  useEffect(() => {
    if (!pinned) {
      setFrom((f) => f ?? windowRef.current.messages[windowRef.current.start]?.id ?? null)
    }
  }, [pinned])

  // A search drew every message, and the reader may be reading one it found.
  useEffect(() => {
    if (whole) {
      setFrom(windowRef.current.messages[0]?.id ?? null)
      setTo(null)
    }
  }, [whole])

  useImperativeHandle(ref, () => ({ jumpToLatest, reveal }), [jumpToLatest, reveal])

  // Attach listeners once the container exists (it is absent in the empty state)
  const queuedCount = queuedMessages?.length ?? 0
  const grouped = !!onEditQueued
  const queued = (queuedMessages ?? []).map((msg) => {
    const handedOver = !(canRemoveQueued?.(msg.id) ?? true)
    const delivery = typeof queueDelivery === 'function' ? queueDelivery(msg.id) : queueDelivery
    return { msg, handedOver, delivery, reads: handedOver ? 'handedOver' : delivery }
  })
  const editable = queued.some((q) => !q.handedOver)
  const hasContent = messages.length > 0 || !!streamingMessage || queuedCount > 0
  const awaitingApproval = streamingParts.some((part) => part.kind === 'approval' && !part.resolved)
  const showWorkingIndicator =
    workingIndicator &&
    isStreaming &&
    !streamingReasoning &&
    !streamingMessage &&
    !textInParts &&
    !awaitingApproval
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasContent re-attaches once the container mounts; it is absent in the empty state.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const releaseOnWheelUp = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        isNearBottomRef.current = false
        setPinned(false)
      }
    }
    const releaseOnTouch = () => {
      isNearBottomRef.current = false
      setPinned(false)
    }
    container.addEventListener('scroll', handleScroll)
    container.addEventListener('wheel', releaseOnWheelUp, { passive: true })
    container.addEventListener('touchmove', releaseOnTouch, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('wheel', releaseOnWheelUp)
      container.removeEventListener('touchmove', releaseOnTouch)
    }
  }, [handleScroll, hasContent])

  // The prompt the pin shows, and the scrollbar's width so the pin lines up
  // with the column it overlays.
  const [anchor, setAnchor] = useState<string | null>(null)
  const [gutter, setGutter] = useState(0)
  const anchorFrameRef = useRef(0)
  const findAnchor = useCallback(() => {
    if (!pinPrompt) {
      return
    }
    cancelAnimationFrame(anchorFrameRef.current)
    anchorFrameRef.current = requestAnimationFrame(() => {
      const el = containerRef.current
      setAnchor(el ? promptAbove(el) : null)
      setGutter(el ? el.offsetWidth - el.clientWidth : 0)
    })
  }, [pinPrompt])

  // biome-ignore lint/correctness/useExhaustiveDependencies: hasContent re-attaches once the container mounts; it is absent in the empty state.
  useEffect(() => {
    const container = containerRef.current
    if (!container || !pinPrompt) {
      return
    }
    findAnchor()
    container.addEventListener('scroll', findAnchor, { passive: true })
    return () => {
      container.removeEventListener('scroll', findAnchor)
      cancelAnimationFrame(anchorFrameRef.current)
    }
  }, [findAnchor, hasContent, pinPrompt])

  const jumpToPrompt = useCallback(() => {
    const el = containerRef.current
    const row = el
      ? [...el.querySelectorAll<HTMLElement>('[data-prompt]')].find(
          (r) => r.dataset['prompt'] === anchor,
        )
      : undefined
    if (!el || !row) {
      return
    }
    isNearBottomRef.current = false
    setPinned(false)
    const top = el.scrollTop + row.getBoundingClientRect().top - el.getBoundingClientRect().top
    el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    // The pin goes once its prompt shows, so focus moves to the prompt rather than to the page.
    row.focus({ preventScroll: true })
  }, [anchor])

  // Scroll to bottom on initial load / conversation switch — runs before paint
  const hadMessagesRef = useRef(false)
  useLayoutEffect(() => {
    if (!containerRef.current || messageCount === 0) {
      return
    }
    if (!hadMessagesRef.current) {
      // First time we have messages — snap to bottom before paint
      hadMessagesRef.current = true
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messageCount])

  // Rows drawn or let go of above the one in view move it by their height:
  // scrolled by as much, the view stays put. A browser that anchors its scroll
  // has already done it, and nothing is left to move.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs as the window moves, which the effect measures rather than reads
  useLayoutEffect(() => {
    const el = containerRef.current
    const kept = keptRef.current
    const revealing = revealRef.current
    if (revealing) {
      revealRef.current = null
      const row = [...(contentRef.current?.children ?? [])].find(
        (r) => r instanceof HTMLElement && r.dataset['row'] === revealing.id,
      )
      if (el && row) {
        el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top
        lastScrollTopRef.current = el.scrollTop
      }
      revealing.done()
    } else if (el && jumpedRef.current) {
      jumpedRef.current = false
      el.scrollTop = el.scrollHeight
      lastScrollTopRef.current = el.scrollTop
    } else if (el && kept?.row.isConnected) {
      const moved = kept.row.getBoundingClientRect().top - kept.top
      if (Math.abs(moved) >= 1) {
        el.scrollTop += moved
        lastScrollTopRef.current = el.scrollTop
      }
    }
    // Rows let go of can leave the list shorter than the position, and the
    // browser moves it up to the new end. That move is not the reader's: read
    // as one, the next follow of the end sees a scroll up and stops following.
    if (
      el &&
      el.scrollTop < lastScrollTopRef.current &&
      el.scrollHeight - el.clientHeight - el.scrollTop < 1
    ) {
      lastScrollTopRef.current = el.scrollTop
    }
    fitWindow()
  }, [start, end, fitWindow])

  // Reset hadMessages when conversation switches (messages go to 0 then back)
  useEffect(() => {
    if (messageCount === 0) {
      hadMessagesRef.current = false
      lastScrollTopRef.current = 0
      setFrom(null)
      setTo(null)
      setConversations((n) => n + 1)
    }
  }, [messageCount])

  // Follows new content before it paints, streamed or not. Not animated: the
  // rest of a transcript a host catches up on after the list opened would
  // otherwise glide in over the reader's first look at it. Queued messages
  // render below the reply, so following it is what keeps them on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content/message changes
  useLayoutEffect(() => {
    followBottom()
  }, [streamingText, streamingParts, streamingMessageParts, messageCount, isStreaming, queuedCount])

  // Follows content that grows after its reply finished, such as a card that
  // keeps showing what a tool is doing, while the reader sits at the bottom.
  //
  // It also holds the list at the content's last observed height until the
  // next observation. WebKit lays the list out partway through inserting an
  // inline SVG sized by its attributes, before the inserted rows count toward
  // the list's height. Rows swapped near the bottom (the finished reply taking
  // the streaming row's place, markdown replacing its loading text) would
  // otherwise clamp the position by their height, and the scroll event that
  // follows would read as the reader scrolling up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasContent re-observes once the content mounts; it is absent in the empty state.
  useEffect(() => {
    const content = contentRef.current
    const floor = floorRef.current
    const dock = dockRef.current
    if (!content || !floor || typeof ResizeObserver === 'undefined') {
      return
    }
    // Growth the reader caused, such as opening a tool's row, stays put: the
    // row they clicked must not jump out from under the pointer.
    const touched = () => {
      touchedAtRef.current = performance.now()
    }
    content.addEventListener('click', touched, true)
    content.addEventListener('keydown', touched, true)
    const observer = new ResizeObserver(() => {
      floor.style.minHeight = `${content.offsetHeight}px`
      if (performance.now() - touchedAtRef.current > READER_GROWTH_MS) {
        followBottom()
      }
      findAnchor()
      fitWindow()
    })
    observer.observe(content)
    // The composer sticks to the list's bottom edge, so as it grows, with a
    // line typed or a row of chips, it would cover the last lines.
    if (dock) {
      observer.observe(dock)
    }
    return () => {
      observer.disconnect()
      content.removeEventListener('click', touched, true)
      content.removeEventListener('keydown', touched, true)
    }
  }, [hasContent, findAnchor, fitWindow])

  // One keyed dock in both states, so the composer is not remounted as the
  // first message comes and goes: a send it is waiting on puts its text back
  // into the box it came from.
  const dock = inputElement && (
    <div key="composer" ref={dockRef} data-composer-dock="" className="sticky bottom-0 z-10">
      {/* Rides on the composer's top edge: on its own it would stick at the
          same bottom as the composer and sit underneath it. */}
      {hasContent && !pinned && (
        <div className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center pb-2">
          <button
            type="button"
            onClick={jumpToLatest}
            className={cx(jumpClasses, 'pointer-events-auto')}
          >
            {strings.chrome.jumpToLatest}
          </button>
        </div>
      )}
      {inputElement}
    </div>
  )

  // If no messages and no streaming, just return empty scrollable container
  // The parent page handles the welcome/empty state UI. Queued messages still
  // render — a canceled first turn must keep them visible.
  if (!hasContent) {
    return (
      <div className="chat-thread flex-1 overflow-y-auto flex flex-col bg-(--theme-panel-bg)">
        <div className="flex-1" />
        {footer && (
          <div className={cx('w-full max-w-[var(--chat-column,50rem)] mx-auto', !flush && 'px-4')}>
            {footer}
          </div>
        )}
        {dock}
      </div>
    )
  }

  const pinnedText = pinPrompt && anchor ? promptLine(messages.find((m) => m.id === anchor)) : ''

  const rowProps = {
    conversation: messages,
    allMessages: rowMessages,
    prompts: !!pinPrompt,
    flush,
    foldEveryRun,
    editingMessageId,
    showAuthor,
    currentUsername,
    attachmentDownloadUrl,
    onOpenAttachment,
    onNavigateBranch,
    onEditMessage,
    onSaveEdit,
    onCancelEdit,
    onRegenerateMessage,
    onRetryMessage,
    onOpenReasoning,
    onApprovalAnswer,
  }

  // Out of sight and out of reach: the rows a search reads, as they would show.
  const reader = textIndex && (
    <div
      ref={readerRef}
      aria-hidden="true"
      inert
      className="pointer-events-none fixed top-0 left-0 h-0 w-full max-w-[var(--chat-column,50rem)] overflow-hidden opacity-0 [contain:strict]"
    >
      {reading.length > 0 && (
        <RowMemoryContext value={memory}>
          <MessageRows
            {...rowProps}
            messages={reading}
            attached={reading.at(-1) === messages.at(-1)}
            streaming={false}
          />
        </RowMemoryContext>
      )}
    </div>
  )

  const list = (
    <div
      ref={containerRef}
      // A live log: each new message is announced as it is added. Busy while a
      // reply streams, so a screen reader reads it once rather than word by word.
      role="log"
      aria-relevant="additions"
      aria-label={label ?? strings.thread.label}
      aria-busy={isStreaming || undefined}
      // Scroll anchoring keeps a reader who scrolled up in place. At the bottom
      // the list follows on its own, and an anchoring adjustment (WebKit makes
      // one when markdown replaces its loading text) would read as the reader
      // scrolling up.
      className={cx(
        'chat-thread flex-1 overflow-y-auto theme-scrollbar flex flex-col bg-(--theme-panel-bg)',
        pinned && '[overflow-anchor:none]',
      )}
    >
      {/* Holds the content's last observed height: see the resize observer. */}
      <div ref={floorRef} className="flex-1">
        <div
          ref={contentRef}
          data-transcript=""
          className="w-full max-w-[var(--chat-column,50rem)] mx-auto pt-4 pb-6 px-4"
        >
          <ReaderHoldContext value={releaseReaderHold}>
            <RowMemoryContext value={memory}>
              <MessageRows
                {...rowProps}
                messages={drawn}
                attached={attached}
                streaming={!!streamingMessage}
              />
              {/* Thinking / "Thought for" section — visible during and after thinking */}
              {attached && isStreaming && streamingReasoning && (
                <div key="thinking" className="animate-chat-enter">
                  <div className={cx('pt-3', !flush && 'sm:px-4')}>
                    <Reasoning
                      label={
                        <ThinkingLabel
                          startedAt={isThinking ? thinkingStartTime : undefined}
                          finalDuration={finalThinkingDuration}
                        />
                      }
                      shimmer={isThinking}
                      open={reasoningOpen}
                      onOpenChange={setReasoningOpen}
                      onOpenPanel={
                        onOpenReasoning &&
                        (() => onOpenReasoning(streamingReasoning, finalThinkingDuration))
                      }
                      // While thinking, its tail, faded at the top, so the work shows without taking the page.
                      preview={
                        isThinking && (
                          <ReasoningBody className="chat-reasoning-tail">
                            <div ref={reasoningScrollRef} className="max-h-20 overflow-y-hidden">
                              <Markdown isStreaming>{streamingReasoning}</Markdown>
                            </div>
                          </ReasoningBody>
                        )
                      }
                    >
                      <Markdown isStreaming={isThinking}>{streamingReasoning}</Markdown>
                    </Reasoning>
                  </div>
                </div>
              )}
              {/* Tool calls and other parts streamed this turn, between the
                thinking header and the answer — mirrors the stored-message
                layout where parts precede content. */}
              {attached && isStreaming && streamingParts.length > 0 && (
                <div
                  key="streaming-parts"
                  className={cx('animate-chat-enter py-1', !flush && 'sm:px-4')}
                >
                  <AgentMessageParts message={streamingPartsMessage} isStreaming={isStreaming} />
                </div>
              )}
              {/* Working indicator — until the answer starts streaming */}
              {attached && showWorkingIndicator && (
                <div key="waiting" className="animate-chat-enter">
                  <div className={cx('py-3', !flush && 'sm:px-4')}>
                    <div className="animate-shimmer text-shimmer text-sm">{tThinking.ellipsis}</div>
                  </div>
                </div>
              )}
              {attached && streamingMessage && (
                <div key="streaming" className="animate-chat-enter">
                  <ChatMessage
                    message={streamingMessage}
                    allMessages={rowMessages}
                    flush={flush}
                    foldEveryRun={foldEveryRun}
                    isStreaming={isStreaming}
                    attachmentDownloadUrl={attachmentDownloadUrl}
                    onOpenAttachment={onOpenAttachment}
                    onApprovalAnswer={onApprovalAnswer}
                  />
                </div>
              )}
              {attached &&
                queued.map(({ msg, handedOver, delivery, reads }, i) => (
                  <QueuedMessage
                    key={msg.id}
                    message={msg}
                    allMessages={rowMessages}
                    flush={flush}
                    attachmentDownloadUrl={attachmentDownloadUrl}
                    onOpenAttachment={onOpenAttachment}
                    handedOver={handedOver}
                    delivery={delivery}
                    // Grouped, a run of messages that read alike says so once, under its last.
                    showStatus={!grouped || queued[i + 1]?.reads !== reads}
                    grouped={grouped}
                    stacked={grouped && i > 0}
                    onRemove={!grouped && !handedOver ? onRemoveQueued : undefined}
                    onEdit={
                      grouped && editable && i === queued.length - 1 ? onEditQueued : undefined
                    }
                  />
                ))}
              {attached && footer}
            </RowMemoryContext>
          </ReaderHoldContext>
          <div className="h-8" />
        </div>
      </div>
      {!pinned && !inputElement && (
        <div className="sticky bottom-4 z-10 flex h-0 items-start justify-center overflow-visible">
          <button
            type="button"
            onClick={jumpToLatest}
            className={cx(jumpClasses, '-translate-y-full')}
          >
            {strings.chrome.jumpToLatest}
          </button>
        </div>
      )}
      {dock}
    </div>
  )

  if (!pinPrompt) {
    return (
      <>
        {list}
        {reader}
      </>
    )
  }
  // The pin lies over the log rather than in it, so its coming and going is
  // not announced as a new message. It comes first so the tab order meets it
  // where it shows, at the top.
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {anchor && pinnedText && (
        <PinnedPrompt
          text={pinnedText}
          label={strings.thread.jumpToPrompt(pinnedText)}
          gutter={gutter}
          flush={flush}
          onJump={jumpToPrompt}
        />
      )}
      {list}
      {reader}
    </div>
  )
}

/** The prompt whose turn the top of the view is in, once all of it has
 *  scrolled above; null while any of it still shows. A prompt at the very top
 *  edge opens the turn in view, so the one before it is not pinned. */
function promptAbove(container: HTMLElement): string | null {
  const top = container.getBoundingClientRect().top
  const prompts = [...container.querySelectorAll<HTMLElement>('[data-prompt]')]
  for (const row of prompts.reverse()) {
    if (row.getBoundingClientRect().top <= top + 1) {
      const bubble = row.querySelector('.chat-bubble-user') ?? row
      return bubble.getBoundingClientRect().bottom <= top ? (row.dataset['prompt'] ?? null) : null
    }
  }
  return null
}

/** The prompt's first line, marked when more follows, as the terminal pins it. */
function promptLine(message: Message | undefined): string {
  const [head = '', ...rest] = (message?.content ?? '').trim().split('\n')
  return rest.some((line) => line.trim()) ? `${head}…` : head
}

/** Floats over the thread like the jump pill, with its edge, shadow and focus
 *  ring, in the wash of the reader's own bubble. */
function PinnedPrompt({
  text,
  label,
  gutter,
  flush,
  onJump,
}: {
  text: string
  label: string
  gutter: number
  flush: boolean | undefined
  onJump: () => void
}) {
  return (
    <div
      className="chat-prompt-pin pointer-events-none absolute inset-x-0 top-0 z-20"
      style={{ right: gutter }}
    >
      <div
        className={cx(
          'mx-auto flex w-full max-w-[var(--chat-column,50rem)] justify-end px-4 py-2',
          !flush && 'sm:px-8',
        )}
      >
        <button
          type="button"
          aria-label={label}
          onClick={onJump}
          className="chat-composer pointer-events-auto flex min-w-0 max-w-[80%] cursor-pointer items-center rounded-full px-4 py-1.5 text-sm leading-5 chat-ink"
        >
          <span className="min-w-0 truncate">{text}</span>
        </button>
      </div>
    </div>
  )
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function QueueAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="rounded font-medium underline-offset-2 hover:theme-text hover:underline"
      >
        {children}
      </button>
    </>
  )
}

/** "Thinking (12s)" while it thinks, then how long it took. Its own component,
 *  so the clock re-renders only this label, not the list. */
function ThinkingLabel({
  startedAt,
  finalDuration,
}: {
  /** When the thinking under way began; unset once it ends. */
  startedAt: number | null | undefined
  /** How long it took, in milliseconds, once it has ended. */
  finalDuration: number | null
}) {
  const t = useChatConfig().strings.thinking
  const elapsed = useElapsed(startedAt)
  if (startedAt) {
    return elapsed ? `${t.label} (${formatDuration(elapsed)})` : t.ellipsis
  }
  return t.thoughtFor(formatDuration(finalDuration ?? 0))
}

/** A message waiting on the running turn. Memoized apart from the list, which
 *  re-renders for every streamed token while the queue waits under the reply. */
const QueuedMessage = memo(function QueuedMessage({
  message,
  allMessages,
  flush,
  attachmentDownloadUrl,
  onOpenAttachment,
  handedOver,
  delivery,
  showStatus,
  grouped,
  stacked,
  onRemove,
  onEdit,
}: {
  message: Message
  allMessages: Message[]
  flush: boolean | undefined
  attachmentDownloadUrl: ((id: string) => string) | undefined
  onOpenAttachment: ComponentProps<typeof ChatMessage>['onOpenAttachment']
  /** Already given to the running turn, so sent and no longer removable. */
  handedOver: boolean
  delivery: QueueDelivery
  showStatus: boolean
  /** In a queue that says its status once and offers Edit for all of it, so
   *  the message keeps no actions of its own. */
  grouped: boolean
  /** Sits just under the queued message before it. */
  stacked: boolean
  onRemove: ((id: string) => void) | undefined
  onEdit: (() => void) | undefined
}) {
  const { queue } = useChatConfig().strings
  const { common } = useStrings()
  return (
    // Waiting, not faded: full-contrast text in an outline rather than a
    // filled bubble, with a line saying when it reaches the model. One already
    // handed to the running turn is sent, so it is filled.
    <div className={cx('animate-chat-enter', !handedOver && 'chat-queued')}>
      <ChatMessage
        message={message}
        allMessages={allMessages}
        flush={flush}
        attachmentDownloadUrl={attachmentDownloadUrl}
        onOpenAttachment={onOpenAttachment}
        actions={!grouped}
        stacked={stacked}
        status={
          showStatus && (
            <div
              data-testid="queued-status"
              className="flex items-center justify-end gap-2 text-xs theme-muted-text"
            >
              {handedOver ? <CheckIcon className="h-3 w-3" /> : <ClockIcon className="h-3 w-3" />}
              <span>
                {handedOver
                  ? queue.handedOver
                  : delivery === 'nextStep'
                    ? queue.waitingNextStep
                    : queue.waiting}
              </span>
              {onEdit && (
                <QueueAction label={queue.editLabel} onClick={onEdit}>
                  {queue.edit}
                </QueueAction>
              )}
              {onRemove && (
                <QueueAction label={queue.remove} onClick={() => onRemove(message.id)}>
                  {common.remove}
                </QueueAction>
              )}
            </div>
          )
        }
      />
    </div>
  )
})

// The list's optional props arrive here as possibly undefined.
type Passed<T> = { [K in keyof T]-?: T[K] | undefined }

type MessageRowsProps = Pick<ChatMessageListProps, 'messages' | 'allMessages'> &
  Passed<
    Pick<
      ChatMessageListProps,
      | 'messages'
      | 'allMessages'
      | 'flush'
      | 'foldEveryRun'
      | 'editingMessageId'
      | 'showAuthor'
      | 'currentUsername'
      | 'onNavigateBranch'
      | 'onEditMessage'
      | 'onSaveEdit'
      | 'onCancelEdit'
      | 'onRegenerateMessage'
      | 'onRetryMessage'
      | 'onOpenReasoning'
      | 'onApprovalAnswer'
    >
  > & {
    /** Every message of the conversation, of which `messages` are those drawn. */
    conversation: Message[]
    /** The drawn messages reach the conversation's end, so its last is among them. */
    attached: boolean
    /** A reply is being written below these, so none of them is the latest. */
    streaming: boolean
    /** Marks each prompt for the pin to find and return to. */
    prompts: boolean
    attachmentDownloadUrl: ((id: string) => string) | undefined
    onOpenAttachment: ComponentProps<typeof ChatMessage>['onOpenAttachment']
  }

/** The conversation so far. Memoized apart from the list, which re-renders
 *  for every streamed token, so a long conversation is not walked per token. */
const MessageRows = memo(function MessageRows({
  messages,
  conversation,
  attached,
  allMessages,
  streaming,
  prompts,
  flush,
  foldEveryRun,
  editingMessageId,
  showAuthor,
  currentUsername,
  attachmentDownloadUrl,
  onOpenAttachment,
  onNavigateBranch,
  onEditMessage,
  onSaveEdit,
  onCancelEdit,
  onRegenerateMessage,
  onRetryMessage,
  onOpenReasoning,
  onApprovalAnswer,
}: MessageRowsProps) {
  // Rows enter with a short animation only when they are new to the
  // conversation; one loaded or switched to appears at once, and so do the
  // turns drawn again as the reader scrolls back to them. The ids the
  // conversation had at the last commit decide it, read here and written
  // after commit, so a render React repeats or discards changes nothing.
  const knownRef = useRef<ReadonlySet<string>>(new Set())
  const wasStreamingRef = useRef(streaming)
  const known = knownRef.current
  // Rows drawn above the first that showed are earlier turns, not new ones:
  // the rest of a conversation the host gave its end of first among them.
  const firstKnown = known.size > 0 ? messages.findIndex((m) => known.has(m.id)) : -1
  const appended = firstKnown >= 0
  // The reply that just finished streaming was already on screen as the
  // streaming row; it takes that row's place without entering again.
  const streamFinished = wasStreamingRef.current && !streaming
  useLayoutEffect(() => {
    knownRef.current = new Set(conversation.map((m) => m.id))
    wasStreamingRef.current = streaming
  }, [conversation, streaming])

  // Pseudo messages render nothing, so the latest is the last one that shows,
  // and only once the window reaches the conversation's end.
  const lastIndex = attached ? messages.findLastIndex((m) => !m.pseudo) : -1
  return messages.map((message, i) => {
    // Recorded blocks flagged by an agent adapter are not the human
    // speaking; unflagged messages are untouched.
    if (message.pseudo) {
      return null
    }
    const isNew =
      appended &&
      i > firstKnown &&
      !known.has(message.id) &&
      !(streamFinished && message.role === 'assistant')
    // Every prompt marks its turn, text or not: a turn opened by a picture
    // alone hides the pin rather than leaving the previous turn's prompt there.
    const prompt = prompts && message.role === 'user'
    return (
      <div
        key={message.id}
        data-row={message.id}
        className={cx(isNew && 'animate-chat-enter', prompt && 'outline-none') || undefined}
        {...(prompt ? { 'data-prompt': message.id, tabIndex: -1 } : {})}
      >
        <ChatMessage
          message={message}
          allMessages={allMessages}
          flush={flush}
          foldEveryRun={foldEveryRun}
          latest={i === lastIndex && !streaming}
          isEditing={editingMessageId === message.id}
          showAuthor={showAuthor}
          currentUsername={currentUsername}
          attachmentDownloadUrl={attachmentDownloadUrl}
          onOpenAttachment={onOpenAttachment}
          onNavigateBranch={onNavigateBranch}
          onEdit={onEditMessage}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onRegenerate={onRegenerateMessage}
          onRetry={onRetryMessage}
          onOpenReasoning={onOpenReasoning}
          onApprovalAnswer={onApprovalAnswer}
        />
      </div>
    )
  })
})
