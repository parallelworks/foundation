// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { ShownError, useErrorText } from './errorText'
import { FileExplorerProvider } from './FileExplorerContext'

const withHost =
  (errorMessage?: (error: unknown) => string | undefined) =>
  ({ children }: { children: ReactNode }) => (
    <FileExplorerProvider errorMessage={errorMessage}>{children}</FileExplorerProvider>
  )

describe('useErrorText', () => {
  it("shows the explorer's own message as it is", () => {
    const { result } = renderHook(() => useErrorText(), { wrapper: withHost(() => 'host') })
    expect(result.current(new ShownError('Couldn’t connect'), 'fallback')).toBe('Couldn’t connect')
  })

  it("shows the host's words for anything else", () => {
    const { result } = renderHook(() => useErrorText(), {
      wrapper: withHost(() => 'You can’t open this folder.'),
    })
    expect(result.current(new Error('AccessDenied'), 'fallback')).toBe(
      'You can’t open this folder.',
    )
  })

  it("falls back when the host has no words, and never shows the error's own", () => {
    const { result } = renderHook(() => useErrorText(), { wrapper: withHost(() => undefined) })
    expect(result.current(new Error('AccessDenied'), 'Something went wrong')).toBe(
      'Something went wrong',
    )
    const bare = renderHook(() => useErrorText(), { wrapper: withHost() })
    expect(bare.result.current(new Error('AccessDenied'), 'Something went wrong')).toBe(
      'Something went wrong',
    )
  })
})
