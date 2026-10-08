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
  // Re-seed when the drawer opens or fresh data arrives, but never over unsaved edits:
  // a background revalidation must not wipe what the person is changing.
  useEffect(() => {
    const opening = open && !wasOpen.current
    wasOpen.current = open
    if (open && value && (opening || !dirtyRef.current)) {
      setSaved(value)
      setDraft(value)
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
    discard: useCallback(() => setDraft(saved), [saved]),
    commit: useCallback((next: AccessValue) => {
      setSaved(next)
      setDraft(next)
    }, []),
  }
}

export type AccessDraft = ReturnType<typeof useAccessDraft>
