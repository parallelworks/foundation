// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CopyButton, CopyCodeBlock } from './CopyButton'
import { toast } from './Toast'

const notifySuccess = vi.spyOn(toast, 'success')

function clipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  return writeText
}

beforeEach(() => {
  notifySuccess.mockClear()
})

describe('CopyButton', () => {
  it('takes its own glyph and toast, and still turns into a check', async () => {
    clipboard()
    render(
      <CopyButton
        text="feature/login"
        label="branch name"
        icon={<svg data-testid="branch" />}
        success="Copied feature/login"
      />,
    )
    expect(screen.getByTestId('branch')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy branch name' }))
    await screen.findByRole('button', { name: 'Copied branch name' })
    expect(screen.queryByTestId('branch')).toBeNull()
    expect(notifySuccess).toHaveBeenCalledWith('Copied feature/login')
  })

  it('is named for what it copies, then says it copied it', async () => {
    const writeText = clipboard()
    render(<CopyButton text="ada@example.com" label="email address" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy email address' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ada@example.com'))
    expect(await screen.findByRole('button', { name: 'Copied email address' })).toBeInTheDocument()
    expect(notifySuccess).toHaveBeenCalledWith('Copied email address')
  })

  it('reads its text when pressed', async () => {
    const writeText = clipboard()
    let value = 'first'
    render(<CopyButton text={() => value} />)
    value = 'second'

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('second'))
  })

  it('shows no toast when quiet', async () => {
    const writeText = clipboard()
    render(<CopyButton text="x" quiet />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    await screen.findByRole('button', { name: 'Copied' })
    expect(notifySuccess).not.toHaveBeenCalled()
  })
})

describe('CopyCodeBlock', () => {
  it('copies its text once from its button, and leaves the code selectable', async () => {
    const writeText = clipboard()
    render(
      <CopyCodeBlock text="npm install" label="install command">
        npm install
      </CopyCodeBlock>,
    )

    // A press on the code itself selects text rather than copying it.
    fireEvent.click(screen.getByText('npm install'))
    expect(writeText).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Copy install command' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('npm install'))
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  it('offers a secret toggle that reports its state', () => {
    clipboard()
    const onRevealedChange = vi.fn()
    render(
      <CopyCodeBlock text="s3cr3t" secret revealed={false} onRevealedChange={onRevealedChange}>
        ••••••
      </CopyCodeBlock>,
    )

    const toggle = screen.getByRole('button', { name: 'Show value' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(onRevealedChange).toHaveBeenCalledWith(true)
  })
})

describe('CopyButton with its label shown', () => {
  it('shows "Copy" and keeps the full name', async () => {
    const writeText = clipboard()
    render(<CopyButton text="a: 1" label="workflow YAML" showLabel />)

    const button = screen.getByRole('button', { name: 'Copy workflow YAML' })
    expect(button).toHaveTextContent('Copy')
    fireEvent.click(button)

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('a: 1'))
    expect(await screen.findByRole('button', { name: 'Copied workflow YAML' })).toHaveTextContent(
      'Copied',
    )
  })
})

describe('CopyCodeBlock secret', () => {
  it('masks the value itself until the eye shows it, and copies it either way', async () => {
    const writeText = clipboard()
    render(<CopyCodeBlock text="pk_live_51HhZ2vK8x2Q" label="API key" secret />)
    expect(screen.queryByText('pk_live_51HhZ2vK8x2Q')).toBeNull()
    expect(screen.getByText('Hidden value')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy API key' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('pk_live_51HhZ2vK8x2Q'))
    const eye = screen.getByRole('button', { name: 'Show value' })
    fireEvent.click(eye)
    expect(eye).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('pk_live_51HhZ2vK8x2Q')).toBeInTheDocument()
  })

  it('sits inline with its buttons after the value, and copies with the check and no toast', async () => {
    const writeText = clipboard()
    render(<CopyCodeBlock text="pwk_live_8f3b" label="API key" inline secret defaultRevealed />)
    const value = screen.getByText('pwk_live_8f3b')
    expect(value.tagName).toBe('CODE')
    // One line that scrolls inside, so a long token neither widens the page nor breaks.
    expect(value).toHaveClass('overflow-x-auto', 'whitespace-nowrap')
    expect(value).not.toHaveClass('break-all')
    const copy = screen.getByRole('button', { name: 'Copy API key' })
    const show = screen.getByRole('button', { name: 'Show value' })
    expect(value.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(copy.compareDocumentPosition(show) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(copy).not.toHaveClass('opacity-0')
    fireEvent.click(copy)
    await screen.findByRole('button', { name: 'Copied API key' })
    expect(writeText).toHaveBeenCalledWith('pwk_live_8f3b')
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  it('shows an inline value in the clear unless it is a secret', () => {
    clipboard()
    const { rerender } = render(<CopyCodeBlock text="tok_123" inline />)
    expect(screen.getByText('tok_123')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show value' })).toBeNull()
    rerender(<CopyCodeBlock text="tok_123" inline secret />)
    expect(screen.queryByText('tok_123')).toBeNull()
    expect(screen.getByRole('button', { name: 'Show value' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
