// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ComponentProps, createRef } from 'react'
import type { useChat, useChatStream } from '../core/ChatProvider'
import { createTextIndex } from '../core/textIndex'
import type { ChatMessage as Message } from '../types'
import { ExpandAllProvider } from './agent/AgentMessageParts'
import ChatMessageList, { type ChatMessageListHandle } from './ChatMessageList'

type ChatState = ReturnType<typeof useChat> & ReturnType<typeof useChatStream>

const mockChat = {
  adapter: { attachments: undefined },
  isStreaming: false,
  isThinking: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingParts: [],
  thinkingStartTime: null,
} as unknown as ChatState

vi.mock('../core/ChatProvider', () => ({
  useChat: () => mockChat,
  useChatStream: () => mockChat,
}))

// The memory of what was opened that the rows were drawn with.
const rows = vi.hoisted(() => ({ memory: undefined as unknown }))

vi.mock('./ChatMessage', async () => {
  const { useContext } = await import('react')
  const { RowMemoryContext } = await import('../core/rowMemory')
  return {
    __esModule: true,
    default: function Row({ message, latest }: { message: Message; latest?: boolean }) {
      rows.memory = useContext(RowMemoryContext)
      return (
        <div data-testid="chat-message" data-id={message.id} data-latest={latest || undefined}>
          {message.content}
        </div>
      )
    },
  }
})

// Each row is this tall, one under another from the top of the list.
const ROW = 200
const VIEW = 600

/** A turn whose reply made 32 tool calls: about a third of what the list draws at once. */
function turn(n: number): Message[] {
  return [
    { id: `u${n}`, role: 'user', content: `Question ${n}` },
    {
      id: `a${n}`,
      role: 'assistant',
      parts: Array.from({ length: 32 }, (_, i) => ({
        kind: 'tool_call' as const,
        id: `call-${n}-${i}`,
        name: 'ReadFile',
        args: '{}',
        status: 'ok' as const,
      })),
    },
  ]
}

function turns(from: number, to: number): Message[] {
  return Array.from({ length: to - from + 1 }, (_, i) => turn(from + i)).flat()
}

function drawnIds(): string[] {
  return screen.getAllByTestId('chat-message').map((el) => el.dataset['id'] ?? '')
}

let restoreRect: () => void
beforeEach(() => {
  const original = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const list = this.parentElement
    const log = this.closest<HTMLElement>('[role="log"]')
    const top =
      list?.hasAttribute('data-transcript') && log
        ? [...list.children].indexOf(this) * ROW - log.scrollTop
        : 0
    return { top, bottom: top + ROW, left: 0, right: 800, width: 800, height: ROW } as DOMRect
  }
  restoreRect = () => {
    HTMLElement.prototype.getBoundingClientRect = original
  }
})
afterEach(() => restoreRect())

type ListProps = Partial<ComponentProps<typeof ChatMessageList>>

function renderList(messages: Message[], props: ListProps = {}) {
  const ref = createRef<ChatMessageListHandle>()
  const result = render(
    <ChatMessageList ref={ref} messages={messages} allMessages={messages} {...props} />,
  )
  const log = screen.getByRole('log')
  const rerender = (next: Message[], nextProps: ListProps = {}) =>
    result.rerender(<ChatMessageList ref={ref} messages={next} allMessages={next} {...nextProps} />)
  return { log, ref, rerender }
}

/** Lays the list out in a view VIEW tall, as tall as the rows it draws at any
 *  moment and kept within them as a browser keeps it, scrolled to `top`, and
 *  tells it so. */
function scrollWithin(log: HTMLElement, top: number) {
  if (!Object.hasOwn(log, 'scrollHeight')) {
    let at = 0
    const height = () => log.querySelectorAll('[data-row]').length * ROW
    const within = (y: number) => Math.max(0, Math.min(y, height() - VIEW))
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: VIEW })
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: height })
    Object.defineProperty(log, 'scrollTop', {
      configurable: true,
      get: () => within(at),
      set: (y: number) => {
        at = within(y)
      },
    })
  }
  log.scrollTop = top
  fireEvent.scroll(log)
}

function rowOf(id: string): HTMLElement {
  const row = screen.getAllByTestId('chat-message').find((el) => el.dataset['id'] === id)
  if (!row?.parentElement) {
    throw new Error(`${id} is not drawn`)
  }
  return row.parentElement
}

