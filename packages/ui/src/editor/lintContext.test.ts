import { describe, expect, it, vi } from 'vitest'
import { lintContext } from './lintContext'

describe('lintContext', () => {
  it('fetches each uses target and the secret names once, then hands them over', async () => {
    const source = `jobs:
  a:
    steps:
      - uses: workflow/child
      - uses: parallelworks/checkout
      - uses: marketplace/other
      - uses: marketplace/other
        with:
          $yaml: elsewhere.yaml
`
    const resolve = vi.fn(async () => ({
      on: { execute: { inputs: { color: { type: 'string' } } } },
    }))
    const secrets = vi.fn(async () => ['token'])
    const onMore = vi.fn()
    expect(lintContext(source, { resolve, secrets }, onMore)).toEqual({
      usesInputs: {},
    })
    await vi.waitFor(() => expect(onMore).toHaveBeenCalledTimes(2))
    // The target two steps read from different files isn't fetched at all.
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith({ kind: 'workflow', name: 'child' })
    expect(lintContext(source, { resolve, secrets }, onMore)).toEqual({
      usesInputs: { 'workflow/child': { color: { type: 'string' } } },
      secretVars: ['token'],
    })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(secrets).toHaveBeenCalledTimes(1)
  })
})
