// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenizeDiffLines } from '../../agent/diffHighlight'
import { ChatConfigProvider, resolveChatConfig } from '../../core/config'
import type { ChatMessage, ToolCallPart } from '../../types'
import AgentMessageParts from './AgentMessageParts'

vi.mock('../../agent/diffHighlight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent/diffHighlight')>()
  return { ...actual, tokenizeDiffLines: vi.fn(async () => null) }
})

// jsdom has none. Each one built is kept, to say when what it watches comes near.
const watching: IntersectionObserverCallback[] = []
global.IntersectionObserver = class {
  constructor(callback: IntersectionObserverCallback) {
    watching.push(callback)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
} as unknown as typeof IntersectionObserver

const colored = vi.mocked(tokenizeDiffLines)
const config = resolveChatConfig()

const edit = (i: number): ToolCallPart => ({
  kind: 'tool_call',
  id: `t${i}`,
  name: 'EditFile',
  args: JSON.stringify({
    path: `src/file-${i}.ts`,
    old_string: `const x = ${i}`,
    new_string: `const x = ${i + 1}`,
  }),
  status: 'ok',
  result: 'Edited',
})

const turn = (parts: ToolCallPart[]): ChatMessage => ({ id: 'm', role: 'assistant', parts })

beforeEach(() => {
  colored.mockClear()
  watching.length = 0
})

// A long turn edits hundreds of files, and its diffs are drawn with the transcript.
describe("an edit's diff", () => {
  it('is colored when it comes near the screen, not when it is drawn', async () => {
    render(
      <ChatConfigProvider value={config}>
        <AgentMessageParts message={turn([edit(1), edit(2), edit(3)])} />
      </ChatConfigProvider>,
    )
    expect(screen.getAllByText(/const x = /).length).toBeGreaterThan(0)
    expect(colored).not.toHaveBeenCalled()
    expect(watching).toHaveLength(3)

    await act(async () => {
      watching[1]?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(colored).toHaveBeenCalledTimes(1)
    expect(colored.mock.calls[0]?.[0]).toEqual(['const x = 2', 'const x = 3'])
  })
})
