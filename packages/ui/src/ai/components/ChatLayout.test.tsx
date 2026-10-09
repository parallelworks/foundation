// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { makeStaticAdapter, makeSummaries, StoryChat } from '../stories/harness'
import ChatLayout from './ChatLayout'

const storage = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, String(v)),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  },
})

// jsdom lays nothing out; the chat's width is whatever a test says it is.
let chatWidth = 1200
let resize: (() => void) | undefined
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get: () => chatWidth,
})
global.ResizeObserver = class {
  constructor(cb: () => void) {
    resize = cb
  }
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const FIRST = 'Slurm sizing session 1'

function renderLayout(
  layout: Omit<ComponentProps<typeof ChatLayout>, 'children'> = {},
  sidebarControl?: ComponentProps<typeof StoryChat>['sidebarControl'],
) {
  const adapter = makeStaticAdapter({ summaries: makeSummaries({ count: 3 }) })
  return render(
    <StoryChat adapter={adapter} conversationId={null} sidebarControl={sidebarControl}>
      <ChatLayout {...layout}>
        <p>thread</p>
      </ChatLayout>
    </StoryChat>,
  )
}

beforeEach(() => {
  storage.clear()
  chatWidth = 1200
  resize = undefined
})

describe('ChatLayout inline', () => {
  it('keeps the list beside the thread and remembers the rail', async () => {
    renderLayout()
    expect(await screen.findByText(FIRST)).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }))
    expect(storage.get('aiChatSidebar')).toBe('collapsed')
  })

  it('reads the rail from the earlier storage key', async () => {
    storage.set('aiChatSidebarCollapsed', '1')
    renderLayout()
    expect(await screen.findByRole('button', { name: 'Open sidebar' })).toBeInTheDocument()
  })
})

describe('ChatLayout drawer', () => {
  it('starts closed, opens from its toggle and closes once a conversation is picked', async () => {
    renderLayout({ sidebarMode: 'drawer' })
    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(dialog).toHaveAttribute('inert')

    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(dialog).not.toHaveAttribute('inert')
    expect(screen.getByRole('main')).toHaveAttribute('inert')

    fireEvent.click(await screen.findByText(FIRST))
    expect(dialog).toHaveAttribute('inert')
    expect(screen.getByRole('main')).not.toHaveAttribute('inert')
  })

  it('leaves the toggle to the host header when asked', () => {
    renderLayout({ sidebarMode: 'drawer', drawerToggle: false })
    expect(screen.queryByRole('button', { name: 'Open sidebar' })).not.toBeInTheDocument()
  })
})

describe('ChatLayout auto', () => {
  it('shows the drawer below the breakpoint and the column above it', () => {
    chatWidth = 500
    renderLayout({ sidebarMode: 'auto' })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    chatWidth = 1000
    act(() => resize?.())
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('closes an open drawer when the chat widens past the breakpoint', () => {
    chatWidth = 500
    const onDrawerOpenChange = vi.fn()
    renderLayout({ sidebarMode: 'auto' }, { drawerOpen: true, onDrawerOpenChange })
    chatWidth = 1000
    act(() => resize?.())
    expect(onDrawerOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('ChatLayout under host control', () => {
  it('hides the list while the host says so', async () => {
    renderLayout({}, { sidebar: 'hidden' })
    await act(async () => {})
    expect(screen.queryByText(FIRST)).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('asks the host rather than changing on its own, and remembers nothing', () => {
    const onSidebarChange = vi.fn()
    renderLayout({}, { sidebar: 'collapsed', onSidebarChange })
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }))
    expect(onSidebarChange).toHaveBeenCalledWith('expanded')
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeInTheDocument()
    expect(storage.has('aiChatSidebar')).toBe(false)
  })

  it('opens the drawer the host opens', () => {
    renderLayout({ sidebarMode: 'drawer' }, { drawerOpen: true })
    expect(screen.getByRole('dialog')).not.toHaveAttribute('inert')
  })
})
