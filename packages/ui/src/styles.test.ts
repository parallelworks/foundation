import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sheets = (readdirSync(import.meta.dirname, { recursive: true }) as string[])
  .filter((file) => file.endsWith('.css'))
  .map((file) => [file, readFileSync(join(import.meta.dirname, file), 'utf8')] as const)

describe('package styles', () => {
  // A rule that selects an element by its inline style and reaches past it makes the browser restyle
  // the whole subtree of any element whose inline style changes, on every page that loads the styles:
  // a graph's pan and zoom, which set a transform on every frame, then restyle everything they move.
  it.each(sheets)(
    'select nothing beyond an element matched by its style attribute: %s',
    (_, css) => {
      const selectors = css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('{')
        .flatMap((before) => (before.split(/[;}]/).at(-1) ?? '').split(','))
      const beyond = selectors.filter((selector) => {
        const at = selector.indexOf('[style')
        // What follows the compound the attribute is part of, past the next combinator.
        return (
          at >= 0 &&
          selector
            .slice(selector.indexOf(']', at) + 1)
            .replace(/^[^\s>+~]*/, '')
            .trim()
        )
      })
      expect(beyond).toEqual([])
    },
  )
})

const sources = (readdirSync(import.meta.dirname, { recursive: true }) as string[])
  .filter((file) => /\.(css|tsx?)$/.test(file))
  .map((file) => [file, readFileSync(join(import.meta.dirname, file), 'utf8')] as const)

describe('package names', () => {
  // The package themes through its own --theme-* tokens; a host design system's prefixed classes or
  // variables would only work inside that host.
  it('use no design-system prefixed class or variable', () => {
    const found = sources.flatMap(([file, source]) =>
      (source.match(/(?<![\w-])(?:--|\.)?ds-[a-z][\w-]*/g) ?? []).map((name) => `${file}: ${name}`),
    )
    expect(found).toEqual([])
  })
})
