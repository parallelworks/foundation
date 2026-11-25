import { createContext, useContext } from 'react'

/** Ends a transcript's hold on growth the reader just caused, for an action
 *  that hands the turn back, such as answering an approval: what grows next is
 *  the turn going on, which the list follows like any other. */
export const ReaderHoldContext = createContext<() => void>(() => {})

export function useReleaseReaderHold(): () => void {
  return useContext(ReaderHoldContext)
}
