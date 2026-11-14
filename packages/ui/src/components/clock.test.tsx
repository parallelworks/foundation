// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { useClock } from './clock'

const START = new Date('2026-01-01T12:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useClock', () => {
  it('shares one clock, and stops it when nothing reads it', () => {
    function Seconds() {
      return <span>{useClock((now) => Math.floor((now - START.getTime()) / 1000))}s</span>
    }
    const { unmount } = render(
      <>
        <Seconds />
        <Seconds />
      </>,
    )
    expect(vi.getTimerCount()).toBe(1)
    advance(2000)
    expect(screen.getAllByText('2s')).toHaveLength(2)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves the clock while not running', () => {
    function Stopped() {
      return <span>{useClock((now) => now, false)}</span>
    }
    render(<Stopped />)
    expect(vi.getTimerCount()).toBe(0)
  })
})
