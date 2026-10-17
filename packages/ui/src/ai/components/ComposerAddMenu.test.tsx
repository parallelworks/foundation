// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { makeStaticAdapter, makeTools, StoryChat } from '../stories/harness'
import { defaultChatStrings } from '../strings'
import ChatInput from './ChatInput'
import { ConnectToolsLink } from './ComposerChrome'

const ADD_FILES_PANEL = defaultChatStrings.attachmentUpload.addFiles
const CONNECT = { extraLinks: { connectTools: '#connect-tools' } }

function renderComposer(options: {
  tools?: boolean
  attachments?: boolean
  connect?: boolean
  agentTurn?: boolean
}) {
  const adapter = makeStaticAdapter({
    attachments: options.attachments ?? false,
    ...(options.tools ? { tools: makeTools() } : {}),
  })
  render(
    <StoryChat adapter={adapter} {...(options.connect ? { config: CONNECT } : {})}>
      <ChatInput
        onSend={() => {}}
        conversationId="conv-tools"
        settingsLeft={<ConnectToolsLink />}
        {...(options.agentTurn ? { turn: { running: false, onStop: () => {} } } : {})}
      />
    </StoryChat>,
  )
}

async function openMenu(name: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name }))
  return screen.findByRole('dialog')
}

afterEach(() => {
  localStorage.clear()
})

describe('the composer + menu', () => {
  it('opens the attachments panel directly when the adapter lists no tools', async () => {
    renderComposer({ attachments: true, connect: true })
    const plus = await screen.findByRole('button', { name: 'Attach files' })

    expect(plus).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(plus)

    expect(plus).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect tools' })).toBeInTheDocument()
  })

  it('offers files, then each tool on by default, then the connect link', async () => {
    renderComposer({ attachments: true, tools: true, connect: true })
    const menu = await openMenu(/^Add files and tools$/)

    expect(within(menu).getByRole('button', { name: 'Add files' })).toBeInTheDocument()
    const switches = within(menu).getAllByRole('switch')
    expect(switches).toHaveLength(3)
    for (const toggle of switches) {
      expect(toggle).toBeChecked()
    }
    expect(within(menu).getByRole('switch', { name: /List storage/ })).toHaveAccessibleDescription(
      'Names your buckets and disks',
    )
    expect(within(menu).getByRole('link', { name: 'Connect tools' })).toHaveAttribute(
      'href',
      '#connect-tools',
    )
    expect(screen.getAllByRole('link', { name: 'Connect tools' })).toHaveLength(1)
  })

  it('opens the attachments panel from Add files', async () => {
    renderComposer({ attachments: true, tools: true })
    const menu = await openMenu(/^Add files and tools$/)

    fireEvent.click(within(menu).getByRole('button', { name: 'Add files' }))

    expect(await screen.findByText(ADD_FILES_PANEL)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Add files and tools/ })).toHaveClass(
      'chat-tint-strong',
    )
  })

  it('turns a tool off, remembers it and marks the +', async () => {
    renderComposer({ attachments: true, tools: true })
    const menu = await openMenu(/^Add files and tools$/)

    fireEvent.click(within(menu).getByRole('switch', { name: /List clusters/ }))

    expect(within(menu).getByRole('switch', { name: /List clusters/ })).not.toBeChecked()
    expect(
      screen.getByRole('button', {
        name: 'Add files and tools · Some tools are off',
        hidden: true,
      }),
    ).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('aiChat.disabledTools.u-1') ?? '[]')).toEqual([
      'list_clusters',
    ])
  })

  it('shows the + with only the tools when the adapter takes no files', async () => {
    renderComposer({ tools: true })
    const menu = await openMenu(/^Tools$/)

    expect(within(menu).queryByRole('button', { name: 'Add files' })).not.toBeInTheDocument()
    expect(within(menu).getAllByRole('switch')).toHaveLength(3)
  })

  it('leaves the provider’s tools out of a turn it does not run', async () => {
    renderComposer({ tools: true, attachments: true, agentTurn: true })

    fireEvent.click(await screen.findByRole('button', { name: 'Attach files' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
