import type { GraphEdit, InputPath, WorkflowEditing } from '../editing'
import { type FormLayoutNode, resolveFormLayout, responsiveLayoutValues } from '../form/layout'
import { asRecord, type Json } from './records'

interface Drop {
  parent: InputPath
  index: number
  beside?: { path: InputPath; side: 'left' | 'right' }
  stack?: { path: InputPath; side: 'above' | 'below' }
}

type Node = FormLayoutNode
type Container = Exclude<Node, { type: 'field' }>
const namesIn = (list: Json) => Object.keys(list).filter((name) => !name.startsWith('$'))
const field = (name: string): Node => ({ type: 'field', field: name })
const stack = (children: Node[]): Container => ({ type: 'stack', children })
const same = (a: InputPath, b: InputPath) => JSON.stringify(a) === JSON.stringify(b)

export function layoutList(editing: WorkflowEditing, inputs: unknown, path: InputPath): Json {
  let list = asRecord(inputs)
  for (const name of path) {
    const definition = asRecord(list[name])
    list = asRecord(definition[editing.inputChildrenKey(definition['type']) ?? 'options'])
  }
  return list
}

export function inputLayout(list: Json): Node {
  const resolved = resolveFormLayout(asRecord(list['$meta'])['layout'], namesIn(list))
  if (resolved.layout) {
    const layout = structuredClone(resolved.layout)
    return resolved.remaining.length ? stack([layout, ...resolved.remaining.map(field)]) : layout
  }
  // Existing percent rows migrate once they are edited; subsequent edits use only the tree.
  const rows: Node[] = []
  let columns: Node[] = []
  let widths: number[] = []
  const flush = () => {
    if (columns.length)
      rows.push(
        columns.length === 1
          ? (columns[0] ?? stack([]))
          : {
              type: 'grid',
              columns: { base: 1, sm: widths },
              children: columns,
            },
      )
    columns = []
    widths = []
  }
  const hidden: Node[] = []
  for (const name of namesIn(list)) {
    const definition = asRecord(list[name])
    if (definition['hidden'] === true || definition['ignore'] === true) {
      hidden.push(field(name))
      continue
    }
    if (definition['anchor-below'] === true && columns.length) {
      const last = columns.at(-1)
      if (!last) continue
      if (last.type === 'stack') last.children.push(field(name))
      else columns[columns.length - 1] = stack([last, field(name)])
      continue
    }
    const raw = definition['width']
    const width =
      typeof raw === 'string' && /^(\d+(\.\d+)?)%$/.test(raw) ? Number.parseFloat(raw) : 100
    if (widths.reduce((a, b) => a + b, 0) + width > 100 || columns.length >= 12) flush()
    columns.push(field(name))
    widths.push(Math.max(1, width))
  }
  flush()
  return stack([...rows, ...hidden])
}

function trail(node: Node, name: string, parents: Container[] = []): Node[] | undefined {
  if (node.type === 'field') return node.field === name ? [...parents, node] : undefined
  for (const child of node.children) {
    const found = trail(child, name, [...parents, node])
    if (found) return found
  }
  return undefined
}

function remove(node: Node, names: Set<string>): Node | undefined {
  if (node.type === 'field') return names.has(node.field) ? undefined : node
  const previous = node.children
  const retained: number[] = []
  node.children = node.children.flatMap((child, index) => {
    const kept = remove(child, names)
    if (kept) retained.push(index)
    return kept ? [kept] : []
  })
  if (node.type === 'grid' && previous.length !== node.children.length && node.children.length) {
    const resize = (tracks: number | number[]) => {
      const count = Array.isArray(tracks) ? tracks.length : tracks
      return count === previous.length
        ? Array.isArray(tracks)
          ? retained.map((index) => tracks[index] ?? 1)
          : node.children.length
        : tracks
    }
    node.columns =
      typeof node.columns === 'object' && !Array.isArray(node.columns)
        ? Object.fromEntries(
            Object.entries(node.columns).map(([key, tracks]) => [key, resize(tracks)]),
          )
        : resize(node.columns)
  }
  return node.children.length || node.type === 'section' || node.css ? node : undefined
}

