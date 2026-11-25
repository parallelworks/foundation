import { describe, expect, it } from 'vitest'
import { splitLinks } from './links'

describe('splitLinks', () => {
  it('leaves text without a URL whole', () => {
    expect(splitLinks('no links here')).toEqual(['no links here'])
    expect(splitLinks('')).toEqual([])
  })

  it('splits out each http and https URL', () => {
    expect(splitLinks('see https://example.com/a?b=1#c and http://example.org')).toEqual([
      'see ',
      { url: 'https://example.com/a?b=1#c' },
      ' and ',
      { url: 'http://example.org' },
    ])
    expect(splitLinks('HTTPS://EXAMPLE.COM')).toEqual([{ url: 'HTTPS://EXAMPLE.COM' }])
  })

  it('ends a URL before the punctuation of the sentence around it', () => {
    expect(splitLinks('Is it https://example.com/a?')).toEqual([
      'Is it ',
      { url: 'https://example.com/a' },
      '?',
    ])
    expect(splitLinks('"https://example.com/a", then')).toEqual([
      '"',
      { url: 'https://example.com/a' },
      '", then',
    ])
    expect(splitLinks('(see https://example.com/a).')).toEqual([
      '(see ',
      { url: 'https://example.com/a' },
      ').',
    ])
    expect(splitLinks('<https://example.com/a>')).toEqual([
      '<',
      { url: 'https://example.com/a' },
      '>',
    ])
  })

  it('keeps a closing bracket the URL opened', () => {
    expect(splitLinks('https://example.com/wiki/A_(b)')).toEqual([
      { url: 'https://example.com/wiki/A_(b)' },
    ])
  })

  it('needs more than a scheme, and a scheme of its own', () => {
    expect(splitLinks('https:// alone')).toEqual(['https:// alone'])
    expect(splitLinks('xhttps://example.com')).toEqual(['xhttps://example.com'])
    expect(splitLinks('javascript:alert(1)')).toEqual(['javascript:alert(1)'])
  })

  it('keeps the newlines around a URL in the text', () => {
    expect(splitLinks('one:\nhttps://example.com\n\ntwo')).toEqual([
      'one:\n',
      { url: 'https://example.com' },
      '\n\ntwo',
    ])
  })
})
