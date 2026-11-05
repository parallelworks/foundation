// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AttachmentRef } from '../types'
import MessageAttachments from './MessageAttachments'

const PREVIEW = 'data:image/png;base64,iVBORw0KGgo='

function image(id: string, extra?: Partial<AttachmentRef>): AttachmentRef {
  return {
    id,
    filename: `${id}.png`,
    contentType: 'image/png',
    size: 100,
    uploadedAt: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

const download = (id: string) => `/dl/${id}`

// jsdom loads no images, so each one a test makes waits for it to say how it went.
const loads: { src: string; onload: (() => void) | null; onerror: (() => void) | null }[] = []
class FakeImage {
  src = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    loads.push(this)
  }
}

beforeEach(() => {
  loads.length = 0
  vi.stubGlobal('Image', FakeImage)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function viewerImage(name: string) {
  return within(screen.getByRole('dialog', { name })).getByRole('img', { name })
}

describe('message image viewer', () => {
  it('opens on a plain click and closes on its close button, returning focus to the thumbnail', async () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    const thumbnail = screen.getByRole('link', { name: 'a.png' })
    fireEvent.click(thumbnail)
    const dialog = await screen.findByRole('dialog', { name: 'a.png' })
    expect(viewerImage('a.png')).toHaveAttribute('src', '/dl/a')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(thumbnail).toHaveFocus()
  })

  it('closes on Escape', async () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('link', { name: 'a.png' })).toHaveFocus()
  })

  it('closes on a click on the backdrop', async () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog')
    const outside = dialog.parentElement as HTMLElement
    fireEvent.pointerDown(outside)
    fireEvent.mouseDown(outside)
    fireEvent.pointerUp(outside)
    fireEvent.mouseUp(outside)
    fireEvent.click(outside)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the preview as the thumbnail and never links to it', () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    const thumbnail = screen.getByRole('img', { name: 'a.png' })
    expect(thumbnail).toHaveAttribute('src', PREVIEW)
    expect(screen.getByRole('link', { name: 'a.png' })).toHaveAttribute('href', '/dl/a')
    for (const link of document.querySelectorAll('a')) {
      expect(link.getAttribute('href')).not.toBe(PREVIEW)
    }
  })

  it('swaps the preview for the full image once it loads', async () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    await screen.findByRole('dialog')
    expect(viewerImage('a.png')).toHaveAttribute('src', PREVIEW)
    const full = loads.find((load) => load.src === '/dl/a')
    expect(full).toBeDefined()
    act(() => full?.onload?.())
    expect(viewerImage('a.png')).toHaveAttribute('src', '/dl/a')
  })

  it('keeps the preview when the full image fails to load', async () => {
    render(
      <MessageAttachments
        attachments={[image('a', { previewUrl: PREVIEW })]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    await screen.findByRole('dialog')
    act(() => loads.find((load) => load.src === '/dl/a')?.onerror?.())
    expect(viewerImage('a.png')).toHaveAttribute('src', PREVIEW)
  })

  it('leaves the click to a host that opens attachments itself', () => {
    const onOpen = vi.fn()
    const att = image('a')
    render(<MessageAttachments attachments={[att]} downloadUrl={download} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    expect(onOpen).toHaveBeenCalledWith(att)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leaves a modified click to the browser', () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    const link = screen.getByRole('link', { name: 'a.png' })
    for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
      // fireEvent returns false when a handler prevented the default.
      expect(fireEvent.click(link, { [modifier]: true })).toBe(true)
    }
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers a download only for a URL that cannot run script', async () => {
    const { unmount } = render(
      <MessageAttachments attachments={[image('a')]} downloadUrl={download} />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'Download a.png' })).toHaveAttribute(
      'href',
      '/dl/a',
    )
    unmount()

    // An image's own data: URL still shows, but is never a link.
    const dataUrl = (id: string) => `data:image/png;base64,${id}`
    render(<MessageAttachments attachments={[image('b')]} downloadUrl={dataUrl} />)
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'b.png' }))
    const unlinked = await screen.findByRole('dialog', { name: 'b.png' })
    expect(within(unlinked).queryByRole('link')).toBeNull()
  })

  it('opens a preview with no download, named for an unnamed image', async () => {
    render(<MessageAttachments attachments={[image('a', { filename: '', previewUrl: PREVIEW })]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Image attachment' }))
    expect(await screen.findByRole('dialog', { name: 'Image attachment' })).toBeInTheDocument()
    expect(viewerImage('Image attachment')).toHaveAttribute('src', PREVIEW)
  })

  it('steps between a message’s images with the arrow keys and buttons', async () => {
    render(
      <MessageAttachments
        attachments={[image('a'), { ...image('doc'), contentType: 'text/plain' }, image('b')]}
        downloadUrl={download}
      />,
    )
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    const dialog = await screen.findByRole('dialog', { name: 'a.png' })
    expect(within(dialog).getByText('1 of 2')).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog', { name: 'b.png' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next image' }))
    expect(screen.getByRole('dialog', { name: 'a.png' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Previous image' }))
    expect(screen.getByRole('dialog', { name: 'b.png' })).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('link', { name: 'b.png' })).toHaveFocus()
  })

  it('keeps an image with no picture to show as a plain chip', () => {
    render(<MessageAttachments attachments={[image('a')]} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('a.png')).toBeInTheDocument()
  })
})

describe('message image viewer letterbox', () => {
  it('closes on a click beside the contained picture, not on the picture', async () => {
    render(<MessageAttachments attachments={[image('a')]} downloadUrl={download} />)
    fireEvent.click(screen.getByRole('link', { name: 'a.png' }))
    await screen.findByRole('dialog')
    const picture = viewerImage('a.png') as HTMLImageElement
    // A 100×100 picture drawn in a 300×100 box: the middle third is the picture.
    Object.defineProperty(picture, 'naturalWidth', { value: 100 })
    Object.defineProperty(picture, 'naturalHeight', { value: 100 })
    picture.getBoundingClientRect = () => new DOMRect(0, 0, 300, 100)
    fireEvent.click(picture, { clientX: 150, clientY: 50 })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(picture, { clientX: 20, clientY: 50 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
