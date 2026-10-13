// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { UIProvider } from './Provider'
import { useCopy } from './useCopy'

const notify = { success: vi.fn(), error: vi.fn() }
const wrapper = ({ children }: { children: ReactNode }) => (
  <UIProvider notify={notify}>{children}</UIProvider>
)

function setClipboard(writeText: (text: string) => Promise<void>) {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(writeText) } })
}

beforeEach(() => {
  notify.success.mockClear()
  notify.error.mockClear()
})

describe('useCopy', () => {
  it('copies, says what was copied, and shows copied for a moment', async () => {
    vi.useFakeTimers()
    setClipboard(async () => {})
    const { result } = renderHook(() => useCopy(), { wrapper })
    await act(async () => {
      expect(await result.current.copy('a@b.c', { label: 'email address' })).toBe(true)
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('a@b.c')
    expect(notify.success).toHaveBeenCalledWith('Copied email address')
    expect(result.current.copied).toBe(true)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.copied).toBe(false)
    vi.useRealTimers()
  })

  it('stays quiet on success when asked, and still reports a failure', async () => {
    setClipboard(async () => {})
    const { result } = renderHook(() => useCopy(), { wrapper })
    await act(() => result.current.copy('x', { quiet: true }))
    expect(notify.success).not.toHaveBeenCalled()

    setClipboard(() => Promise.reject(new Error('denied')))
    await act(async () => {
      expect(await result.current.copy('x', { quiet: true })).toBe(false)
    })
    expect(notify.error).toHaveBeenCalledWith("Couldn't copy to the clipboard")
  })
})
