// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { UIProvider } from '../components/Provider'
import { ListPager } from './ListPager'

it('shows a capped total as a floor and keeps paging past it', () => {
  render(<ListPager page={200} pageSize={50} total={10000} hasNext onPageChange={() => {}} />)
  expect(screen.getByText('10001–10050 of 10050+')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
})

it('passes a translated pager the floor as a number and flags it', () => {
  const pager = vi.fn((start: number, end: number, total: number, atLeast: boolean) =>
    atLeast ? `${start}-${end} of at least ${total}` : `${start}-${end} of ${total}`,
  )
  const { rerender } = render(
    <UIProvider strings={{ list: { pager } }}>
      <ListPager page={200} pageSize={50} total={10000} hasNext onPageChange={() => {}} />
    </UIProvider>,
  )
  expect(pager).toHaveBeenLastCalledWith(10001, 10050, 10050, true)
  expect(screen.getByText('10001-10050 of at least 10050')).toBeInTheDocument()

  rerender(
    <UIProvider strings={{ list: { pager } }}>
      <ListPager page={1} pageSize={50} total={120} hasNext={false} onPageChange={() => {}} />
    </UIProvider>,
  )
  expect(pager).toHaveBeenLastCalledWith(51, 100, 120, false)
})

it('stays visible while more rows follow a total that fits one page', () => {
  render(<ListPager page={0} pageSize={50} total={50} hasNext onPageChange={() => {}} />)
  expect(screen.getByText('1–50 of 50+')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
})

it('renders nothing for a single page with no more rows', () => {
  const { container } = render(
    <ListPager page={0} pageSize={50} total={30} hasNext={false} onPageChange={() => {}} />,
  )
  expect(container).toBeEmptyDOMElement()
})
