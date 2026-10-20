import { describe, expect, it } from 'vitest'
import { revealCount } from './useSSEStream'

describe('revealCount', () => {
  it('reveals in proportion to the time since the last reveal, not the frame', () => {
    expect(revealCount(10, 16)).toBe(2)
    expect(revealCount(10, 32)).toBe(4)
  })

  it('speeds up with the backlog so a fast model is tracked closely', () => {
    // 1,500 characters waiting drain over about 300ms: 80 per 16ms frame.
    expect(revealCount(1500, 16)).toBe(80)
  })

  it('never reveals more than is waiting, and always at least one', () => {
    expect(revealCount(3, 1000)).toBe(3)
    expect(revealCount(5, 1)).toBe(1)
    expect(revealCount(0, 16)).toBe(0)
  })

  it('reveals the same amount per second at 60Hz and 120Hz', () => {
    const perSecond = (frameMs: number) => {
      let remaining = 100_000
      let shown = 0
      // A backlog topped up to stay level, so only the frame rate differs.
      for (let t = 0; t < 1000; t += frameMs) {
        const n = revealCount(remaining, frameMs)
        shown += n
        remaining -= n
        remaining += n
      }
      return shown
    }
    expect(Math.abs(perSecond(16.7) - perSecond(8.3)) / perSecond(16.7)).toBeLessThan(0.05)
  })
})
