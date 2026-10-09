// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { makeStaticAdapter, StoryChat } from '../stories/harness'
import ModelSelector from './ModelSelector'

describe('ModelSelector', () => {
  it('names the owner of a provider shared with the reader, and no one else', async () => {
    const adapter = makeStaticAdapter({
      providers: [
        { id: 'p-1', name: 'gateway', user: 'alice', cspKind: 'openai', status: 'active' },
        { id: 'p-2', name: 'gateway', user: 'bob', cspKind: 'openai', status: 'active' },
        { id: 'p-3', name: 'pool', user: 'org', cspKind: 'other', status: 'active' },
      ],
    })
    render(
      <StoryChat adapter={adapter}>
        <ModelSelector />
      </StoryChat>,
    )

    const trigger = await screen.findByRole('button', { expanded: false })
    await vi.waitFor(() => expect(trigger).toBeEnabled())
    fireEvent.click(trigger)

    expect(await screen.findByText(/Shared by bob/)).toBeInTheDocument()
    expect(screen.queryByText(/Shared by alice/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Shared by org/)).not.toBeInTheDocument()
  })
})
