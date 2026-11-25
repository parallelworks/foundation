// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ariaKeyShortcuts } from '../components/Kbd'
import { UIProvider } from '../components/Provider'
import { memoryStorage } from '../test/storage'
import { ListCount, ListSearchControl, useListSearch } from './listSearch'
import type { ListUrl } from './useListFilters'

function Harness({ storageKey }: { storageKey?: string }) {
  const search = useListSearch(true, storageKey)
  return (
    <div>
      <ListSearchControl search={search} placeholder="Filter" />
      <div data-testid="queries">{search.queries.join(',')}</div>
    </div>
  )
}

const openSearch = () => fireEvent.click(screen.getByLabelText('Search'))
const getInput = () => screen.getByPlaceholderText('Filter')
const typeAndEnter = (value: string) => {
  fireEvent.change(getInput(), { target: { value } })
  fireEvent.keyDown(getInput(), { key: 'Enter' })
}

describe('list search term chips', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    })
  })

  it('commits typed text as a chip on Enter and clears the input', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    expect(screen.getByLabelText('Remove filter alpha')).toBeInTheDocument()
    expect(getInput()).toHaveValue('')
    typeAndEnter('beta')
    expect(screen.getByTestId('queries')).toHaveTextContent('alpha,beta')
  })

  it('includes the live text alongside committed terms in queries', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    fireEvent.change(getInput(), { target: { value: 'bet' } })
    expect(screen.getByTestId('queries')).toHaveTextContent('alpha,bet')
  })

  it('does not duplicate terms that differ only by case', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    typeAndEnter('ALPHA')
    expect(screen.getByTestId('queries')).toHaveTextContent(/^alpha$/)
  })

  it('persists chips across unmount and remount', () => {
    const { unmount } = render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    unmount()
    render(<Harness storageKey="test-list" />)
    expect(screen.getByLabelText('Remove filter alpha')).toBeInTheDocument()
  })

  it('removes a single chip and removes the last chip with Backspace', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    typeAndEnter('beta')
    fireEvent.click(screen.getByLabelText('Remove filter alpha'))
    expect(screen.queryByText('alpha')).not.toBeInTheDocument()
    fireEvent.keyDown(getInput(), { key: 'Backspace' })
    expect(screen.queryByText('beta')).not.toBeInTheDocument()
  })

  it('hands focus to the box when a chip goes', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    const remove = screen.getByLabelText('Remove filter alpha')
    remove.focus()
    fireEvent.click(remove)
    expect(screen.queryByLabelText('Remove filter alpha')).toBeNull()
    expect(getInput()).toHaveFocus()
  })

  it('clears all chips and closes with the clear button', () => {
    render(<Harness storageKey="test-list" />)
    openSearch()
    typeAndEnter('alpha')
    typeAndEnter('beta')
    fireEvent.click(screen.getByLabelText('Clear search'))
    expect(screen.queryByText('alpha')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
  })

  it('does not create chips without a storage key', () => {
    render(<Harness />)
    openSearch()
    typeAndEnter('alpha')
    expect(getInput()).toHaveValue('alpha')
    expect(screen.getByTestId('queries')).toHaveTextContent(/^alpha$/)
    expect(screen.queryByLabelText('Remove filter alpha')).not.toBeInTheDocument()
  })
})

function LinkedHarness({ url, storageKey }: { url: ListUrl; storageKey?: string | undefined }) {
  const search = useListSearch(true, storageKey, url)
  return (
    <div>
      <ListSearchControl search={search} placeholder="Filter" />
      <div data-testid="queries">{search.queries.join(',')}</div>
    </div>
  )
}

