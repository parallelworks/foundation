// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { summarizeToolArgs } from '../../agent/toolfmt'
import { ChatConfigProvider, resolveChatConfig } from '../../core/config'
import type { ChatMessage, MessagePart, ToolCallPart } from '../../types'
import AgentMessageParts from './AgentMessageParts'

// A call's row words its arguments each time it is drawn, so this counts the calls drawn.
vi.mock('../../agent/toolfmt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent/toolfmt')>()
  return { ...actual, summarizeToolArgs: vi.fn(actual.summarizeToolArgs) }
})
vi.mock('../../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))

const drawn = vi.mocked(summarizeToolArgs)
const config = resolveChatConfig()

const call = (i: number, over: Partial<ToolCallPart> = {}): ToolCallPart => ({
  kind: 'tool_call',
  id: `t${i}`,
  name: i % 2 ? 'ReadFile' : 'Bash',
  args: JSON.stringify(i % 2 ? { path: `file-${i}.ts` } : { command: `ls dir-${i}` }),
  status: 'ok',
  result: 'out',
  ...over,
})

const turn = (parts: MessagePart[]): ChatMessage => ({ id: 'm', role: 'assistant', parts })

function view(parts: MessagePart[], foldEveryRun: boolean) {
  return (
    <ChatConfigProvider value={config}>
      <AgentMessageParts message={turn(parts)} isStreaming foldEveryRun={foldEveryRun} />
    </ChatConfigProvider>
  )
}

beforeEach(() => {
  drawn.mockClear()
})

// A reply streams into the message that holds the turn's calls, so every token of it renders
// that message again, and a long turn holds hundreds of calls.
describe.each([
  ['folding every run', true],
  ['folding runs of two or more', false],
])('a turn streaming a reply after its calls, %s', (_, foldEveryRun) => {
  const done = Array.from({ length: 6 }, (_, i) => call(i))
  const reply = (text: string): MessagePart[] => [...done, { kind: 'text', text }]

  it('draws none of its finished calls again for a token of the reply', () => {
    const { rerender } = render(view(reply('Look'), foldEveryRun))
    expect(drawn).toHaveBeenCalledTimes(done.length)

    drawn.mockClear()
    rerender(view(reply('Looking'), foldEveryRun))
    rerender(view(reply('Looking at it'), foldEveryRun))

    expect(drawn).not.toHaveBeenCalled()
    expect(screen.getByText('Looking at it')).toBeInTheDocument()
    expect(screen.getByTestId('tool-rollup')).toHaveTextContent('ran 3 shell commands')
  })

  it('draws again only the call that changed', () => {
    const running = call(6, { status: 'running', result: undefined as never })
    const { rerender } = render(view([...reply('Looking'), running], foldEveryRun))

    drawn.mockClear()
    rerender(
      view([...reply('Looking'), { ...running, status: 'ok', result: 'done' }], foldEveryRun),
    )

    expect(drawn.mock.calls.map(([, args]) => args)).toEqual([running.args])
  })
})

describe("a run's sentence", () => {
  it('says what the run holds as calls join it and finish', () => {
    const { rerender } = render(view([call(1)], true))
    expect(screen.getByTestId('tool-rollup')).toHaveTextContent('Read 1 file')

    rerender(view([call(1), call(3, { status: 'running' })], true))
    expect(screen.getByTestId('tool-rollup')).toHaveTextContent('Reading 2 files…')

    rerender(view([call(1), call(3)], true))
    expect(screen.getByTestId('tool-rollup')).toHaveTextContent('Read 2 files')
    expect(screen.getByTestId('tool-rollup')).not.toHaveTextContent('…')
  })

  it("takes a host's words for a tool as they change", () => {
    const worded = (word: string) =>
      resolveChatConfig({
        slots: {
          toolPresentation: (part) =>
            part.name === 'cost_summary'
              ? { label: 'Checked costs', rollup: (n) => `${word} costs for ${n} allocations` }
              : undefined,
        },
      })
    const parts = [0, 1].map((i) => call(i, { name: 'cost_summary', args: '{}' }))
    const host = (word: string) => (
      <ChatConfigProvider value={worded(word)}>
        <AgentMessageParts message={turn(parts)} />
      </ChatConfigProvider>
    )
    const { rerender } = render(host('checked'))
    expect(screen.getByTestId('tool-rollup')).toHaveTextContent('Checked costs for 2 allocations')
    rerender(host('summed'))
    expect(screen.getByTestId('tool-rollup')).toHaveTextContent('Summed costs for 2 allocations')
  })
})
