import { createContext, use, useCallback } from 'react'

/** A failure the explorer describes itself, so its message is already in the reader's words. */
export class ShownError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShownError'
  }
}

/** The host's words for an error, such as a localized message for its code. */
export type ErrorMessage = (error: unknown) => string | undefined

export const ErrorMessageContext = createContext<ErrorMessage | undefined>(undefined)

/**
 * Returns what to show for an error: the explorer's own message, otherwise the host's
 * `errorMessage`, otherwise `fallback`. An error's own message from anywhere else never shows,
 * as a server's or a cloud SDK's words aren't the reader's.
 */
export function useErrorText(): (error: unknown, fallback: string) => string {
  const errorMessage = use(ErrorMessageContext)
  return useCallback(
    (error: unknown, fallback: string) => {
      if (error instanceof ShownError) {
        return error.message
      }
      return errorMessage?.(error) || fallback
    },
    [errorMessage],
  )
}