/** Lays the list out in a view VIEW tall, scrolled to `top`, and tells it so. */
function scrollTo(log: HTMLElement, top: number) {
  const height = log.querySelectorAll('[data-testid="chat-message"]').length * ROW
  Object.defineProperty(log, 'clientHeight', { configurable: true, value: VIEW })
  Object.defineProperty(log, 'scrollHeight', { configurable: true, value: height })
  log.scrollTop = top
  fireEvent.scroll(log)
}

describe('ChatMessageList in a long conversation', () => {
  it('draws only its end, from the prompt of the turn it reaches into', () => {
    renderList(turns(1, 10))

    expect(drawnIds()).toEqual(['u8', 'a8', 'u9', 'a9', 'u10', 'a10'])
  })

  it('draws a short conversation whole', () => {
    renderList(turns(1, 2))

    expect(drawnIds()).toEqual(['u1', 'a1', 'u2', 'a2'])
  })

  it('draws the turns before it as the reader nears its top, leaving what they read in place', () => {
    const { log } = renderList(turns(1, 10))

    scrollTo(log, 100)

    expect(drawnIds()).toEqual(turns(5, 10).map((m) => m.id))
    // u8 was 100px above the view's top and still is, six rows further down.
    expect(log.scrollTop).toBe(100 + 6 * ROW)
  })

  it('draws nothing more while the reader is further than two screens from its top', () => {
    const { log } = renderList(turns(1, 10))

    scrollTo(log, VIEW * 2 + 1)

    expect(drawnIds()).toEqual(['u8', 'a8', 'u9', 'a9', 'u10', 'a10'])
  })

  it('lets the earlier turns appear at once rather than enter as new ones', () => {
    const { log } = renderList(turns(1, 10))

    scrollTo(log, 100)

    const earlier = screen
      .getAllByTestId('chat-message')
      .filter((el) => el.dataset['id'] === 'u5')
      .map((el) => el.parentElement)
    expect(earlier[0]).not.toHaveClass('animate-chat-enter')
  })

  it('keeps the turns a reader who left the end is reading as new ones arrive', () => {
    const { log, rerender } = renderList(turns(1, 10))
    fireEvent.wheel(log, { deltaY: -40 })

    rerender(turns(1, 12))

    expect(drawnIds()[0]).toBe('u8')
  })

  it('follows the end again once the reader jumps to it', () => {
    const { log, ref, rerender } = renderList(turns(1, 10))
    fireEvent.wheel(log, { deltaY: -40 })
    rerender(turns(1, 12))

    act(() => ref.current?.jumpToLatest())

    expect(drawnIds()).toEqual(['u10', 'a10', 'u11', 'a11', 'u12', 'a12'])
  })

  it('draws every message while whole, and keeps them once it no longer is', () => {
    const { rerender } = renderList(turns(1, 10))

    rerender(turns(1, 10), { whole: true })
    expect(drawnIds()).toEqual(turns(1, 10).map((m) => m.id))

    rerender(turns(1, 10))
    expect(drawnIds()).toEqual(turns(1, 10).map((m) => m.id))
  })

  it('draws the end again once its conversation is cleared and given back', () => {
    const { log, rerender } = renderList(turns(1, 10))
    scrollTo(log, 100)
    expect(drawnIds()[0]).toBe('u5')
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 0 })

    rerender([])
    rerender(turns(1, 10))

    expect(drawnIds()[0]).toBe('u8')
  })
})

