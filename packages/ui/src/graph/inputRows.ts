import type { InputPath } from '../editing'

/** One input's row as drawn, with its place among its list's inputs. */
export interface DrawnRow {
  path: InputPath
  index: number
  rect: DOMRect
  el: HTMLElement
}

/** The inputs of one list drawn side by side on one line of the form, left to right. */
export interface Line {
  parent: InputPath
  rows: DrawnRow[]
}

/** Where dragged inputs land: before `index` of `parent`, and beside an input when they share its line. */
export interface Drop {
  parent: InputPath
  index: number
  beside?: { path: InputPath; side: 'left' | 'right' }
}

const key = (path: InputPath) => JSON.stringify(path)

const samePath = (a: InputPath, b: InputPath) =>
  a.length === b.length && a.every((name, i) => b[i] === name)

/** The form's lines: rows of one list drawn at the same height share a line. */
export function linesIn(root: HTMLElement): Line[] {
  const lines: Line[] = []
  for (const el of root.querySelectorAll<HTMLElement>('[data-input-path]')) {
    const path = JSON.parse(el.dataset['inputPath'] ?? '[]') as InputPath
    const parent = path.slice(0, -1)
    const row = {
      path,
      index: Number(el.dataset['inputIndex'] ?? 0),
      rect: el.getBoundingClientRect(),
      el,
    }
    const line = lines.findLast((other) => samePath(other.parent, parent))
    const first = line?.rows[0]
    if (line && first && Math.abs(first.rect.top - row.rect.top) < 1) {
      line.rows.push(row)
    } else {
      lines.push({ parent, rows: [row] })
    }
  }
  return lines
}

/** The width each of `count` inputs sharing a line gets; none for an input alone on its line. */
export function evenWidth(count: number): string | undefined {
  return count > 1 ? `${Math.floor(100 / count)}%` : undefined
}

/**
 * The widths a drop gives, by row key, undefined meaning the full width. Inputs dropped beside
 * another share its line evenly; ones dropped between lines get a line of their own; and a line
 * they leave is shared evenly by the inputs that stay.
 */
export function dropWidths(
  lines: Line[],
  moving: InputPath[],
  drop: Drop,
): Map<string, string | undefined> {
  const movingKeys = new Set(moving.map(key))
  const stays = (row: DrawnRow) => !movingKeys.has(key(row.path))
  const widths = new Map<string, string | undefined>()
  for (const line of lines) {
    if (line.rows.every(stays)) {
      continue
    }
    const staying = line.rows.filter(stays)
    for (const row of staying) {
      widths.set(key(row.path), evenWidth(staying.length))
    }
  }
  const beside = drop.beside
  const target =
    beside && lines.find((line) => line.rows.some((row) => samePath(row.path, beside.path)))
  if (!beside || !target) {
    for (const path of moving) {
      widths.set(key(path), undefined)
    }
    return widths
  }
  const staying = target.rows.filter(stays).map((row) => row.path)
  const at =
    staying.findIndex((path) => samePath(path, beside.path)) + (beside.side === 'right' ? 1 : 0)
  const shared = [...staying.slice(0, at), ...moving, ...staying.slice(at)]
  for (const path of shared) {
    widths.set(key(path), evenWidth(shared.length))
  }
  return widths
}

/** Neighbours on one line, split at `pointer` (a percent of their list's width), in 5% steps. */
export function snapSplit(total: number, pointer: number): [left: number, right: number] {
  const floor = Math.min(10, total / 2)
  const left = Math.min(Math.max(Math.round(pointer / 5) * 5, floor), total - floor)
  return [left, total - left]
}
