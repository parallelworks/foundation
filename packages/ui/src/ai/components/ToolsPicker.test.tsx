// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { makeStaticAdapter, makeTools, StoryChat } from '../stories/harness'
import ToolsPicker from './ToolsPicker'

const CONNECT = { extraLinks: { connectTools: '#connect-tools' } }

function renderPicker(options: { tools?: boolean; connect?: boolean }) {
  const adapter = makeStaticAdapter(options.tools ? { tools: makeTools() } : {})
  render(
    <StoryChat adapter={adapter} {...(options.connect ? { config: CONNECT } : {})}>
      <ToolsPicker />
    </StoryChat>,
  )
}

async function openPicker() {
  fireEvent.click(await screen.findByRole('button', { name: 'Tools 3/3' }))
  return screen.findByRole('dialog', { name: 'Tools' })
}

afterEach(() => {
  localStorage.clear()
})

describe('ToolsPicker', () => {
  it('is the connect-tools link alone when the adapter lists no tools', async () => {
    renderPicker({ connect: true })

    expect(await screen.findByRole('link', { name: 'Connect tools' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Tools/ })).not.toBeInTheDocument()
  })

  it('lists each tool with its description, all on by default', async () => {
    renderPicker({ tools: true })
    const panel = await openPicker()

    const switches = within(panel).getAllByRole('switch')
    expect(switches).toHaveLength(3)
    for (const toggle of switches) {
      expect(toggle).toBeChecked()
    }
    expect(within(panel).getByRole('switch', { name: /List storage/ })).toHaveAccessibleDescription(
      'Names your buckets and disks',
    )
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
  })

  it('turns a tool off and counts it on the chip', async () => {
    renderPicker({ tools: true })
    const panel = await openPicker()

    fireEvent.click(within(panel).getByRole('switch', { name: /List clusters/ }))

    expect(within(panel).getByRole('switch', { name: /List clusters/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Tools 2/3' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('aiChat.disabledTools.u-1') ?? '[]')).toEqual([
      'list_clusters',
    ])
  })

  it('moves the connect-tools link to the foot of the menu', async () => {
    renderPicker({ tools: true, connect: true })
    const panel = await openPicker()

    expect(within(panel).getByRole('link', { name: 'Connect tools' })).toHaveAttribute(
      'href',
      '#connect-tools',
    )
    expect(screen.getAllByRole('link', { name: 'Connect tools' })).toHaveLength(1)
  })
})
