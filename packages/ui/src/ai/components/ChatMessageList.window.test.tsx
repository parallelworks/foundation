// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import type { useChat, useChatStream } from '../core/ChatProvider'
import type { ChatMessage as Message } from '../types'
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

vi.mock('./ChatMessage', () => ({
  __esModule: true,
  default: ({ message }: { message: Message }) => (
    <div data-testid="chat-message" data-id={message.id} />
  ),
}))

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

function renderList(messages: Message[], props: { whole?: boolean } = {}) {
  const ref = createRef<ChatMessageListHandle>()
  const result = render(
    <ChatMessageList ref={ref} messages={messages} allMessages={messages} {...props} />,
  )
  const log = screen.getByRole('log')
  const rerender = (next: Message[], nextProps: { whole?: boolean } = {}) =>
    result.rerender(<ChatMessageList ref={ref} messages={next} allMessages={next} {...nextProps} />)
  return { log, ref, rerender }
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