describe('ChatMessageList scrolled through a long conversation', () => {
  afterEach(() => document.getSelection()?.removeAllRanges())

  // Read up from the end to the turns two batches back: u22 to a30, with u28,
  // where the reader started, at the top of the view.
  function readUp(log: HTMLElement) {
    scrollWithin(log, 0)
    expect(drawnIds()[0]).toBe('u22')
    expect(log.scrollTop).toBe(12 * ROW)
  }

  it('lets go of the turns far above the reader as they read down, leaving what they read in place', () => {
    const { log } = renderList(turns(1, 30))
    readUp(log)

    // a29 at the top of the view: u22 and a22 end more than four screens above it.
    scrollWithin(log, 15 * ROW)

    expect(drawnIds()[0]).toBe('u23')
    expect(log.scrollTop).toBe(13 * ROW)
  })

  it('lets go of the turns far below the reader as they read up, and draws them again on the way down', () => {
    const { log } = renderList(turns(1, 30))
    readUp(log)

    scrollWithin(log, 0)
    expect(drawnIds()[0]).toBe('u16')
    expect(drawnIds().at(-1)).toBe('a29')

    // Every row that entered on the way, not only those still entering once
    // the list settles: a later commit takes the class from the same row.
    const changes = new MutationObserver(() => {})
    changes.observe(log, {
      childList: true,
      subtree: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
    })
    scrollWithin(log, log.scrollHeight - VIEW)
    const entering = (classes: string | null | undefined) =>
      !!classes?.split(' ').includes('animate-chat-enter')
    const entered = changes
      .takeRecords()
      .filter(
        (r) =>
          entering(r.oldValue) ||
          [...r.addedNodes].some((node) => node instanceof HTMLElement && entering(node.className)),
      )
    changes.disconnect()

    expect(drawnIds().at(-1)).toBe('a30')
    expect(entered).toEqual([])
  })

  it('draws no new turn while it stops short of the end, and goes back to it on request', () => {
    const { log, ref, rerender } = renderList(turns(1, 30))
    readUp(log)
    scrollWithin(log, 0)
    expect(screen.queryByText('Jump to latest')).toBeInTheDocument()

    rerender(turns(1, 31))
    expect(drawnIds()).not.toContain('u31')
    expect(document.querySelector('[data-latest]')).toBeNull()

    rerender(turns(1, 31), {
      streamingMessage: { id: 'streaming', role: 'assistant', content: 'Writing an answer' },
    })
    expect(screen.queryByText('Writing an answer')).not.toBeInTheDocument()

    act(() => ref.current?.jumpToLatest())
    // The end and the reply being written, and the turns before them that put
    // two screens above the view.
    expect(drawnIds()).toEqual([...turns(26, 31).map((m) => m.id), 'streaming'])
    expect(log.scrollTop).toBe(log.scrollHeight - VIEW)
    expect(screen.queryByText('Jump to latest')).not.toBeInTheDocument()
  })

  it('takes the foot of what it draws for the latest only once that is the end', () => {
    const { log } = renderList(turns(1, 60))
    for (let i = 0; i < 4; i++) {
      scrollWithin(log, 0)
    }
    expect(drawnIds().at(-1)).not.toBe('a60')

    scrollWithin(log, log.scrollHeight - VIEW)

    expect(drawnIds().at(-1)).not.toBe('a60')
    expect(screen.queryByText('Jump to latest')).toBeInTheDocument()
  })

  it('goes to the very end when the reader jumps from far above it', () => {
    const short = (n: number): Message[] => [
      { id: `q${n}`, role: 'user', content: `Ask ${n}` },
      { id: `r${n}`, role: 'assistant', content: `Answer ${n}` },
    ]
    // Its last turns are short, so the end it draws is many screens tall.
    const conversation = [
      ...turns(1, 30),
      ...Array.from({ length: 60 }, (_, i) => short(i + 1)).flat(),
    ]
    const { log, ref } = renderList(conversation)
    for (let i = 0; i < 12; i++) {
      scrollWithin(log, 0)
    }
    expect(drawnIds().at(-1)).not.toBe('r60')

    act(() => ref.current?.jumpToLatest())

    expect(drawnIds().at(-1)).toBe('r60')
    expect(log.scrollTop).toBe(log.scrollHeight - VIEW)
  })

  it('keeps following the end after a send that draws the turns it let go of and lets go of them again', () => {
    const short = (n: number): Message[] => [
      { id: `q${n}`, role: 'user', content: `Ask ${n}` },
      { id: `r${n}`, role: 'assistant', content: `Answer ${n}` },
    ]
    // Short turns: the end it draws reaches many screens back, and it lets go
    // of all but the last few as soon as it lays them out.
    const conversation = Array.from({ length: 60 }, (_, i) => short(i + 1)).flat()
    const { log, ref, rerender } = renderList(conversation)
    // As a browser does, a list that shrinks below the position moves it up to fit.
    let at = 0
    const height = () => log.querySelectorAll('[data-row]').length * ROW
    const clamp = () => {
      at = Math.max(0, Math.min(at, height() - VIEW))
      return at
    }
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: VIEW })
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: height })
    Object.defineProperty(log, 'scrollTop', {
      configurable: true,
      get: clamp,
      set: (y: number) => {
        at = y
        clamp()
      },
    })
    scrollWithin(log, Number.MAX_SAFE_INTEGER)
    expect(drawnIds().length).toBeLessThan(conversation.length - 40)

    // A send: the view goes to the end, then the message joins the conversation.
    act(() => ref.current?.jumpToLatest())
    rerender([...conversation, { id: 'q61', role: 'user', content: 'Ask 61' }])

    expect(log.scrollTop).toBe(log.scrollHeight - VIEW)
    expect(screen.queryByText('Jump to latest')).not.toBeInTheDocument()
  })

  it('opens or closes the blocks it does not draw with the ones it does, as expand-all changes', () => {
    const list = (all: boolean, messages = turns(1, 3)) => (
      <ExpandAllProvider value={all}>
        <ChatMessageList messages={messages} allMessages={messages} />
      </ExpandAllProvider>
    )
    const { rerender } = render(list(false))
    const before = rows.memory

    rerender(list(false, turns(1, 4)))
    expect(rows.memory).toBe(before)

    rerender(list(true, turns(1, 4)))
    expect(rows.memory).not.toBe(before)
  })

  it('forgets what was opened in a conversation once it is cleared', () => {
    const { rerender } = renderList(turns(1, 3))
    const before = rows.memory

    rerender([])
    rerender(turns(1, 3))

    expect(rows.memory).not.toBe(before)
  })

  it('keeps the turn the reader is editing', () => {
    const { log } = renderList(turns(1, 30), { editingMessageId: 'u22' })
    readUp(log)

    scrollWithin(log, 15 * ROW)

    expect(drawnIds()[0]).toBe('u22')
  })

  it('keeps a turn the reader is selecting text in', () => {
    const { log } = renderList(turns(1, 30))
    readUp(log)
    const range = document.createRange()
    range.selectNodeContents(rowOf('u22'))
    document.getSelection()?.addRange(range)

    scrollWithin(log, 15 * ROW)

    expect(drawnIds()[0]).toBe('u22')
  })
})

