// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  type MenuSearch,
  type OpenMenu,
  type RowMenuItem,
  useRowMenu,
  useRowMenuActive,
} from './RowContextMenu'

const SEARCH: MenuSearch = { placeholder: 'Search types', empty: 'No type matches' }

const action = (label: string, extra: Partial<Extract<RowMenuItem, { kind: 'action' }>> = {}) =>
  ({ kind: 'action', label, onSelect: () => {}, ...extra }) satisfies RowMenuItem

function Menu({
  items,
  search,
  onClose,
  wrap,
}: {
  items: RowMenuItem[]
  search?: MenuSearch
  onClose?: () => void
  wrap?: (openMenu: OpenMenu) => OpenMenu
}) {
  const { openMenu, contextMenu } = useRowMenu()
  const open = wrap ? wrap(openMenu) : openMenu
  return (
    <>
      <button type="button" onClick={() => open(10, 10, items, onClose, search)}>
        Open
      </button>
      {contextMenu}
    </>
  )
}

function ActiveMenu(props: { items: RowMenuItem[]; search: MenuSearch; onClose: () => void }) {
  const { openMenu, contextMenu } = useRowMenu()
  const { active, openMenu: open } = useRowMenuActive(openMenu)
  return (
    <>
      <button
        type="button"
        data-active={active}
        onClick={() => open(10, 10, props.items, props.onClose, props.search)}
      >
        Open
      </button>
      {contextMenu}
    </>
  )
}

function openFrom(name = 'Open') {
  const opener = screen.getByRole('button', { name })
  opener.focus()
  fireEvent.click(opener)
  return opener
}

afterEach(() => {
  vi.useRealTimers()
})

describe('a row menu', () => {
  it('moves through its items with the arrow keys, up from its search to the last', () => {
    render(<Menu items={[action('Text'), action('Number'), action('Date')]} search={SEARCH} />)
    openFrom()
    const search = screen.getByRole('searchbox', { name: 'Search types' })
    expect(search).toHaveFocus()
    fireEvent.keyDown(search, { key: 'ArrowUp' })
    expect(screen.getByRole('button', { name: 'Date' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: 'Text' })).toHaveFocus()
  })

  it('copies as well as acts for the first match when its search takes Enter', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const onSelect = vi.fn()
    render(
      <Menu
        items={[action('Copy ID', { onSelect, copy: { text: 'abc-123', label: 'ID' } })]}
        search={SEARCH}
      />,
    )
    openFrom()
    const search = screen.getByRole('searchbox', { name: 'Search types' })
    fireEvent.change(search, { target: { value: 'id' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(writeText).toHaveBeenCalledWith('abc-123')
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('gives focus back to what opened it once it closes', () => {
    render(<Menu items={[action('Text')]} search={SEARCH} />)
    const opener = openFrom()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('keeps a submenu open while its search has focus, and closes it once focus leaves', () => {
    vi.useFakeTimers()
    render(
      <Menu
        items={[
          { kind: 'submenu', label: 'Add', search: SEARCH, items: [action('Text')] },
          action('Rename'),
        ]}
      />,
    )
    openFrom()
    const row = screen.getByRole('button', { name: 'Add' })
    fireEvent.click(row)
    const search = screen.getByRole('searchbox', { name: 'Search types' })
    search.focus()
    fireEvent.mouseLeave(row.parentElement as HTMLElement)
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByRole('searchbox', { name: 'Search types' })).toBeInTheDocument()
    fireEvent.blur(search, { relatedTarget: screen.getByRole('button', { name: 'Rename' }) })
    act(() => vi.advanceTimersByTime(500))
    expect(screen.queryByRole('searchbox', { name: 'Search types' })).toBeNull()
  })

  it('scrolls a long search in a list of its own, which a scroll inside leaves open', () => {
    const items = Array.from({ length: 40 }, (_, i) => action(`Type ${i}`))
    render(<Menu items={[{ kind: 'submenu', label: 'All', items }]} search={SEARCH} />)
    openFrom()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search types' }), {
      target: { value: 'type' },
    })
    const list = screen.getByRole('button', { name: 'Type 0' }).parentElement as HTMLElement
    expect(list).toHaveClass('overflow-y-auto')
    fireEvent.scroll(list)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.scroll(window)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('keeps the search and the opener’s close when it marks its row active', () => {
    const onClose = vi.fn()
    render(<ActiveMenu items={[action('Text')]} search={SEARCH} onClose={onClose} />)
    const opener = openFrom()
    expect(opener).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('searchbox', { name: 'Search types' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(opener).toHaveAttribute('data-active', 'false')
  })
})
