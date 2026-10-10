import * as editing from '@parallelworks/workflow-parser'
import { describe, expect, it } from 'vitest'
import type { GraphEdit } from '../editing'
import { resolveFormLayout } from '../form/layout'
import { dropLayoutEdits, inputLayout, resizeLayout, withInputLayouts } from './inputLayout'
import { asRecord, type Json } from './records'

const a = { type: 'field', field: 'a', css: 'color: #334455;' }
const b = { type: 'field', field: 'b' }
const c = { type: 'field', field: 'c' }
const form = (): Json => ({
  $meta: {
    labelPosition: 'top',
    layout: {
      type: 'section',
      label: 'Resources',
      css: 'padding: 1rem;',
      children: [{ type: 'grid', columns: { base: 1, sm: [2, 1] }, children: [a, b] }, c],
    },
  },
  a: { type: 'string' },
  b: { type: 'number' },
  c: { type: 'boolean' },
})
function apply(inputs: Json, edit: GraphEdit): Json {
  const result = editing.applyGraphEdit(
    { yml: editing.dumpYaml({ on: { execute: { inputs } } }), layout: undefined },
    edit,
  )
  return asRecord(editing.workflowInputsSchema(asRecord(editing.loadYaml(result.yml))))
}
function layout(inputs: Json) {
  return asRecord(inputs['$meta'])['layout']
}
function valid(inputs: Json) {
  expect(
    resolveFormLayout(
      layout(inputs),
      Object.keys(inputs).filter((name) => name !== '$meta'),
    ).issues,
  ).toEqual([])
}

describe('layout editing', () => {
  it('renames and deletes references without losing sections or appearance', () => {
    const inputs = form()
    const renamed = apply(
      inputs,
      withInputLayouts(editing, inputs, { type: 'updateInput', path: ['a'], name: 'queue' }),
    )
    valid(renamed)
    expect(JSON.stringify(layout(renamed))).toContain('"field":"queue"')
    expect(JSON.stringify(layout(renamed))).toContain('color: #334455;')
    const removed = apply(
      renamed,
      withInputLayouts(editing, renamed, { type: 'deleteInput', path: ['b'] }),
    )
    valid(removed)
    expect(asRecord(layout(removed))['label']).toBe('Resources')
  })
  it('duplicates beside the original reference and moves across groups', () => {
    const inputs = form()
    inputs['group'] = { type: 'group', items: { target: { type: 'string' } } }
    const duplicate = apply(
      inputs,
      withInputLayouts(editing, inputs, { type: 'duplicateInput', path: ['a'] }),
    )
    valid(duplicate)
    const move: GraphEdit = { type: 'moveInputs', paths: [['a']], parent: ['group'], index: 0 }
    const moved = apply(inputs, withInputLayouts(editing, inputs, move))
    valid(moved)
    const group = asRecord(asRecord(moved['group'])['items'])
    valid(group)
    expect(JSON.stringify(layout(group))).toContain('color: #334455;')
  })
  it('drops beside a field using responsive grid metadata', () => {
    const inputs = form()
    const move: GraphEdit = { type: 'moveInputs', paths: [['c']], parent: [], index: 1 }
    const edits = dropLayoutEdits(
      editing,
      inputs,
      [['c']],
      { parent: [], index: 1, beside: { path: ['a'], side: 'right' } },
      move,
    )
    const result = apply(inputs, { type: 'batch', edits: [move, ...edits] })
    valid(result)
    expect(asRecord(result['a'])['width']).toBeUndefined()
    expect(JSON.stringify(layout(result))).toContain('"sm":3')
    expect(asRecord(layout(result))['css']).toBe('padding: 1rem;')
  })
  it('resizes grid tracks while preserving mobile stacking and authored CSS', () => {
    const inputs = form()
    const edit = resizeLayout(editing, inputs, ['a'], ['b'], [50, 50])
    expect(edit).toBeDefined()
    if (!edit) return
    const result = apply(inputs, edit)
    valid(result)
    expect(JSON.stringify(layout(result))).toContain('"base":1')
    expect(JSON.stringify(layout(result))).toContain('"sm":[1.5,1.5]')
    expect(JSON.stringify(layout(result))).toContain('color: #334455;')
  })
  it('migrates old percent rows and anchored fields into grids and stacks', () => {
    const result = inputLayout({
      a: { type: 'string', width: '50%' },
      b: { type: 'string', 'anchor-below': true },
      c: { type: 'string', width: '50%' },
    })
    expect(resolveFormLayout(result, ['a', 'b', 'c']).issues).toEqual([])
    expect(result).toMatchObject({
      type: 'stack',
      children: [
        {
          type: 'grid',
          columns: { base: 1, sm: [50, 50] },
          children: [{ type: 'stack', children: [{ field: 'a' }, { field: 'b' }] }, { field: 'c' }],
        },
      ],
    })
  })
  it('repairs successive operations inside a single undoable batch', () => {
    const inputs = form()
    const result = apply(
      inputs,
      withInputLayouts(editing, inputs, {
        type: 'batch',
        edits: [
          { type: 'updateInput', path: ['a'], name: 'queue' },
          { type: 'deleteInput', path: ['b'] },
        ],
      }),
    )
    valid(result)
    expect(JSON.stringify(layout(result))).toContain('"field":"queue"')
  })
})