function insert(
  root: Node,
  nodes: Node[],
  anchor: string | undefined,
  side: 'above' | 'below' | 'left' | 'right',
): Node {
  const path = anchor ? trail(root, anchor) : undefined
  if (!path)
    return root.type === 'stack'
      ? { ...root, children: [...root.children, ...nodes] }
      : stack([root, ...nodes])
  const beside = side === 'left' || side === 'right'
  let target = path.at(-1)
  if (!target) return stack(nodes)
  let parent = path.at(-2) as Container | undefined
  if (beside) {
    for (let i = path.length - 2; i >= 0; i--) {
      const candidate = path[i]
      if (!candidate) continue
      if (
        candidate.type === 'grid' &&
        candidate.align !== 'rows' &&
        candidate.children.length + nodes.length <= 12
      ) {
        parent = candidate
        target = path[i + 1] ?? target
        break
      }
    }
  }
  const before = side === 'above' || side === 'left'
  if (
    parent &&
    ((beside &&
      parent.type === 'grid' &&
      parent.align !== 'rows' &&
      parent.children.length + nodes.length <= 12) ||
      (!beside && parent.type === 'stack'))
  ) {
    const index = parent.children.indexOf(target) + (before ? 0 : 1)
    parent.children.splice(index, 0, ...nodes)
    if (parent.type === 'grid') parent.columns = { base: 1, sm: parent.children.length }
    return root
  }
  const children = before ? [...nodes, target] : [target, ...nodes]
  const replacement: Node = beside
    ? { type: 'grid', columns: { base: 1, sm: Math.min(12, children.length) }, children }
    : stack(children)
  if (!parent) return replacement
  parent.children[parent.children.indexOf(target)] = replacement
  return root
}

export function layoutEdit(
  editing: WorkflowEditing,
  inputs: unknown,
  parent: InputPath,
  layout: Node | undefined,
): GraphEdit {
  const list = layoutList(editing, inputs, parent)
  if (!parent.length)
    return {
      type: 'updateWorkflow',
      inputsMeta: layout ? { set: { layout }, unset: ['wizard'] } : { unset: ['layout'] },
    }
  const definition = asRecord(layoutList(editing, inputs, parent.slice(0, -1))[parent.at(-1) ?? ''])
  const { layout: _layout, ...meta } = asRecord(list['$meta'])
  if (layout) delete meta['wizard']
  return {
    type: 'updateInput',
    path: parent,
    set: {
      [editing.inputChildrenKey(definition['type']) ?? 'options']: {
        ...list,
        $meta: { ...meta, ...(layout ? { layout } : {}) },
      },
    },
  }
}

function inputsAfter(editing: WorkflowEditing, inputs: unknown, edit: GraphEdit): Json {
  const source = editing.dumpYaml({ on: { execute: { inputs } }, jobs: {} })
  const result = editing.applyGraphEdit({ yml: source, layout: undefined }, edit)
  return asRecord(
    asRecord(asRecord(asRecord(editing.loadYaml(result.yml))['on'])['execute'])['inputs'],
  )
}

export function dropLayoutEdits(
  editing: WorkflowEditing,
  inputs: unknown,
  moving: InputPath[],
  drop: Drop,
  move: GraphEdit,
): GraphEdit[] {
  const after = inputsAfter(editing, inputs, move)
  const destination = layoutList(editing, inputs, drop.parent)
  const names = moving.map((path) => path.at(-1) ?? '')
  const nodes = moving.map((path) => {
    const root = inputLayout(layoutList(editing, inputs, path.slice(0, -1)))
    return trail(root, path.at(-1) ?? '')?.at(-1) ?? field(path.at(-1) ?? '')
  })
  const parents = [
    ...new Map(
      moving.map((path) => [JSON.stringify(path.slice(0, -1)), path.slice(0, -1)]),
    ).values(),
  ]
  const edits: GraphEdit[] = []
  for (const parent of parents.filter((parent) => !same(parent, drop.parent))) {
    const list = layoutList(editing, inputs, parent)
    if (asRecord(list['$meta'])['layout'] !== undefined) {
      edits.push(
        layoutEdit(
          editing,
          after,
          parent,
          remove(
            inputLayout(list),
            new Set(
              moving
                .filter((path) => same(path.slice(0, -1), parent))
                .map((path) => path.at(-1) ?? ''),
            ),
          ) ?? stack([]),
        ),
      )
    }
  }
  const root = remove(inputLayout(destination), new Set(names)) ?? stack([])
  const anchor =
    drop.beside?.path.at(-1) ??
    drop.stack?.path.at(-1) ??
    namesIn(destination)
      .slice(drop.index)
      .find((name) => !names.includes(name))
  const layout = insert(root, nodes, anchor, drop.beside?.side ?? drop.stack?.side ?? 'above')
  edits.push(layoutEdit(editing, after, drop.parent, layout))
  return edits
}

