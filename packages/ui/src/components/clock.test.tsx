// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
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

  it('hydrates from one reading of the time, though the time moves on every read', async () => {
    let time = START.getTime()
    vi.spyOn(Date, 'now').mockImplementation(() => time++)
    function Moment() {
      return <span>{useClock((now) => now) > 0 ? 'now' : ''}</span>
    }
    const container = document.createElement('div')
    container.innerHTML = renderToString(<Moment />)
    await new Promise((resolve) => setTimeout(resolve))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let root: Root | undefined
    await act(async () => {
      root = hydrateRoot(container, <Moment />)
    })
    expect(errors).not.toHaveBeenCalled()
    expect(container.textContent).toBe('now')
    act(() => root?.unmount())
    errors.mockRestore()
  })
})
