import { describe, expect, it } from 'vitest'
import { dropWidths, evenWidth, type Line, snapSplit } from './inputRows'

// Only the rows' paths matter to the widths; where they're drawn is the DOM's business.
function line(...names: string[]): Line {
  return {
    parent: [],
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

const widths = (map: Map<string, string | undefined>) =>
  Object.fromEntries([...map].map(([rowKey, width]) => [JSON.parse(rowKey).join('.'), width]))

describe('evenWidth', () => {
  it('splits a line evenly in whole percents, and leaves an input alone on its line full width', () => {
    expect(evenWidth(1)).toBeUndefined()
    expect(evenWidth(2)).toBe('50%')
    expect(evenWidth(3)).toBe('33%')
    expect(evenWidth(4)).toBe('25%')
  })
})

describe('dropWidths', () => {
  it('shares the line of the input dropped beside, evenly', () => {
    const lines = [line('a'), line('b'), line('c')]
    const drop = { parent: [], index: 1, beside: { path: ['a'], side: 'right' as const } }
    expect(widths(dropWidths(lines, [['c']], drop))).toEqual({ a: '50%', c: '50%' })
  })

  it('puts the dropped inputs on the side they were dropped, among the line’s others', () => {
    const lines = [{ parent: [], rows: [...line('a', 'b').rows] }, line('c'), line('d')]
    const left = { parent: [], index: 1, beside: { path: ['b'], side: 'left' as const } }
    expect(widths(dropWidths(lines, [['c'], ['d']], left))).toEqual({
      a: '25%',
      b: '25%',
      c: '25%',
      d: '25%',
    })
  })

  it('gives the inputs left on a line its width again, the last one all of it', () => {
    const lines = [line('a', 'b', 'c'), line('d')]
    const down = { parent: [], index: 4 }
    expect(widths(dropWidths(lines, [['c']], down))).toEqual({ a: '50%', b: '50%', c: undefined })
    expect(widths(dropWidths(lines, [['b'], ['c']], down))).toEqual({
      a: undefined,
      b: undefined,
      c: undefined,
    })
  })

  it('leaves an input that was alone on its line its width when it moves between lines', () => {
    const lines = [line('a'), line('b'), line('c')]
    expect(widths(dropWidths(lines, [['a']], { parent: [], index: 3 }))).toEqual({})
  })

  it('reshares a line when one of its inputs moves along it', () => {
    const lines = [line('a', 'b', 'c')]
    const drop = { parent: [], index: 3, beside: { path: ['c'], side: 'right' as const } }
    expect(widths(dropWidths(lines, [['a']], drop))).toEqual({ a: '33%', b: '33%', c: '33%' })
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
