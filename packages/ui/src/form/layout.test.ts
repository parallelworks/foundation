import { describe, expect, it } from 'vitest'
import { layoutLimits, resolveFormLayout } from './layout'

describe('form layout references', () => {
  it('keeps unplaced fields in schema order without treating layout containers as values', () => {
    const layout = {
      type: 'grid',
      columns: { base: 1, md: [2, 1] },
      children: [
        { type: 'field', field: 'name' },
        { type: 'section', label: 'Settings', children: [{ type: 'field', field: 'size' }] },
      ],
    }
    expect(resolveFormLayout(layout, ['name', 'note', 'size', 'region'])).toEqual({
      layout,
      remaining: ['note', 'region'],
      issues: [],
    })
  })

  it.each([
    [{ type: 'field', field: 'missing' }, 'unknown_field'],
    [{ type: 'field', field: 'group.child' }, 'invalid_node'],
    [{ type: 'grid', columns: 0, children: [] }, 'invalid_node'],
    [{ type: 'grid', columns: [1, -1], children: [] }, 'invalid_node'],
    [{ type: 'grid', columns: { phone: 2 }, children: [] }, 'invalid_node'],
    [{ type: 'section', children: [] }, 'invalid_node'],
    [
      { type: 'grid', columns: 2, align: 'rows', children: [{ type: 'field', field: 'name' }] },
      'invalid_node',
    ],
    [{ type: 'grid', columns: 2, align: 'center', children: [] }, 'invalid_node'],
    [{ type: 'field', field: 'name', css: 12 }, 'invalid_node'],
    [{ type: 'field', field: 'name', span: 13 }, 'invalid_node'],
    [{ type: 'field', field: 'name', style: 'color:red' }, 'invalid_node'],
    [{ type: 'stack', children: [], gap: { toString: 0 } }, 'invalid_node'],
    [{ type: 'section', label: 'x'.repeat(257), children: [] }, 'invalid_node'],
    [
      { type: 'section', label: 'Name', description: 'x'.repeat(4097), children: [] },
      'invalid_node',
    ],
    [{ type: 'field', field: 'x'.repeat(257) }, 'invalid_node'],
  ])('falls back to every field when the layout is invalid: %j', (layout, code) => {
    const result = resolveFormLayout(layout, ['name', 'size'])
    expect(result.layout).toBeUndefined()
    expect(result.remaining).toEqual(['name', 'size'])
    expect(result.issues).toEqual([{ path: [], code }])
  })

  it('reports duplicate bindings across containers at the second reference', () => {
    const result = resolveFormLayout(
      {
        type: 'stack',
        children: [
          { type: 'field', field: 'name' },
          { type: 'stack', children: [{ type: 'field', field: 'name' }] },
        ],
      },
      ['name'],
    )
    expect(result.issues).toEqual([
      { path: ['children', 1, 'children', 0], code: 'duplicate_field' },
    ])
    expect(result.layout).toBeUndefined()
  })

  it('does not recurse forever through a host-provided cyclic layout', () => {
    const layout: { type: string; children: unknown[] } = { type: 'stack', children: [] }
    layout.children.push(layout)
    expect(resolveFormLayout(layout, ['name']).issues[0]?.code).toBe('invalid_node')
  })

  it('bounds breadth, total traversal, aggregate CSS, and depth before rendering', () => {
    const empty = { type: 'stack', children: [] }
    const cases: unknown[] = [
      { type: 'stack', children: Array.from({ length: 129 }, () => empty) },
      {
        type: 'stack',
        children: Array.from({ length: 8 }, () => ({
          type: 'stack',
          children: Array.from({ length: 127 }, () => empty),
        })),
      },
      {
        type: 'stack',
        children: Array.from({ length: 17 }, () => ({ ...empty, css: ' '.repeat(4096) })),
      },
    ]
    let deep: unknown = empty
    for (let i = 0; i <= layoutLimits.depth; i++) deep = { type: 'stack', children: [deep] }
    cases.push(deep)
    // Aliases can multiply traversal without a cycle or a large serialized input.
    let aliases: unknown = empty
    for (let i = 0; i < 16; i++) aliases = { type: 'stack', children: [aliases, aliases] }
    cases.push(aliases)
    for (const value of cases) {
      const result = resolveFormLayout(value, ['name'])
      expect(result.layout).toBeUndefined()
      expect(result.remaining).toEqual(['name'])
      expect(result.issues.length).toBeLessThanOrEqual(layoutLimits.nodes)
    }
    expect(
      resolveFormLayout({ type: 'stack', children: Array.from({ length: 128 }, () => empty) }, [])
        .layout,
    ).toBeDefined()
    expect(
      resolveFormLayout(
        {
          type: 'stack',
          children: Array.from({ length: 16 }, () => ({ ...empty, css: ' '.repeat(4096) })),
        },
        [],
      ).layout,
    ).toBeDefined()
  })
})
