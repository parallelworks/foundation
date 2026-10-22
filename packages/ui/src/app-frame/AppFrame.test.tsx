// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppFrame, AppFrameNavItem, AppFrameToggle } from './index'

let mobile = false
beforeEach(() => {
  mobile = false
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: mobile, addEventListener() {}, removeEventListener() {} })),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const navigation = (
  <nav aria-label="Primary">
    <AppFrameNavItem label="Projects" icon={<span>P</span>} href="#projects" selected />
    <AppFrameNavItem label="Settings" icon={<span>S</span>} />
  </nav>
)
const props = {
  navigation,
  header: <AppFrameToggle />,
  children: <button type="button">Content action</button>,
}

describe('AppFrame', () => {
  it('collapses into a named icon rail without removing navigation links', () => {
    render(<AppFrame {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '64')
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '240')
  })
  it('resizes with the keyboard, bounds widths, and reopens a collapsed rail', () => {
    render(<AppFrame {...props} defaultWidth={184} minWidth={168} maxWidth={320} />)
    const splitter = screen.getByRole('separator')
    for (const [key, width] of [
      ['Home', '168'],
      ['ArrowLeft', '64'],
      ['ArrowRight', '168'],
      ['End', '320'],
      ['ArrowRight', '320'],
    ]) {
      fireEvent.keyDown(splitter, { key })
      expect(splitter).toHaveAttribute('aria-valuenow', width)
    }
  })
  it('reports controlled changes and keeps the host value authoritative', () => {
    const onWidthChange = vi.fn(),
      onExpandedChange = vi.fn()
    render(
      <AppFrame
        {...props}
        width={260}
        expanded
        onWidthChange={onWidthChange}
        onExpandedChange={onExpandedChange}
      />,
    )
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(onWidthChange).toHaveBeenCalledWith(276)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '260')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(onExpandedChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
  })
  it('moves focus to content without changing a hash route', () => {
    render(<AppFrame {...props} />)
    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }))
    expect(screen.getByRole('main')).toHaveFocus()
    expect(window.location.hash).toBe('')
  })
  it('opens a mobile dialog, closes on navigation, and restores focus', async () => {
    mobile = true
    render(<AppFrame {...props} defaultExpanded={false} />)
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument()
    act(() => trigger.focus())
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Main navigation' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveTextContent('Settings')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
  it('closes the drawer when the host changes route', async () => {
    mobile = true
    const view = render(<AppFrame {...props} navigationKey="projects" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await screen.findByRole('dialog')
    view.rerender(<AppFrame {...props} navigationKey="settings" />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
