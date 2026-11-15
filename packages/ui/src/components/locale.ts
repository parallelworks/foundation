import { createContext, useContext } from 'react'

export const LocaleContext = createContext<string | undefined>(undefined)

/** The host's locale for dates and times, such as `de-DE`: `UIProvider`'s `locale`, or
 *  `UIStringsProvider`'s. Undefined without one, which leaves each format's own default: the date
 *  library's for its times, the browser's for the rest. */
export function useLocale(): string | undefined {
  return useContext(LocaleContext)
}
