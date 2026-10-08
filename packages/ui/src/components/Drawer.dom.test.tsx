// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Drawer } from './Drawer'

afterEach(cleanup)

describe('Drawer', () => {
  it('renders a labelled dialog with its toolbar, body and footer', () => {
    render(
      <Drawer open onClose={() => {}} title="Details" toolbar="toolbar" footer="footer">
        body
      </Drawer>,
    )
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByText('toolbar')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
    expect(screen.getByText('footer')).toBeInTheDocument()
  })

  it('closes on Escape and from the close button', () => {
    const onClose = vi.fn()
    render(
      <Drawer open onClose={onClose} title="Details">
        body
      </Drawer>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores Escape and backdrop clicks while closing is prevented', () => {
    const onClose = vi.fn()
    render(
      <Drawer open onClose={onClose} title="Details" preventClose>
        body
      </Drawer>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('never grows past the viewport', () => {
    render(
      <Drawer open onClose={() => {}} title="Details" width={900}>
        body
      </Drawer>,
    )
    const panel = screen.getByRole('heading', { name: 'Details' }).closest('[style]')
    expect(panel).toHaveStyle({ width: '900px' })
    expect(panel).toHaveClass('max-w-full')
  })

  it('renders nothing while closed', () => {
    render(
      <Drawer open={false} onClose={() => {}} title="Details">
        body
      </Drawer>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
