import type { CSSProperties } from 'react'

// One row of a column in the graph's own pixels: a one-job node (80px) plus the 6rem between nodes.
export const SLOT_PITCH = 176
/** Top margin for a node that sits below `rows` empty rows of its column. */
export function emptyRowsStyle(rows: number): CSSProperties {
  return rows > 0 ? { marginTop: `calc(6rem + ${rows * SLOT_PITCH}px)` } : {}
}

// One empty column in the graph's own pixels: a short-named node (189px) plus its 6rem margins.
export const COLUMN_PITCH = 381

/** Left margin for a column that follows `columns` empty ones. */
export function emptyColumnsStyle(columns: number): CSSProperties {
  return columns > 0 ? { marginLeft: columns * COLUMN_PITCH } : {}
}
