// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ImageUpload } from './ImageUpload'

describe('ImageUpload', () => {
  it('shows the first letter of the name without an image', () => {
    const { container } = render(<ImageUpload name="operations" onUpload={async () => {}} />)
    expect(container).toHaveTextContent('o')
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows the image, and the letter again when it fails to load', () => {
    const { container } = render(
      <ImageUpload name="Platform" src="/icon.png" onUpload={async () => {}} />,
    )
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', '/icon.png')
    fireEvent.error(img as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('P')
  })

  it('names its edit button after what the image stands for, and hides it when disabled', () => {
    const { rerender } = render(<ImageUpload name="Platform" onUpload={async () => {}} />)
    expect(
      screen.getByRole('button', { name: 'Change the image for Platform' }),
    ).toBeInTheDocument()
    rerender(<ImageUpload name="Platform" disabled onUpload={async () => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('removes the image from the corner button, which shows only with an image', () => {
    const onRemove = vi.fn()
    const { rerender } = render(
      <ImageUpload name="Platform" onUpload={async () => {}} onRemove={onRemove} />,
    )
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull()
    rerender(
      <ImageUpload name="Platform" src="/icon.png" onUpload={async () => {}} onRemove={onRemove} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('saves a GIF as it is, without the crop dialog, with a still for a server that refuses it', () => {
    const onUpload = vi.fn(async () => {})
    const { container } = render(<ImageUpload name="Platform" onUpload={onUpload} />)
    const gif = new File(['GIF89a'], 'spin.gif', { type: 'image/gif' })
    fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, {
      target: { files: [gif] },
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onUpload).toHaveBeenCalledWith(gif, expect.any(Function))
  })

  it('opens the crop dialog only for an image file', async () => {
    const { container } = render(<ImageUpload name="Platform" onUpload={async () => {}} />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] },
    })
    expect(await screen.findByRole('dialog', { name: 'Image for Platform' })).toBeInTheDocument()
  })
})
