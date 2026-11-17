import { createContext, useCallback, useContext, useState } from 'react'

/** What a reader opened in a transcript's rows, kept while the list lets go of
 *  the rows far from the view, so a row drawn again shows what it showed. A
 *  block is known by what it draws: the id of its part or message, or the part
 *  itself, which keeps its identity until a delta changes it. */
export interface RowMemory {
  get(owner: object | string, slot: string): boolean | undefined
  set(owner: object | string, slot: string, value: boolean): void
}

export function createRowMemory(): RowMemory {
  const byId = new Map<string, boolean>()
  const byObject = new WeakMap<object, Map<string, boolean>>()
  return {
    get(owner, slot) {
      return typeof owner === 'string'
        ? byId.get(`${slot}:${owner}`)
        : byObject.get(owner)?.get(slot)
    },
    set(owner, slot, value) {
      if (typeof owner === 'string') {
        byId.set(`${slot}:${owner}`, value)
        return
      }
      const slots = byObject.get(owner) ?? new Map<string, boolean>()
      slots.set(slot, value)
      byObject.set(owner, slots)
    },
  }
}

export const RowMemoryContext = createContext<RowMemory | null>(null)

export const ExpandAllContext = createContext<boolean | undefined>(undefined)

/** Whether the transcripts under it have every block opened or closed. */
export function useExpandAll(): boolean | undefined {
  return useContext(ExpandAllContext)
}

/** A block's open state, starting as the reader left it when its row was
 *  drawn before. Outside a list that keeps rows' memory, plain state. */
export function useRemembered(
  owner: object | string | undefined,
  slot: string,
  initial: boolean,
): [boolean, (value: boolean) => void] {
  const memory = useContext(RowMemoryContext)
  const [value, setValue] = useState(
    () => (owner === undefined ? undefined : memory?.get(owner, slot)) ?? initial,
  )
  const set = useCallback(
    (next: boolean) => {
      setValue(next)
      if (owner !== undefined) {
        memory?.set(owner, slot, next)
      }
    },
    [memory, owner, slot],
  )
  return [value, set]
}
