import { useCallback, useSyncExternalStore } from 'react'

// Phone width, where Popover opens as a sheet.
const NARROW = '(max-width: 639px)'

const matches = (query: string) =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(query).matches

/** Whether the media query matches, kept current as it changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {}
      }
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => matches(query),
    () => false,
  )
}

/** Whether the screen is phone width, under 640px. */
export function useNarrow(): boolean {
  return useMediaQuery(NARROW)
}
