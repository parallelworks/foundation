import { dequal } from 'dequal'
import { useRef } from 'react'

// The value last seen while each new one equals it, so a host passing an object literal each
// render hands consumers the same object and none of them re-render.
export function useByValue<T>(value: T): T {
  const ref = useRef(value)
  if (ref.current !== value && !dequal(ref.current, value)) {
    ref.current = value
  }
  return ref.current
}

export function useMerged<T>(compute: () => T, input: unknown): T {
  const stableInput = useByValue(input)
  const ref = useRef<{ input: unknown; value: T } | null>(null)
  if (!ref.current || ref.current.input !== stableInput) {
    ref.current = { input: stableInput, value: compute() }
  }
  return ref.current.value
}
