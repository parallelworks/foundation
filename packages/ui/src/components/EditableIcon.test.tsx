// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EditableIcon } from './EditableIcon'

describe('EditableIcon', () => {
  it('opens the editor from the icon and removes the image from its corner', () => {
    const onEdit = vi.fn()
    const onRemove = vi.fn()
    render(
      <EditableIcon icon="/icon.png" label="Edit the icon" onEdit={onEdit} onRemove={onRemove} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit the icon' }))
    expect(onEdit).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('offers nothing to remove without an image, or once it fails to load', () => {
    const { container, rerender } = render(
      <EditableIcon fallbackIcon="F" onEdit={() => {}} onRemove={() => {}} />,
    )
    expect(container).toHaveTextContent('F')
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull()
    rerender(
      <EditableIcon icon="/icon.png" fallbackIcon="F" onEdit={() => {}} onRemove={() => {}} />,
    )
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container).toHaveTextContent('F')
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull()
  })

  it('shows only the icon when it is not editable', () => {
    render(<EditableIcon icon="/icon.png" editable={false} onEdit={() => {}} onRemove={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