describe('list search in the URL', () => {
  type Update = (current: Record<string, unknown>) => Record<string, unknown>
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  })
  afterEach(() => vi.useRealTimers())

  const linked = (search: Record<string, unknown>, storageKey?: string) => {
    const onChange = vi.fn()
    const view = render(<LinkedHarness url={{ search, onChange }} storageKey={storageKey} />)
    return {
      onChange,
      written: (current: Record<string, unknown>) => {
        const update = onChange.mock.lastCall?.[0] as Update | undefined
        if (!update) {
          throw new Error('nothing was written')
        }
        return update(current)
      },
      navigate: (next: Record<string, unknown>) =>
        view.rerender(<LinkedHarness url={{ search: next, onChange }} storageKey={storageKey} />),
    }
  }
  const type = (value: string) => fireEvent.change(getInput(), { target: { value } })
  const pause = () => act(() => vi.advanceTimersByTime(300))

  it('opens searched by the text a link names, without taking focus', () => {
    linked({ search: 'alpha' })
    expect(getInput()).toHaveValue('alpha')
    expect(getInput()).not.toHaveFocus()
    expect(screen.getByTestId('queries')).toHaveTextContent('alpha')
  })

  it('reads text a router parsed as a number', () => {
    linked({ search: 4012 })
    expect(getInput()).toHaveValue('4012')
  })

  it('writes typed text once typing pauses, keeping the other params, and drops it once cleared', () => {
    const { onChange, written } = linked({ tab: 'all' })
    openSearch()
    type('b')
    type('be')
    expect(onChange).not.toHaveBeenCalled()
    pause()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(written({ tab: 'all', kind: 'pod' })).toEqual({ tab: 'all', kind: 'pod', search: 'be' })
    type('')
    pause()
    expect(written({ tab: 'all', search: 'be' })).toEqual({ tab: 'all' })
  })

  it('keeps what was typed when the router applies an earlier write late', () => {
    const { navigate } = linked({})
    openSearch()
    type('a')
    pause()
    type('ab')
    navigate({ search: 'a' })
    expect(getInput()).toHaveValue('ab')
    pause()
    navigate({ search: 'ab' })
    expect(getInput()).toHaveValue('ab')
  })

  it('follows a link it did not write: new text searches, and none clears and closes the box', () => {
    const { navigate } = linked({ search: 'alpha' })
    navigate({ search: 'beta' })
    expect(getInput()).toHaveValue('beta')
    navigate({})
    expect(screen.getByTestId('queries')).toHaveTextContent('')
    expect(screen.queryByPlaceholderText('Filter')).not.toBeInTheDocument()
  })

  it('keeps the text in the box on Enter, since a link carries no chips', () => {
    linked({ search: 'gamma' }, 'linked-list')
    fireEvent.keyDown(getInput(), { key: 'Enter' })
    expect(getInput()).toHaveValue('gamma')
    expect(screen.queryByLabelText('Remove filter gamma')).not.toBeInTheDocument()
  })
})

describe('list search field', () => {
  it('is named by its label, not only its placeholder', () => {
    render(<Harness />)
    openSearch()
    expect(screen.getByRole('textbox', { name: 'Search' })).toBe(getInput())
  })

  it('closes on Escape in the field', () => {
    render(<Harness />)
    openSearch()
    fireEvent.change(getInput(), { target: { value: 'alpha' } })
    fireEvent.keyDown(getInput(), { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Filter')).not.toBeInTheDocument()
  })

  it('keeps its query when Escape closes something else on the page', () => {
    render(<Harness />)
    openSearch()
    fireEvent.change(getInput(), { target: { value: 'alpha' } })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(getInput()).toHaveValue('alpha')
  })
})

describe('list search shortcuts', () => {
  it.each([
    ['/', { key: '/' }],
    ['⌘F', { key: 'f', metaKey: true }],
  ])('opens on %s', (_, keys) => {
    render(<Harness />)
    fireEvent.keyDown(document.body, keys)
    expect(getInput()).toBeInTheDocument()
  })

  it('leaves / alone with a modifier, which is another shortcut', () => {
    render(<Harness />)
    fireEvent.keyDown(document.body, { key: '/', ctrlKey: true })
    expect(screen.queryByPlaceholderText('Filter')).toBeNull()
  })

  it('leaves / alone while single-key shortcuts are off, and still opens on ⌘F', () => {
    render(
      <UIProvider characterKeyShortcuts={false}>
        <Harness />
      </UIProvider>,
    )
    const button = screen.getByRole('button', { name: 'Search' })
    expect(button).toHaveAttribute('aria-keyshortcuts', ariaKeyShortcuts('Mod+F'))
    fireEvent.keyDown(document.body, { key: '/' })
    expect(screen.queryByPlaceholderText('Filter')).toBeNull()
    fireEvent.keyDown(document.body, { key: 'f', metaKey: true })
    expect(getInput()).toBeInTheDocument()
  })
})

describe('ListCount', () => {
  it('reports the count as a status, grouped in the locale', () => {
    render(
      <ListCount total={1204} matches={1204} filterActive={false} noun="run" nounPlural="runs" />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      `${new Intl.NumberFormat().format(1204)} runs`,
    )
  })

  it('says how many of the total a filter left', () => {
    render(<ListCount total={8} matches={3} filterActive noun="run" nounPlural="runs" />)
    expect(screen.getByRole('status')).toHaveTextContent('3 of 8 runs')
  })
})
