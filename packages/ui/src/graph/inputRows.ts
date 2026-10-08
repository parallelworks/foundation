import type { InputPath } from '../editing'

/** One input's row as drawn, with its place among its list's inputs. */
export interface DrawnRow {
  path: InputPath
  index: number
  rect: DOMRect
  el: HTMLElement
  hidden: boolean
  /** A hidden input a list with widths draws after the inputs the form shows. */
  trailing: boolean
}

/** Inputs drawn one under another: an input and those `anchor-below` it, top to bottom. */
export interface Column {
  rows: DrawnRow[]
  /** The cell a list with widths draws the column in. */
  cell: HTMLElement | null
}

/** The columns of one list drawn side by side on one line of the form, left to right. */
export interface Line {
  parent: InputPath
  columns: Column[]
}

/** Where dragged inputs land: before `index` of `parent`, as a column beside one, or in one. */
export interface Drop {
  parent: InputPath
  index: number
  beside?: { path: InputPath; side: 'left' | 'right' }
  stack?: { path: InputPath; side: 'above' | 'below' }
}

/** What a drop writes on an input; null removes the key. */
export interface Change {
  width?: unknown
  'anchor-below'?: true | null
}

const key = (path: InputPath) => JSON.stringify(path)

const samePath = (a: InputPath, b: InputPath) =>
  a.length === b.length && a.every((name, i) => b[i] === name)

export const rowsOf = (line: Line) => line.columns.flatMap((column) => column.rows)

const topOf = (column: Column) => Math.min(...column.rows.map((row) => row.rect.top))
const leftOf = (column: Column) => Math.min(...column.rows.map((row) => row.rect.left))

/** The form's lines: a column is the rows one cell draws, and columns at one height share a line. */
export function linesIn(root: HTMLElement): Line[] {
  const columns = new Map<HTMLElement, { parent: InputPath; column: Column }>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-input-path]')) {
    const path = JSON.parse(el.dataset['inputPath'] ?? '[]') as InputPath
    // An input narrower than its column sits in a wrapper of its own width inside the cell.
    const holder =
      el.parentElement?.dataset['inputMember'] !== undefined
        ? el.parentElement.parentElement
        : el.parentElement
    const cell = holder?.dataset['inputCell'] !== undefined ? holder : null
    const owner = cell ?? el
    const entry = columns.get(owner) ?? { parent: path.slice(0, -1), column: { rows: [], cell } }
    columns.set(owner, entry)
    entry.column.rows.push({
      path,
      index: Number(el.dataset['inputIndex'] ?? 0),
      rect: el.getBoundingClientRect(),
      el,
      hidden: el.dataset['inputHidden'] !== undefined,
      trailing: false,
    })
  }
  const lines: Line[] = []
  for (const { parent, column } of columns.values()) {
    column.rows.sort((a, b) => a.rect.top - b.rect.top)
    if (column.cell && column.rows.every((row) => row.hidden)) {
      for (const row of column.rows) {
        row.trailing = true
      }
    }
    const top = topOf(column)
    const line = lines.find(
      (other) =>
        samePath(other.parent, parent) && Math.abs(topOf(other.columns[0] as Column) - top) < 1,
    )
    if (line) {
      line.columns.push(column)
    } else {
      lines.push({ parent, columns: [column] })
    }
  }
  for (const line of lines) {
    line.columns.sort((a, b) => leftOf(a) - leftOf(b))
  }
  return lines
}

/** The width each of `count` columns sharing a line gets; none for a column alone on its line. */
export function evenWidth(count: number): string | undefined {
  return count > 1 ? `${Math.floor(100 / count)}%` : undefined
}

/** What a drop writes on each input it touches, by row key: columns sharing a line split it evenly,
 * a column's next input takes a leaving head's place and width, and an input that was alone keeps its own. */
export function dropChanges(
  lines: Line[],
  moving: InputPath[],
  drop: Drop,
  widthOf: (path: InputPath) => unknown,
): Map<string, Change> {
  const movingKeys = new Set(moving.map(key))
  const stays = (row: DrawnRow) => !movingKeys.has(key(row.path))
  const changes = new Map<string, Change>()
  const set = (path: InputPath, change: Change) =>
    changes.set(key(path), { ...changes.get(key(path)), ...change })
  const widthNow = (path: InputPath) => {
    const change = changes.get(key(path))
    return change && 'width' in change ? change.width : widthOf(path)
  }
  // Leaving: a column whose head goes is headed by its next input at the head's width, and a line
  // that loses a column is shared again by those left.
  const shared = new Set<string>()
  for (const line of lines) {
    if (rowsOf(line).every(stays)) {
      continue
    }
    for (const column of line.columns) {
      const [head] = column.rows
      if (!head || column.rows.every(stays)) {
        continue
      }
      if (line.columns.length > 1 || column.rows.length > 1) {
        for (const row of column.rows.filter((row) => !stays(row))) {
          shared.add(key(row.path))
        }
      }
      const next = column.rows.find(stays)
      if (!stays(head) && next) {
        set(next.path, { 'anchor-below': null, width: widthOf(head.path) ?? null })
      }
    }
    const kept = line.columns.filter((column) => column.rows.some(stays))
    if (kept.length < line.columns.length) {
      for (const column of kept) {
        const head = column.rows.find(stays)
        if (head) {
          set(head.path, { width: evenWidth(kept.length) ?? null })
        }
      }
    }
  }
  const holding = (path: InputPath) => {
    for (const line of lines) {
      for (const column of line.columns) {
        if (column.rows.some((row) => samePath(row.path, path))) {
          return { line, column }
        }
      }
    }
    return null
  }
  // Beside a column, the dropped inputs are columns sharing its line evenly with the others.
  const beside = drop.beside && holding(drop.beside.path)
  if (beside) {
    const kept = beside.line.columns.filter((column) => column.rows.some(stays))
    const count = kept.length + moving.length
    for (const column of kept) {
      const head = column.rows.find(stays)
      if (head) {
        set(head.path, { width: evenWidth(count) ?? null })
      }
    }
    for (const path of moving) {
      set(path, { width: evenWidth(count) ?? null, 'anchor-below': null })
    }
    return changes
  }
  const stack = drop.stack
  const into = stack && holding(stack.path)
  if (stack && into) {
    const head = into.column.rows.find(stays)
    const [first, ...rest] = moving
    // Above a column's head, the first dropped input heads the column in its place.
    if (stack.side === 'above' && head && first && samePath(head.path, stack.path)) {
      set(first, { width: widthNow(head.path) ?? null, 'anchor-below': null })
      for (const path of [head.path, ...rest]) {
        set(path, { width: null, 'anchor-below': true })
      }
      return changes
    }
    for (const path of moving) {
      set(path, { width: null, 'anchor-below': true })
    }
    return changes
  }
  for (const path of moving) {
    set(path, { 'anchor-below': null, ...(shared.has(key(path)) ? { width: null } : {}) })
  }
  return changes
}

/** Neighbours on one line, split at `pointer` (a percent of their list's width), in 5% steps. */
export function snapSplit(total: number, pointer: number): [left: number, right: number] {
  const floor = Math.min(10, total / 2)
  const left = Math.min(Math.max(Math.round(pointer / 5) * 5, floor), total - floor)
  return [left, total - left]
}