describe('ChatMessageList for a search', () => {
  it('draws the turn of a message it reveals, with the message at the top of the view', async () => {
    const { log, ref } = renderList(turns(1, 30))

    let revealed: Promise<void> | undefined
    act(() => {
      revealed = ref.current?.reveal('a5')
    })
    await revealed

    expect(drawnIds()).toContain('a5')
    expect(drawnIds()).not.toContain('a30')
    expect(log.scrollTop).toBe(ROW)
    expect(screen.queryByText('Jump to latest')).toBeInTheDocument()
  })

  it('reads the turns it does not draw, a few at a time', async () => {
    const conversation = turns(1, 10)
    const index = createTextIndex()
    // The rows each batch draws out of sight: a batch is drawn, read and let go of at once.
    const batches: number[] = []
    const watch = new MutationObserver((records) => {
      const read = records.flatMap((r) =>
        r.target instanceof Element && r.target.closest('[data-transcript]')
          ? []
          : [...r.addedNodes].filter((n) => n instanceof HTMLElement && n.hasAttribute('data-row')),
      )
      if (read.length > 0) {
        batches.push(read.length)
      }
    })
    watch.observe(document.body, { childList: true, subtree: true })
    renderList(conversation, { textIndex: index, indexing: true })

    await waitFor(() => expect(index.get(conversation[0] as Message)).toBe('Question 1'))
    watch.disconnect()

    expect(index.get(conversation[13] as Message)).toBe('')
    expect(drawnIds()).toEqual(['u8', 'a8', 'u9', 'a9', 'u10', 'a10'])
    // About 50 parts at a time, here a turn or two of the fourteen rows it doesn't draw.
    expect(batches.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...batches)).toBeLessThanOrEqual(4)
  })

  it('reads nothing while no search asks it to', async () => {
    const conversation = turns(1, 10)
    const index = createTextIndex()
    renderList(conversation, { textIndex: index })

    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

    // The reply just before the window would be read first.
    expect(index.get(conversation[13] as Message)).toBeUndefined()
  })

  it('keeps what a turn it lets go of showed', () => {
    const conversation = turns(1, 30)
    const index = createTextIndex()
    const { log } = renderList(conversation, { textIndex: index })
    scrollWithin(log, 0)

    scrollWithin(log, 15 * ROW)

    expect(index.get(conversation[42] as Message)).toBe('Question 22')
  })

  it('forgets what it read once what the reader opened starts afresh', () => {
    const conversation = turns(1, 3)
    const index = createTextIndex()
    const list = (all: boolean) => (
      <ExpandAllProvider value={all}>
        <ChatMessageList messages={conversation} allMessages={conversation} textIndex={index} />
      </ExpandAllProvider>
    )
    const { rerender } = render(list(false))
    index.set(conversation[0] as Message, 'Question 1')

    rerender(list(true))

    expect(index.get(conversation[0] as Message)).toBeUndefined()
  })
})