export function resizeLayout(
  editing: WorkflowEditing,
  inputs: unknown,
  left: InputPath,
  right: InputPath,
  split: [number, number],
): GraphEdit | undefined {
  const parent = left.slice(0, -1)
  const layout = inputLayout(layoutList(editing, inputs, parent))
  const a = trail(layout, left.at(-1) ?? '')
  const b = trail(layout, right.at(-1) ?? '')
  if (!a || !b) return undefined
  const grid = [...a].reverse().find((node) => node.type === 'grid' && b.includes(node))
  if (grid?.type !== 'grid') return undefined
  const i = grid.children.indexOf(a[a.indexOf(grid) + 1] ?? grid)
  const j = grid.children.indexOf(b[b.indexOf(grid) + 1] ?? grid)
  if (i === j || i < 0 || j < 0) return undefined
  const responsive = responsiveLayoutValues(grid.columns, 1)
  grid.columns = Object.fromEntries(
    Object.entries(responsive).map(([breakpoint, tracks]) => {
      const count = Array.isArray(tracks) ? tracks.length : tracks
      if (count !== grid.children.length) return [breakpoint, tracks]
      const weights = Array.isArray(tracks) ? [...tracks] : Array.from({ length: count }, () => 1)
      const total = (weights[i] ?? 1) + (weights[j] ?? 1)
      const shares = split[0] + split[1]
      weights[i] = (total * split[0]) / shares
      weights[j] = (total * split[1]) / shares
      return [breakpoint, weights]
    }),
  )
  return layoutEdit(editing, inputs, parent, layout)
}

/** Keeps layouts valid even with hosts whose editing engine predates layout metadata. */
function inputLayouts(editing: WorkflowEditing, inputs: unknown, edit: GraphEdit): GraphEdit {
  if (edit.type === 'batch') {
    let current = inputs
    const edits = edit.edits.map((item) => {
      const next = withInputLayouts(editing, current, item)
      current = inputsAfter(editing, current, next)
      return next
    })
    return { type: 'batch', edits }
  }
  if (edit.type === 'moveInputs') {
    const relevant = [...edit.paths.map((path) => path.slice(0, -1)), edit.parent].some(
      (parent) => asRecord(layoutList(editing, inputs, parent)['$meta'])['layout'] !== undefined,
    )
    return relevant
      ? {
          type: 'batch',
          edits: [
            edit,
            ...dropLayoutEdits(
              editing,
              inputs,
              edit.paths,
              { parent: edit.parent, index: edit.index },
              edit,
            ),
          ],
        }
      : edit
  }
  if (edit.type !== 'updateInput' && edit.type !== 'deleteInput' && edit.type !== 'duplicateInput')
    return edit
  if (edit.type === 'updateInput' && (!edit.name || edit.name === edit.path.at(-1))) return edit
  const parent = edit.path.slice(0, -1)
  const list = layoutList(editing, inputs, parent)
  const layout = resolveFormLayout(asRecord(list['$meta'])['layout'], namesIn(list)).layout
  if (!layout) return edit
  const after = inputsAfter(editing, inputs, edit)
  let updated = structuredClone(layout)
  const name = edit.path.at(-1) ?? ''
  if (edit.type === 'deleteInput') updated = remove(updated, new Set([name])) ?? stack([])
  else if (edit.type === 'updateInput') {
    const node = trail(updated, name)?.at(-1)
    if (node?.type === 'field') node.field = edit.name ?? name
  } else {
    const added = namesIn(layoutList(editing, after, parent)).find(
      (key) => !Object.hasOwn(list, key),
    )
    if (added) {
      const original = trail(updated, name)?.at(-1)
      updated = insert(
        updated,
        [{ ...(original?.type === 'field' ? original : {}), type: 'field', field: added }],
        name,
        'below',
      )
    }
  }
  return { type: 'batch', edits: [edit, layoutEdit(editing, after, parent, updated)] }
}

export function withInputLayouts(
  editing: WorkflowEditing,
  inputs: unknown,
  edit: GraphEdit,
): GraphEdit {
  try {
    return inputLayouts(editing, inputs, edit)
  } catch {
    return edit
  }
}
