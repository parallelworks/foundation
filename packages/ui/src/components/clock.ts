import { useSyncExternalStore } from 'react'

const SECOND = 1000

// One clock for every live time on screen, rather than a timer per component.
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
let now = Date.now()

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    // A render reads `now` before subscribing, so the first one may use a stale
    // time; React reads it again once subscribed and re-renders if it moved.
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      for (const notify of listeners) {
        notify()
      }
    }, SECOND)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const stopped = () => () => {}

let readThisTask = false

// Nothing subscribes on a server, so no timer moves the clock there. While no clock runs, a render
// reads the time itself, or a long-lived server would show every time as of when it loaded this
// module. It reads once per task, so every clock in one render agrees, and React, which in
// development reads twice in a row while hydrating to check the answer holds, gets the same one.
// A promise clears the reading, not queueMicrotask, which a test's fake timers may replace and
// never run, holding every later render at this time.
function renderedNow(): number {
  if (!timer && !readThisTask) {
    now = Date.now()
    readThisTask = true
    Promise.resolve().then(() => {
      readThisTask = false
    })
  }
  return now
}

/** Something worked out from the time, kept current by one clock that ticks
 *  each second for every component reading it. A component re-renders only
 *  when what `select` returns changes, so a label reading "3h" sits still
 *  while the clock runs. `select` runs every tick, so keep it cheap; while
 *  `running` is false the component leaves the clock and `select` sees the
 *  last tick's time. */
export function useClock<T>(select: (now: number) => T, running = true): T {
  return useSyncExternalStore(
    running ? subscribe : stopped,
    () => select(now),
    () => select(renderedNow()),
  )
}
