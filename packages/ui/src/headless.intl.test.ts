// A JS engine such as Hermes has no Intl.PluralRules and others below, so neither headless entry
// may construct one while it loads; formatting with one is still up to the host's engine.
const MISSING = [
  'PluralRules',
  'RelativeTimeFormat',
  'ListFormat',
  'Segmenter',
  'DisplayNames',
] as const

describe('headless entries', () => {
  const intl = Intl as unknown as Partial<Record<(typeof MISSING)[number], unknown>>
  const saved = new Map(MISSING.map((name) => [name, Object.getOwnPropertyDescriptor(intl, name)]))

  beforeEach(() => {
    for (const name of MISSING) {
      delete intl[name]
    }
  })

  afterEach(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) {
        Object.defineProperty(intl, name, descriptor)
      }
    }
  })

  it('import on an engine without the newer Intl constructors', async () => {
    expect(intl.PluralRules).toBeUndefined()
    vi.resetModules()
    await expect(import('./headless')).resolves.toHaveProperty('formatBytes')
    await expect(import('./ai/headless')).resolves.toHaveProperty('defaultToolStrings')
  })
})
