import { describe, expect, it } from 'vitest'
import {
  type Column,
  dropChanges,
  evenWidth,
  type Line,
  reorderChanges,
  snapSplit,
} from './inputRows'

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
  fields: Record<string, { width?: unknown; under?: unknown }> = {},
) =>
  Object.fromEntries(
    [
      ...dropChanges(
        lines,
        moving.map((name) => [name]),
        drop,
        (path) => fields[path.join('.')] ?? {},
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
      c: { width: '50%', under: null },
    })
  })

  it('gives the columns left on a line its width again, the last one all of it', () => {
    const lines = [one('a', 'b', 'c'), one('d')]
    const down = { parent: [], index: 4 }
    expect(changes(lines, ['c'], down)).toEqual({
      a: { width: '50%' },
      b: { width: '50%' },
      c: { under: null, width: null },
    })
  })

  it('leaves an input that was alone on its line its width when it moves between lines', () => {
    const lines = [one('a'), one('b'), one('c')]
    expect(changes(lines, ['a'], { parent: [], index: 3 })).toEqual({ a: { under: null } })
  })

  it('stacks an input dropped below one in a column under it', () => {
    const lines = [one('a', 'b', 'c')]
    const drop = { parent: [], index: 2, stack: { path: ['b'], side: 'below' as const } }
    expect(changes(lines, ['c'], drop)).toEqual({
      a: { width: '50%' },
      b: { width: '50%' },
      c: { width: null, under: 'b' },
    })
  })

  it('heads a column with an input dropped above its head, at the head’s width', () => {
    const lines = [line(column('a'), column('b', 'c')), one('d')]
    const drop = { parent: [], index: 1, stack: { path: ['b'], side: 'above' as const } }
    const fields = { a: { width: '50%' }, b: { width: '50%' }, c: { under: 'b' } }
    expect(changes(lines, ['d'], drop, fields)).toEqual({
      d: { width: '50%', under: null },
      b: { width: null, under: 'd' },
    })
  })

  it('moves the next input up to head a column its head leaves, at the head’s width', () => {
    const lines = [line(column('a'), column('b', 'c'))]
    const fields = { a: { width: '50%' }, b: { width: '50%' }, c: { under: 'b' } }
    expect(changes(lines, ['b'], { parent: [], index: 3 }, fields)).toEqual({
      c: { under: null, width: '50%' },
      b: { under: null, width: null },
    })
  })

  it('puts the rest of a column under its new head when the head leaves', () => {
    const lines = [line(column('a'), column('b', 'c', 'd'))]
    const fields = {
      a: { width: '50%' },
      b: { width: '50%' },
      c: { under: 'b' },
      d: { under: 'b' },
    }
    expect(changes(lines, ['b'], { parent: [], index: 4 }, fields)).toEqual({
      c: { under: null, width: '50%' },
      d: { under: 'c' },
      b: { under: null, width: null },
    })
  })

  it('puts an input under its column’s head when the one it was under leaves', () => {
    const lines = [line(column('a'), column('b', 'c', 'd'))]
    const fields = {
      a: { width: '50%' },
      b: { width: '50%' },
      c: { under: 'b' },
      d: { under: 'c' },
    }
    expect(changes(lines, ['c'], { parent: [], index: 4 }, fields)).toEqual({
      d: { under: 'b' },
      c: { under: null, width: null },
    })
  })
})

describe('reorderChanges', () => {
  const reorder = (
    names: string[],
    after: string[],
    fields: Record<string, { width?: unknown; under?: unknown }>,
  ) => Object.fromEntries(reorderChanges(names, after, (name) => fields[name] ?? {}))

  it('heads a column with an input moved above its head, at the column’s width', () => {
    const fields = { a: { width: '50%' }, b: { width: '50%' }, c: { under: 'b' } }
    expect(reorder(['a', 'b', 'c'], ['a', 'c', 'b'], fields)).toEqual({
      c: { under: null, width: '50%' },
      b: { under: 'c', width: null },
    })
  })

  it('moves a whole column when its head moves past another one', () => {
    const fields = { a: { width: '50%' }, b: { width: '50%' }, c: { under: 'b' } }
    expect(reorder(['a', 'b', 'c'], ['b', 'c', 'a'], fields)).toEqual({})
  })

  it('keeps an input under its head when it passes another input of its column', () => {
    const fields = { b: { width: '50%' }, c: { under: 'b' }, d: { under: 'c' } }
    expect(reorder(['b', 'c', 'd'], ['b', 'd', 'c'], fields)).toEqual({ d: { under: 'b' } })
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
