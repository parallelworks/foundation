// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ListFilterMenu } from './ListViewControls'
import { useListView } from './listView'
import { memoryStorage } from './testStorage'

type Row = { owner: string }

function Harness() {
  const view = useListView<Row>({
    storageKey: 'facet-search',
    columns: [{ key: 'owner', label: 'Owner' }],
    facets: [
      {
        key: 'owner',
        label: 'Owner',
        searchable: true,
        options: ['alice', 'bob', 'carol'].map((owner) => ({ value: owner, label: owner })),
        matches: (row, values) => values.includes(row.owner),
      },
    ],
  })
  return <ListFilterMenu view={view} />
}

function openOwnerFacet() {
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
  fireEvent.click(screen.getByRole('button', { name: /Owner/ }))
  return screen.getByRole('textbox', { name: 'Search options…' })
}

describe('searchable filter facet', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
    document.body.innerHTML = '<div class="ds-root"></div>'
  })

  it('narrows the options by label', () => {
    render(<Harness />)
    const box = openOwnerFacet()
    expect(box).toHaveFocus()

    fireEvent.change(box, { target: { value: 'CAR' } })

    expect(screen.getByRole('button', { name: 'carol' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'alice' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'bob' })).toBeNull()
  })

  it('keeps a checked option listed while typing', () => {
    render(<Harness />)
    const box = openOwnerFacet()
    fireEvent.click(screen.getByRole('button', { name: 'alice' }))

    fireEvent.change(box, { target: { value: 'zzz' } })

    expect(screen.getByRole('button', { name: 'alice' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'bob' })).toBeNull()
  })
})
