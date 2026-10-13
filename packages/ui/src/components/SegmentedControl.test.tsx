// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { openTooltip } from '../test/tooltip'
import { SegmentedControl } from './SegmentedControl'

describe('SegmentedControl', () => {
  it('presses the current choice and reports a new one', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="Range"
        value="day"
        onChange={onChange}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
      />,
    )
    expect(screen.getByRole('group', { name: 'Range' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    expect(onChange).toHaveBeenCalledWith('week')
  })

  it('renders page segments as navigation marking the current page', () => {
    render(
      <SegmentedControl
        label="Views"
        value="b"
        options={[
          { value: 'a', label: 'First', href: '/a' },
          { value: 'b', label: 'Second', href: '/b' },
        ]}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Second' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'First' })).not.toHaveAttribute('aria-current')
  })

  it('keeps each label as the accessible name and tooltip when only icons show', async () => {
    render(
      <SegmentedControl
        label="Views"
        value="a"
        iconOnly
        options={[{ value: 'a', label: 'First', icon: <svg />, href: '/a' }]}
      />,
    )
    act(() => screen.getByRole('link', { name: 'First' }).focus())
    await waitFor(() => expect(openTooltip()).toHaveTextContent('First'))
  })
})
