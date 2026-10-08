import { describe, expect, it } from 'vitest'
import { type Column, dropChanges, evenWidth, type Line, snapSplit } from './inputRows'

// Only the rows' paths matter to the changes; where they're drawn is the DOM's business.
function column(...names: string[]): Column {
  return {
    cell: null,
    rows: names.map((name, index) => ({
      path: [name],
      index,
      rect: {} as DOMRect,
      el: {} as HTMLElement,
      hidden: false,
      trailing: false,
    })),
  }
}
const line = (...columns: Column[]): Line => ({ parent: [], columns })
const one = (...names: string[]) => line(...names.map((name) => column(name)))

const changes = (
  lines: Line[],
  moving: string[],
  drop: Parameters<typeof dropChanges>[2],
  widths: Record<string, unknown> = {},
) =>
  Object.fromEntries(
    [
      ...dropChanges(
        lines,
        moving.map((name) => [name]),
        drop,
        (path) => widths[path.join('.')],
      ),
    ].map(([rowKey, change]) => [JSON.parse(rowKey).join('.'), change]),
  )

describe('evenWidth', () => {
  it('splits a line evenly in whole percents, and leaves a column alone on its line full width', () => {
    expect(evenWidth(1)).toBeUndefined()
    expect(evenWidth(2)).toBe('50%')
    expect(evenWidth(3)).toBe('33%')
    expect(evenWidth(4)).toBe('25%')
  })
})

describe('dropChanges', () => {
  it('shares the line of the column dropped beside, evenly', () => {
    const lines = [one('a'), one('b'), one('c')]
    const drop = { parent: [], index: 1, beside: { path: ['a'], side: 'right' as const } }
    expect(changes(lines, ['c'], drop)).toEqual({
      a: { width: '50%' },
      c: { width: '50%', 'anchor-below': null },
    })
  })

  it('gives the columns left on a line its width again, the last one all of it', () => {
    const lines = [one('a', 'b', 'c'), one('d')]
    const down = { parent: [], index: 4 }
    expect(changes(lines, ['c'], down)).toEqual({
      a: { width: '50%' },
      b: { width: '50%' },
      c: { 'anchor-below': null, width: null },
    })
  })

  it('leaves an input that was alone on its line its width when it moves between lines', () => {
    const lines = [one('a'), one('b'), one('c')]
    expect(changes(lines, ['a'], { parent: [], index: 3 })).toEqual({ a: { 'anchor-below': null } })
  })

  it('stacks an input dropped below one in a column under it', () => {
    const lines = [one('a', 'b', 'c')]
    const drop = { parent: [], index: 2, stack: { path: ['b'], side: 'below' as const } }
    expect(changes(lines, ['c'], drop)).toEqual({
      a: { width: '50%' },
      b: { width: '50%' },
      c: { width: null, 'anchor-below': true },
    })
  })

  it('heads a column with an input dropped above its head, at the head’s width', () => {
    const lines = [line(column('a'), column('b', 'c')), one('d')]
    const drop = { parent: [], index: 1, stack: { path: ['b'], side: 'above' as const } }
    expect(changes(lines, ['d'], drop, { a: '50%', b: '50%' })).toEqual({
      d: { width: '50%', 'anchor-below': null },
      b: { width: null, 'anchor-below': true },
    })
  })

  it('moves the next input up to head a column its head leaves, at the head’s width', () => {
    const lines = [line(column('a'), column('b', 'c'))]
    expect(changes(lines, ['b'], { parent: [], index: 3 }, { a: '50%', b: '50%' })).toEqual({
      c: { 'anchor-below': null, width: '50%' },
      b: { 'anchor-below': null, width: null },
    })
  })
})

describe('snapSplit', () => {
  it('splits at the pointer in 5% steps, keeping each side at least 10%', () => {
    expect(snapSplit(100, 37)).toEqual([35, 65])
    expect(snapSplit(100, 3)).toEqual([10, 90])
    expect(snapSplit(100, 99)).toEqual([90, 10])
    expect(snapSplit(66, 40)).toEqual([40, 26])
  })
})
