// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ListPager } from './ListPager'

it('shows a capped total as a floor and keeps paging past it', () => {
  render(<ListPager page={200} pageSize={50} total={10000} hasNext onPageChange={() => {}} />)
  expect(screen.getByText('10001–10050 of 10050+')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
})
