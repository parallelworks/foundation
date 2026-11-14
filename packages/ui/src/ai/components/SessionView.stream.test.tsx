// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage as Message, MessagePart } from '../types'
import SessionView from './SessionView'

const chat = {
  adapter: { attachments: undefined },
  isStreaming: false,
  stopStreaming: vi.fn(),
  isThinking: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingParts: [],
  thinkingStartTime: null,
}

const drawn: string[] = []

vi.mock('../core/ChatProvider', () => ({
  useChat: () => chat,
  useChatStream: () => chat,
  useChatModelName: () => undefined,
}))

vi.mock('./ChatInput', () => ({
  __esModule: true,
  default: () => <div data-testid="composer" />,
}))

vi.mock('./agent/AgentMessageParts', () => ({
  __esModule: true,
  default: ({ message }: { message: Message }) => {
    drawn.push(message.id)
    return <div data-testid="agent-parts" />
  },
}))

vi.mock('../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))
vi.mock('../../components/Markdown', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useMarkdownReady: () => true,
}))

const call: MessagePart = {
  kind: 'tool_call',
  id: 't1',
  name: 'ReadFile',
  args: '{"path":"a.ts"}',
  status: 'ok',
  result: 'out',
}
const asked: Message = { id: 'u1', role: 'user', content: 'Why is it failing?' }
const worked: Message = { id: 'a1', role: 'assistant', parts: [call], parentId: 'u1' }
const messages = [asked, worked]

const reply = (text: string): Message => ({
  id: 'streaming',
  role: 'assistant',
  parts: [{ kind: 'text', text }],
})

const onSend = vi.fn()
const onApprovalAnswer = vi.fn()

beforeEach(() => {
  drawn.length = 0
})

describe("SessionView while a host's reply streams", () => {
  // Such a host holds the transcript in its own state, so it renders the view for every frame of
  // the reply, with every array it derives rebuilt.
  it('draws the reply again and none of the messages before it', () => {
    const view = (text: string) => {
      const streaming = reply(text)
      return (
        <SessionView
          sessionKey="s1"
          messages={messages}
          allMessages={[...messages, streaming]}
          streamingMessage={streaming}
          queuedMessages={[]}
          turn={{ running: true, onStop: () => {} }}
          onSend={onSend}
          onApprovalAnswer={onApprovalAnswer}
          composer={{ placeholder: text }}
        />
      )
    }
    const { rerender } = render(view('Looking'))
    expect(drawn).toEqual(['a1', 'streaming'])

    drawn.length = 0
    rerender(view('Looking at it'))
    rerender(view('Looking at it now'))

    expect(drawn).toEqual(['streaming', 'streaming'])
  })

  it('still says whose turn a reply ran in when it shows authors', () => {
    const bob = { id: 'u-2', username: 'bob', name: 'Bob' }
    const theirs: Message = { ...asked, author: bob }
    const answered: Message = { ...worked, content: 'It waits on a slow asset.' }
    render(
      <SessionView
        sessionKey="s1"
        messages={[theirs, answered]}
        streamingMessage={null}
        onSend={onSend}
        showAuthor
        currentUsername="alice"
      />,
    )
    expect(screen.getByText('Ran 1 tool call as Bob')).toBeInTheDocument()
  })
})
