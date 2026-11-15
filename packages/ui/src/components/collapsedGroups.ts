import { useCallback, useMemo } from 'react'
import { usePersistedState } from './Provider'

// Lists that name no key of their own share one, so a list and the one standing in for it on a
// narrow screen fold the same groups.
export const SHARED_COLLAPSED_GROUPS_STORAGE_KEY = 'aiChatSidebarCollapsedGroups'

/** The keys of the groups the reader folded. A key stays while its group is gone, emptied or
 *  filtered out, so the group comes back folded. */
export function useCollapsedGroups(storageKey: string) {
  const [stored, setStored] = usePersistedState<string[]>(storageKey, [])
  const collapsed = useMemo(() => new Set(storedKeys(stored)), [stored])
  const toggle = useCallback(
    (key: string) =>
      setStored((prev) => {
        const keys = storedKeys(prev)
        return keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
      }),
    [setStored],
  )
  return { collapsed, toggle }
}

// What was stored is only trusted as a list of keys.
function storedKeys(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((k): k is string => typeof k === 'string') : []
}
