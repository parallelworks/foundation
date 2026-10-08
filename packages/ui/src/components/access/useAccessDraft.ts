import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type AccessSubject,
  type AccessValue,
  changedSubjects,
  restore,
  revokeAll,
  toggle,
} from './accessDraft'

const EMPTY: AccessValue = { organization: {}, groups: {} }

export function useAccessDraft(value: AccessValue | undefined, open: boolean) {
  const [saved, setSaved] = useState<AccessValue>(value ?? EMPTY)
  const [draft, setDraft] = useState<AccessValue>(value ?? EMPTY)
  const changes = useMemo(() => changedSubjects(draft, saved), [draft, saved])
  const dirty = changes.length > 0

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const wasOpen = useRef(false)
  const held = useRef<AccessValue | null>(null)
  // Re-seed when the drawer opens or fresh data arrives, but never over unsaved edits:
  // a background revalidation must not wipe what the person is changing. It is held
  // until they discard instead. Opening always re-seeds, even before the value loads,
  // so edits from an earlier opening never outlive it.
  useEffect(() => {
    const opening = open && !wasOpen.current
    wasOpen.current = open
    if (!open) {
      return
    }
    if (opening || (value && !dirtyRef.current)) {
      held.current = null
      setSaved(value ?? EMPTY)
      setDraft(value ?? EMPTY)
    } else if (value) {
      held.current = value
    }
  }, [open, value])

  return {
    saved,
    draft,
    changes,
    dirty,
    toggle: useCallback(
      (subject: AccessSubject, key: string) => setDraft((d) => toggle(d, subject, key)),
      [],
    ),
    revokeAll: useCallback((subject: AccessSubject) => setDraft((d) => revokeAll(d, subject)), []),
    undo: useCallback(
      (subject: AccessSubject) => setDraft((d) => restore(d, saved, subject)),
      [saved],
    ),
    discard: useCallback(() => {
      const fresh = held.current ?? saved
      held.current = null
      setSaved(fresh)
      setDraft(fresh)
    }, [saved]),
    /** Records that `submitted` saved as `next`; edits made while it was saving stay. */
    commit: useCallback((next: AccessValue, submitted: AccessValue) => {
      held.current = null
      setSaved(next)
      setDraft((d) => (d === submitted ? next : d))
    }, []),
  }
}

export type AccessDraft = ReturnType<typeof useAccessDraft>
