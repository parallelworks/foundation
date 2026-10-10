import { createContext, useCallback, useContext, useRef, useState } from 'react'

/** The conversation list beside the thread: full width, a rail of icons, or
 *  not shown at all (the host offers its own way back). */
export type SidebarState = 'expanded' | 'collapsed' | 'hidden'

/** How the layout shows the list right now: as a column beside the thread,
 *  or as a drawer over it. */
export type SidebarPresentation = 'inline' | 'drawer'

const SIDEBAR_STORAGE_KEY = 'aiChatSidebar'
// Earlier releases kept only collapsed or not, as '1' or '0'.
const LEGACY_COLLAPSED_STORAGE_KEY = 'aiChatSidebarCollapsed'

export function readStoredSidebar(): SidebarState {
  try {
    const stored = globalThis.localStorage?.getItem(SIDEBAR_STORAGE_KEY)
    if (stored === 'expanded' || stored === 'collapsed') {
      return stored
    }
    return globalThis.localStorage?.getItem(LEGACY_COLLAPSED_STORAGE_KEY) === '1'
      ? 'collapsed'
      : 'expanded'
  } catch {
    return 'expanded'
  }
}

// Only the reader's own choice between the column and the rail is
// remembered; hiding the list is the host's call and would otherwise outlive
// the page that made it.
export function storeSidebar(state: SidebarState) {
  if (state === 'hidden') {
    return
  }
  try {
    globalThis.localStorage?.setItem(SIDEBAR_STORAGE_KEY, state)
  } catch {
    // Storage unavailable: the sidebar still toggles, it just does not remember.
  }
}

/** A value the host may own through a prop. Without the prop the provider
 *  keeps it; either way the change callback hears every change. The ref
 *  reads the latest value from callbacks that should not re-create. */
export function useControllable<T>(
  controlled: T | undefined,
  initial: () => T,
  onChange: ((value: T) => void) | undefined,
  remember?: (value: T) => void,
) {
  const [own, setOwn] = useState(initial)
  const value = controlled === undefined ? own : controlled
  const latest = useRef({ value, controlled: controlled !== undefined, onChange, remember })
  latest.current = { value, controlled: controlled !== undefined, onChange, remember }

  const set = useCallback((next: T) => {
    const l = latest.current
    if (Object.is(next, l.value)) {
      return
    }
    if (!l.controlled) {
      setOwn(next)
      l.remember?.(next)
    }
    l.onChange?.(next)
  }, [])

  return [value, set, latest] as const
}

// ChatLayout reports how it shows the list; kept off useChat because only
// the layout should set it.
export const ReportSidebarPresentationContext = createContext<
  (presentation: SidebarPresentation) => void
>(() => {})

export function useReportSidebarPresentation() {
  return useContext(ReportSidebarPresentationContext)
}
