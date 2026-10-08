import cx from 'classnames'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useWorkflowEditing } from '../components/Provider'
import { TOOLTIP_ID } from '../components/Tooltip'
import type { FieldPatch, GraphEdit, InputPath, WorkflowEditing } from '../editing'
import { type FormEditing, FormEditingContext } from '../form/formEditing'
import {
  AddIcon,
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  DragHandleIcon,
  DuplicateIcon,
  EditIcon,
  FilesIcon,
  MinusIcon,
  MoreIcon,
  TrashIcon,
} from '../icons'
import { type MenuSearch, type RowMenuItem, useRowMenu } from '../list/RowContextMenu'
import { type DependencyGraphEditor, type EditorProblem, overlaps, typing } from './editorApi'
import { AddChip, BarDivider, DragLabel, EditorBar } from './editorChrome'
import { asRecord, type Json, openOnAddOf, text } from './editorFields'
import {
  type Box,
  createStore,
  type Store as EditorStore,
  MarqueeBox,
  reclaimFocus,
  returningFocus,
  trackDrag,
  useFocusAfterDialog,
  usePressOutside,
  useStore,
} from './editorPrimitives'
import {
  type GraphEditorStrings,
  type InputsEditorStrings,
  useGraphEditorStrings,
  useInputsEditorStrings,
} from './editorStrings'
import {
  allNames,
  INPUT_TYPE_GROUPS,
  InputDialog,
  type InputHome,
  newInputDefinition,
  type PendingInput,
  TypeBadge,
  withCreatedInputs,
} from './InputDialog'
import { isWizard, splitIntoPagesEdits, stepAllowedIn, wizardGroupDefinition } from './inputPages'
import {
  type Change,
  type Column,
  type DrawnRow,
  type Drop,
  dropChanges,
  type Line,
  linesIn,
  reorderChanges,
  rowsOf,
  snapSplit,
} from './inputRows'
import { ALT_KEY, MOD_KEY, type ShortcutGroup } from './ShortcutsButton'

/** A new input's keys from where it's dropped, and the edits that make room for it there. */
interface Placement {
  keys: Json
  edits: GraphEdit[]
}

// A placement names the input not made yet '', so an input going under it waits for its name.
function placementEdits(placement: Placement | undefined, name: string): GraphEdit[] {
  return (placement?.edits ?? []).map((edit) =>
    edit.type === 'updateInput' && edit.set?.['under'] === ''
      ? { ...edit, set: { ...edit.set, under: name } }
      : edit,
  )
}

type Dialog =
  | { kind: 'edit'; path: InputPath }
  | {
      kind: 'create'
      parent: InputPath
      index: number
      type: string
      /** In place of the type's own starting definition. */
      definition?: Json
      placement?: Placement
    }

/** Where a dragged input would land: before `index` of `parent`. */
interface Gap {
  parent: InputPath
  index: number
  left: number
  right: number
  y: number
  /** A column beside an input's own rather than a line, marked by a bar at `x`. */
  beside?: { path: InputPath; side: 'left' | 'right'; x: number; top: number; bottom: number }
  /** Above or below an input in its column. */
  stack?: { path: InputPath; side: 'above' | 'below' }
  /** Among the hidden inputs a list with widths lists after its shown ones. */
  trailing?: boolean
}

interface DragView {
  /** What moves; none for a new input. */
  paths: InputPath[] | null
  label: string
  client: { x: number; y: number }
  gap: Gap | null
}

/** The edge between two inputs sharing a line, and how they split it, in percent of their list. */
interface Edge {
  left: InputPath
  right: InputPath
  x: number
  top: number
  bottom: number
  split: [number, number]
}

interface UiState {
  drag: DragView | null
  /** The edge under the pointer, or being dragged, between inputs sharing a line. */
  edge: Edge | null
  resizing: boolean
  dialog: Dialog | null
  /** The innermost row under the pointer, whose toolbar shows. */
  hovered: string | null
  problems: EditorProblem[]
  /** Selected inputs, by row key. */
  selection: string[]
  /** The input the arrow keys move from: the one last pressed or reached. */
  cursor: string | null
  /** Rows whose toolbar is open: the hovered one, and each column's head on a line it shares. */
  open: string[]
  /** The box a shift + drag is drawing, in the page's coordinates. */
  marquee: Box | null
}

const createFormStore = () =>
  createStore<UiState>({
    drag: null,
    edge: null,
    resizing: false,
    dialog: null,
    hovered: null,
    problems: [],
    selection: [],
    cursor: null,
    open: [],
    marquee: null,
  })

type Store = EditorStore<UiState>

/** The pointer press a drag starts from, a React or a DOM event. */
type Press = Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'stopPropagation'>

interface DragHow {
  /** The click after the release: swallowed always, or only after a drag. */
  swallowClick?: 'always' | 'drag'
  /** Keeps the page's text from selecting once the press is a drag. */
  holdText?: 'drag'
  /** A release that never became a drag. */
  onClick?: () => void
}

interface InputsEditorApi {
  store: Store
  definition: (path: InputPath) => Json
  indexOf: (path: InputPath) => number
  edit: (path: InputPath) => void
  remove: (path: InputPath) => void
  openMenu: (x: number, y: number, path: InputPath) => void
  openTypeMenu: (
    x: number,
    y: number,
    parent: InputPath,
    index: number,
    placement?: Placement,
  ) => void
  startDrag: (e: Press, path: InputPath | null, label: string, how?: DragHow) => void
  startResize: (e: Press, edge: Edge) => void
  /** Moves an edge by `delta` percent, as the arrow keys do. */
  nudgeEdge: (edge: Edge, delta: number) => void
  /** Shows a line of the YAML, when the YAML editor is beside the form. */
  reveal: (line: number) => void
  /** Deletes the selected inputs, reporting whether any were. */
  removeSelection: () => boolean
  /** Opens the one selected input's dialog, reporting whether one was. */
  editSelection: () => boolean
  /** Moves the selected inputs one slot among their siblings, reporting whether any moved. */
  moveSelection: (delta: -1 | 1) => boolean
  /** Selects the input beside the last one reached, or adds it with `extend`; reports a move. */
  navigate: (direction: Direction, extend: boolean) => boolean
  /** Opens the hovered row's toolbar, and each column head's on a line of several. */
  hover: (rowKey: string) => void
  /** Makes the form a wizard, its inputs outside a step going into a first one. */
  splitIntoPages: () => void
}

const ApiContext = createContext<InputsEditorApi | null>(null)
// By context, so a reorder re-renders each row even where the field above it skips rendering.
const InputsContext = createContext<Json | undefined>(undefined)
const EMPTY_STORE = createFormStore()

function useUi<T>(store: Store, select: (state: UiState) => T): T {
  return useStore(store, select)
}

function containerAt(editing: WorkflowEditing, inputs: Json | undefined, parent: InputPath): Json {
  let map = asRecord(inputs)
  for (const name of parent) {
    const definition = asRecord(map[name])
    const key = editing.inputChildrenKey(definition['type'])
    map = key ? asRecord(definition[key]) : {}
  }
  return map
}

function namesIn(container: Json): string[] {
  return Object.keys(container).filter((name) => name !== '$meta')
}

const key = (path: InputPath) => JSON.stringify(path)

function samePath(a: InputPath, b: InputPath): boolean {
  return a.length === b.length && a.every((name, i) => b[i] === name)
}

function isInside(path: InputPath, ancestor: InputPath): boolean {
  return path.length >= ancestor.length && ancestor.every((name, i) => path[i] === name)
}

const below = (path: InputPath, ancestor: InputPath) =>
  path.length > ancestor.length && isInside(path, ancestor)

const pathOf = (rowKey: string) => JSON.parse(rowKey) as InputPath

// An input inside another one listed goes wherever that one does.
function outermost(paths: InputPath[]): InputPath[] {
  return paths.filter((path) => !paths.some((other) => below(path, other)))
}

function contains(rect: DOMRect, box: Box): boolean {
  return (
    rect.left <= box.left &&
    rect.right >= box.right &&
    rect.top <= box.top &&
    rect.bottom >= box.bottom
  )
}

// Presses on these keep their own meaning; elsewhere in the form shift selects.
const CHROME = '[data-input-chrome], [data-input-add], [role="menu"], [role="dialog"]'

// A field's own controls take their presses; anywhere else on an input picks the input up.
const CONTROLS =
  'input, textarea, select, button, a[href], label, [contenteditable="true"], .monaco-editor, [role="button"], [role="checkbox"], [role="combobox"], [role="listbox"], [role="option"], [role="radio"], [role="slider"], [role="switch"], [role="tab"]'

function rowsIn(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('[data-input-path]')].map((el) => ({
    path: pathOf(el.dataset['inputPath'] ?? '[]'),
    rect: el.getBoundingClientRect(),
  }))
}

/**
 * The inputs a box picks: the ones it touches in the innermost group holding it, each taken
 * whole, so a box works inside a group as well as across the form.
 */
function inputsInBox(root: HTMLElement, box: Box): InputPath[] {
  const touched = rowsIn(root).filter(({ rect }) => overlaps(rect, box))
  const holder = touched
    .filter(
      ({ path, rect }) => contains(rect, box) && touched.some((other) => below(other.path, path)),
    )
    .reduce<InputPath | null>(
      (deepest, { path }) => (deepest && deepest.length >= path.length ? deepest : path),
      null,
    )
  const level = holder ? touched.filter(({ path }) => below(path, holder)) : touched
  return outermost(level.map(({ path }) => path))
}

function ChromeButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tooltip-id={TOOLTIP_ID}
      data-tooltip-content={label}
      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app)"
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
    >
      {children}
    </button>
  )
}

/** An input's row: its field, with a toolbar of its type, drag grip and actions on hover. */
function InputRow({
  path,
  hidden = false,
  children,
}: {
  path: InputPath
  hidden?: boolean
  children?: ReactNode
}) {
  const api = useContext(ApiContext)
  const inputs = useContext(InputsContext)
  const editing = useWorkflowEditing()
  const t = useInputsEditorStrings()
  const g = useGraphEditorStrings()
  const rowKey = key(path)
  const active = useUi(
    api?.store ?? EMPTY_STORE,
    (state) => state.open.includes(rowKey) && !state.drag && !state.resizing,
  )
  const selected = useUi(api?.store ?? EMPTY_STORE, (state) => state.selection.includes(rowKey))
  const problems = useUi(api?.store ?? EMPTY_STORE, (state) =>
    state.problems
      .filter((problem) => problem.input && key(problem.input) === rowKey)
      .map((problem) => `${problem.line}\n${problem.message}`)
      .join('\n\n'),
  )
  if (!api) {
    return children
  }
  const found = problems ? problems.split('\n\n') : []
  const definition = api.definition(path)
  const name = path.at(-1) ?? ''
  const parent = path.slice(0, -1)
  const index = namesIn(containerAt(editing, inputs, parent)).indexOf(name)
  // A hidden group or page draws nothing, so its fields are listed here instead.
  const childKey = hidden ? editing.inputChildrenKey(definition['type']) : undefined
  const outline =
    childKey && childKey !== 'template' ? namesIn(asRecord(definition[childKey])) : null
  const flagged = hidden && definition['hidden'] !== undefined && definition['hidden'] !== false
  const actions = (
    <>
      <button
        type="button"
        aria-label={t.inputActions}
        data-drag-handle
        className="flex h-5 w-5 cursor-grab items-center justify-center rounded hover:bg-(--theme-muted-panel-bg)"
        onPointerDown={(e) => api.startDrag(e, path, name)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          api.openMenu(r.left, r.bottom, path)
        }}
      >
        <DragHandleIcon className="h-3.5 w-3.5" />
      </button>
      <span data-tooltip-id={TOOLTIP_ID} data-tooltip-content={name}>
        <TypeBadge type={text(definition['type'])} />
      </span>
      <ChromeButton label={t.editInput} onClick={() => api.edit(path)}>
        <EditIcon className="h-3 w-3" />
      </ChromeButton>
      <ChromeButton
        label={t.addInputBelow}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          api.openTypeMenu(r.right, r.bottom, parent, index + 1)
        }}
      >
        <AddIcon className="h-3 w-3" />
      </ChromeButton>
      <ChromeButton label={t.deleteInput} onClick={() => api.remove(path)}>
        <MinusIcon className="h-3 w-3" />
      </ChromeButton>
      <ChromeButton
        label={t.inputActions}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          api.openMenu(r.right, r.bottom, path)
        }}
      >
        <MoreIcon className="h-3 w-3" />
      </ChromeButton>
    </>
  )
  return (
    <div
      role="none"
      data-input-path={rowKey}
      data-input-index={index}
      {...(hidden ? { 'data-input-hidden': '' } : {})}
      {...(selected ? { 'data-selected': '' } : {})}
      className={cx(
        'relative w-full',
        hidden && 'mb-[15px]',
        found.length > 0 && 'rounded-md ring-2 ring-(--theme-error)',
        // Drawn behind the row and past its edges, so the label and field keep clear of it.
        selected &&
          "isolate before:pointer-events-none before:absolute before:-inset-x-2 before:-inset-y-1 before:-z-10 before:rounded-lg before:bg-(--theme-element)/15 before:ring-2 before:ring-(--theme-element) before:content-['']",
      )}
      onPointerOver={(e) => {
        e.stopPropagation()
        api.hover(rowKey)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        api.openMenu(e.clientX, e.clientY, path)
      }}
    >
      {hidden ? (
        // A hidden input draws no field to hover, so its line stays in view.
        <div className="flex items-center gap-1.5 text-[11px] leading-4 theme-muted-text">
          <span className="font-mono">{name}</span>
          {flagged && <span className="italic">{t.hidden}</span>}
          <div data-input-chrome className="ml-auto flex items-center gap-0.5">
            {actions}
          </div>
        </div>
      ) : (
        // Opens above the field instead of over it, so it never covers the field's own buttons.
        <div
          className={cx(
            'flex justify-end overflow-hidden transition-[height] duration-150 focus-within:h-7',
            active ? 'h-7' : 'h-0',
          )}
        >
          <div
            data-input-chrome
            className="flex h-6 items-center gap-0.5 rounded-md border theme-border bg-(--theme-panel-bg) px-1 py-0.5 text-[11px] leading-4 theme-muted-text shadow-sm"
          >
            {actions}
          </div>
        </div>
      )}
      {found.length > 0 && (
        <button
          type="button"
          data-input-chrome
          aria-label={g.problemCount(found.length)}
          data-tooltip-id={TOOLTIP_ID}
          data-tooltip-content={found
            .map((problem) => problem.slice(problem.indexOf('\n') + 1))
            .join('\n')}
          className="absolute -left-2 -top-2 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-(--theme-panel-bg) text-(--theme-error) shadow-sm"
          onClick={() => api.reveal(Number.parseInt(found[0] ?? '0', 10))}
        >
          <AlertIcon className="h-3.5 w-3.5" />
        </button>
      )}
      {children}
      {outline && (
        <div className="ml-2 border-l theme-border pl-3">
          {outline.map((child) => (
            <InputRow key={child} path={[...path, child]} hidden />
          ))}
          <AddInput parent={path} />
        </div>
      )}
    </div>
  )
}

/** The add button that ends each list of inputs; the form's own also offers to split it into pages. */
function AddInput({ parent }: { parent: InputPath }) {
  const api = useContext(ApiContext)
  const inputs = useContext(InputsContext)
  const t = useInputsEditorStrings()
  if (!api) {
    return null
  }
  const add = (
    <button
      type="button"
      data-input-add={key(parent)}
      className="mb-[15px] flex cursor-pointer items-center gap-1.5 text-[13px] theme-muted-text hover:text-(--theme-link)"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        api.openTypeMenu(r.left, r.bottom, parent, Number.MAX_SAFE_INTEGER)
      }}
    >
      <AddIcon className="h-3 w-3" />
      {parent.length === 0 ? t.addInputHere : t.addField}
    </button>
  )
  if (parent.length > 0 || isWizard(inputs)) {
    return add
  }
  return (
    <div className="flex items-start gap-4">
      {add}
      <button
        type="button"
        data-input-chrome
        className="mb-[15px] flex cursor-pointer items-center gap-1.5 text-[13px] theme-muted-text hover:text-(--theme-link)"
        onClick={api.splitIntoPages}
      >
        <FilesIcon className="h-3 w-3" />
        {t.splitIntoPages}
      </button>
    </div>
  )
}

const EDITING: FormEditing = { parent: [], Row: InputRow, Add: AddInput }

function typeSearch(labels: InputsEditorStrings): MenuSearch {
  return { placeholder: labels.searchTypes, empty: labels.noMatchingTypes }
}

function typeMenu(
  labels: InputsEditorStrings,
  allowStep: boolean,
  pick: (type: string) => void,
): RowMenuItem[] {
  const types = labels.types as Record<string, string>
  const allowed = (type: string) => allowStep || type !== 'step'
  const item = (type: string): RowMenuItem => ({
    kind: 'action',
    label: types[type] ?? type,
    keywords: type,
    onSelect: () => pick(type),
  })
  return [
    ...INPUT_TYPE_GROUPS.map(
      ([group, list]): RowMenuItem => ({
        kind: 'submenu',
        label: labels.typeGroups[group],
        items: list.filter(allowed).map(item),
      }),
    ),
  ]
}

/** What a drag carries: the inputs it moves, none for a new one, and whether any is hidden or shown. */
interface Mover {
  paths: InputPath[] | null
  hidden: boolean
  shown: boolean
}

const extent = (rows: DrawnRow[]) => ({
  left: Math.min(...rows.map((row) => row.rect.left)),
  right: Math.max(...rows.map((row) => row.rect.right)),
})

/** Gaps between lines: above each line, after a list's shown inputs, and at each list's end. */
function lineGaps(root: HTMLElement, lines: Line[]): Gap[] {
  const gaps: Gap[] = []
  const lists = new Map<string, { parent: InputPath; rows: DrawnRow[] }>()
  for (const line of lines) {
    const rows = rowsOf(line)
    if (rows.length === 0) {
      continue
    }
    gaps.push({
      ...aboveGap(line),
      ...(rows.every((row) => row.trailing) ? { trailing: true } : {}),
    })
    const list = lists.get(key(line.parent)) ?? { parent: line.parent, rows: [] }
    list.rows.push(...rows)
    lists.set(key(line.parent), list)
  }
  for (const { parent, rows } of lists.values()) {
    const shown = rows.filter((row) => !row.trailing)
    if (shown.length > 0 && shown.length < rows.length) {
      gaps.push({
        parent,
        index: Math.max(...shown.map((row) => row.index)) + 1,
        ...extent(shown),
        y: Math.max(...shown.map((row) => row.rect.bottom)),
      })
    }
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-input-add]')) {
    const parent = JSON.parse(el.dataset['inputAdd'] ?? '[]') as InputPath
    const rows = lists.get(key(parent))?.rows ?? []
    const rect = el.getBoundingClientRect()
    gaps.push(
      rows.length > 0
        ? {
            parent,
            index: Math.max(...rows.map((row) => row.index)) + 1,
            ...extent(rows),
            y: Math.max(...rows.map((row) => row.rect.bottom)),
          }
        : { parent, index: 0, left: rect.left, right: rect.right, y: rect.top },
    )
  }
  return gaps
}

const into = (parent: InputPath, mover: Mover) =>
  mover.paths?.some((path) => isInside(parent, path)) ?? false

function nearestLineGap(gaps: Gap[], client: { x: number; y: number }, mover: Mover): Gap | null {
  let best: Gap | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const gap of gaps) {
    // A shown input dropped among the hidden ones listed after a list would land somewhere else.
    if (into(gap.parent, mover) || (gap.trailing && mover.shown)) {
      continue
    }
    if (client.x < gap.left - 24 || client.x > gap.right + 24) {
      continue
    }
    const distance = Math.abs(client.y - gap.y)
    // Ties go to the innermost list, so a group's own gaps win over the form's.
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && gap.parent.length > best.parent.length)
    ) {
      best = gap
      bestDistance = distance
    }
  }
  return best
}

/** A column of its own beside `column`, marked by a bar down that side. */
function besideGap(line: Line, column: Column, side: 'left' | 'right'): Gap {
  const { rows } = column
  const own = extent(rows)
  const i = line.columns.indexOf(column)
  const before = line.columns[i - 1]
  const after = line.columns[i + 1]
  let x = side === 'left' ? own.left - 4 : own.right + 4
  if (side === 'left' && before) {
    x = (extent(before.rows).right + own.left) / 2
  } else if (side === 'right' && after) {
    x = (own.right + extent(after.rows).left) / 2
  }
  const top = Math.min(...rows.map((row) => row.rect.top))
  return {
    parent: line.parent,
    index:
      side === 'left'
        ? Math.min(...rows.map((row) => row.index))
        : Math.max(...rows.map((row) => row.index)) + 1,
    ...own,
    y: top,
    beside: {
      path: (rows[0] as DrawnRow).path,
      side,
      x,
      top,
      bottom: Math.max(...rows.map((row) => row.rect.bottom)),
    },
  }
}

/** Above or below `row` in its column, marked by a bar across the column. */
function stackGap(line: Line, column: Column, row: DrawnRow, side: 'above' | 'below'): Gap {
  return {
    parent: line.parent,
    index: side === 'above' ? row.index : row.index + 1,
    ...extent(column.rows),
    y: side === 'above' ? row.rect.top : row.rect.bottom,
    stack: { path: row.path, side },
  }
}

function aboveGap(line: Line): Gap {
  const rows = rowsOf(line)
  return {
    parent: line.parent,
    index: Math.min(...rows.map((row) => row.index)),
    ...extent(rows),
    y: Math.min(...rows.map((row) => row.rect.top)),
  }
}

function belowGap(line: Line): Gap {
  const rows = rowsOf(line)
  return {
    parent: line.parent,
    index: Math.max(...rows.map((row) => row.index)) + 1,
    ...extent(rows),
    y: Math.max(...rows.map((row) => row.rect.bottom)),
  }
}

/** A column narrower than its list stacks a drop on its inputs' halves instead of starting a line. */
function stacks(line: Line, column: Column): boolean {
  const width = column.cell?.style.getPropertyValue(WIDTH_VAR) ?? ''
  return line.columns.length > 1 || column.rows.length > 1 || (width !== '' && width !== '100%')
}

/** Where a group's own inputs start, below its title; null for an input holding none drawn. */
function bodyTop(root: HTMLElement, lines: Line[], row: DrawnRow): number | null {
  const tops = lines
    .filter((line) => samePath(line.parent, row.path))
    .flatMap((line) => rowsOf(line).map((child) => child.rect))
  for (const el of root.querySelectorAll<HTMLElement>('[data-input-add]')) {
    if (el.dataset['inputAdd'] === key(row.path)) {
      tops.push(el.getBoundingClientRect())
    }
  }
  const drawn = tops.filter((rect) => rect.height > 0).map((rect) => rect.top)
  return drawn.length > 0 ? Math.min(...drawn) : null
}

/**
 * Where a drop at `client` lands: on an input's left or right quarter, in a column beside its
 * own; over its middle, above or below it by which half, in its column or as a line of its own.
 */
function dropGap(root: HTMLElement, client: { x: number; y: number }, mover: Mover): Gap | null {
  const lines = linesIn(root)
  const gaps = lineGaps(root, lines)
  const moving = (path: InputPath) => mover.paths?.some((other) => isInside(path, other)) ?? false
  const under = (rect: DOMRect) =>
    client.x >= rect.left &&
    client.x <= rect.right &&
    client.y >= rect.top &&
    client.y <= rect.bottom
  // The innermost input under the pointer, so a group's own inputs win over the group.
  let hit: { line: Line; column: Column; row: DrawnRow } | null = null
  for (const line of lines) {
    for (const column of line.columns) {
      for (const row of column.rows) {
        if (
          !moving(row.path) &&
          under(row.rect) &&
          (!hit || row.path.length > hit.row.path.length)
        ) {
          hit = { line, column, row }
        }
      }
    }
  }
  if (hit) {
    const { line, column, row } = hit
    const body = bodyTop(root, lines, row)
    if (body !== null && client.y >= body) {
      return nearestLineGap(
        gaps.filter((gap) => samePath(gap.parent, row.path)),
        client,
        mover,
      )
    }
    if (row.trailing && mover.shown) {
      return nearestLineGap(
        gaps.filter((gap) => samePath(gap.parent, line.parent)),
        client,
        mover,
      )
    }
    const { rect } = row
    const quarter = rect.width / 4
    // A hidden input takes no share of a line, so it never goes beside one, nor one beside it.
    const shares = !mover.hidden && !row.hidden
    if (shares && client.x < rect.left + quarter) {
      return besideGap(line, column, 'left')
    }
    if (shares && client.x > rect.right - quarter) {
      return besideGap(line, column, 'right')
    }
    // A group's title stands for the group, so its halves are the title's.
    const above = client.y < (rect.top + (body ?? rect.bottom)) / 2
    if (shares && stacks(line, column)) {
      return stackGap(line, column, row, above ? 'above' : 'below')
    }
    return above ? aboveGap(line) : belowGap(line)
  }
  if (!mover.hidden) {
    for (const line of lines) {
      if (into(line.parent, mover)) {
        continue
      }
      for (let i = 1; i < line.columns.length; i++) {
        const before = line.columns[i - 1]
        const after = line.columns[i]
        if (!before || !after) {
          continue
        }
        const left = extent(before.rows).right
        const right = extent(after.rows).left
        const rows = [...before.rows, ...after.rows]
        if (
          client.x <= left ||
          client.x >= right ||
          client.y < Math.min(...rows.map((row) => row.rect.top)) ||
          client.y > Math.max(...rows.map((row) => row.rect.bottom))
        ) {
          continue
        }
        // Between two columns sharing a line, the drop is a column between them.
        if (before.rows.some((row) => !moving(row.path))) {
          return besideGap(line, before, 'right')
        }
        if (after.rows.some((row) => !moving(row.path))) {
          return besideGap(line, after, 'left')
        }
      }
    }
  }
  return nearestLineGap(gaps, client, mover)
}

const WIDTH_VAR = '--input-width'

/** The cells two neighbouring columns sit in, by their heads, and the row of cells holding them. */
function cellsAt(root: HTMLElement, edge: Pick<Edge, 'left' | 'right'>) {
  const cellOf = (path: InputPath) =>
    [...root.querySelectorAll<HTMLElement>('[data-input-path]')]
      .find((el) => el.dataset['inputPath'] === key(path))
      ?.closest<HTMLElement>('[data-input-cell]')
  const left = cellOf(edge.left)
  const right = cellOf(edge.right)
  const flow = left?.parentElement
  return left && right && flow ? { left, right, flow } : null
}

function edgeOf(root: HTMLElement, before: Column, after: Column): Edge | null {
  const [leftHead] = before.rows
  const [rightHead] = after.rows
  const cells =
    leftHead && rightHead && cellsAt(root, { left: leftHead.path, right: rightHead.path })
  const width = cells ? cells.flow.getBoundingClientRect().width : 0
  if (!leftHead || !rightHead || !cells || width <= 0) {
    return null
  }
  const share = (cell: HTMLElement) =>
    Math.round((cell.getBoundingClientRect().width / width) * 100)
  const rows = [...before.rows, ...after.rows]
  return {
    left: leftHead.path,
    right: rightHead.path,
    x: cells.left.getBoundingClientRect().right,
    top: Math.min(...rows.map((row) => row.rect.top)),
    bottom: Math.max(...rows.map((row) => row.rect.bottom)),
    split: [share(cells.left), share(cells.right)],
  }
}

/** The edge between columns on a line that the pointer is over, the innermost list's first. */
function edgeAt(root: HTMLElement, x: number, y: number): Edge | null {
  let found: { depth: number; before: Column; after: Column } | null = null
  for (const { parent, columns } of linesIn(root)) {
    for (let i = 1; i < columns.length; i++) {
      const before = columns[i - 1]
      const after = columns[i]
      if (!before || !after) {
        continue
      }
      const rows = [...before.rows, ...after.rows]
      if (
        x < extent(before.rows).right - 2 ||
        x > extent(after.rows).left + 2 ||
        y < Math.min(...rows.map((row) => row.rect.top)) ||
        y > Math.max(...rows.map((row) => row.rect.bottom))
      ) {
        continue
      }
      if (!found || parent.length > found.depth) {
        found = { depth: parent.length, before, after }
      }
    }
  }
  return found ? edgeOf(root, found.before, found.after) : null
}

/** The edge between the same two columns, by their heads, if they still share a line. */
function edgeBetween(root: HTMLElement, left: InputPath, right: InputPath): Edge | null {
  for (const { columns } of linesIn(root)) {
    const i = columns.findIndex((column) => samePath(column.rows[0]?.path ?? [], left))
    const before = columns[i]
    const after = columns[i + 1]
    if (before && after && samePath(after.rows[0]?.path ?? [], right)) {
      return edgeOf(root, before, after)
    }
  }
  return null
}

const sameEdge = (a: Edge | null, b: Edge | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    samePath(a.left, b.left) &&
    samePath(a.right, b.right) &&
    Math.round(a.x) === Math.round(b.x))

const DELETE_KEYS = new Set(['Delete', 'Backspace'])

type Direction = 'up' | 'down' | 'left' | 'right'

const ARROWS: Record<string, Direction | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/** The input an arrow key reaches from `from` as the form draws them: the nearest one starting
 * above or below it, or beside it, those in line with it first. */
function neighbour(
  rows: { path: InputPath; rect: DOMRect }[],
  from: { path: InputPath; rect: DOMRect },
  direction: Direction,
): { path: InputPath; rect: DOMRect } | undefined {
  const r = from.rect
  const middle = (rect: DOMRect) => ({
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  })
  const distance = (rect: DOMRect) =>
    Math.hypot(middle(rect).x - middle(r).x, middle(rect).y - middle(r).y)
  const others = rows.filter((row) => row !== from)
  const vertical = direction === 'up' || direction === 'down'
  const ahead = others.filter(({ rect }) =>
    direction === 'down'
      ? rect.top > r.top + 1
      : direction === 'up'
        ? rect.top < r.top - 1
        : direction === 'right'
          ? rect.left >= r.right - 1
          : rect.right <= r.left + 1,
  )
  const inLine = ahead.filter(({ rect }) =>
    vertical
      ? Math.min(rect.right, r.right) > Math.max(rect.left, r.left)
      : Math.min(rect.bottom, r.bottom) > Math.max(rect.top, r.top),
  )
  const gap = ({ rect }: { rect: DOMRect }) =>
    direction === 'down'
      ? rect.top - r.top
      : direction === 'up'
        ? r.top - rect.top
        : direction === 'right'
          ? rect.left - r.right
          : r.left - rect.right
  const pool = inLine.length > 0 ? inLine : ahead
  return pool.reduce<{ path: InputPath; rect: DOMRect } | undefined>(
    (best, row) =>
      !best ||
      gap(row) < gap(best) ||
      (gap(row) === gap(best) && distance(row.rect) < distance(best.rect))
        ? row
        : best,
    undefined,
  )
}

function undoKeys(e: KeyboardEvent, editor: DependencyGraphEditor) {
  const pressed = e.key.toLowerCase()
  if (pressed === 'z' && !e.shiftKey) {
    e.preventDefault()
    editor.onUndo()
  } else if ((pressed === 'z' && e.shiftKey) || pressed === 'y') {
    e.preventDefault()
    editor.onRedo()
  }
}

function formShortcuts(g: GraphEditorStrings): ShortcutGroup[] {
  const key = g.shortcutKeys
  const does = g.shortcutDoes
  return [
    {
      title: g.shortcutGroups.select,
      shortcuts: [
        { combos: [[key.shift, key.click]], does: does.selectInput },
        { combos: [[key.shift, key.drag]], does: does.boxInputs },
        { combos: [['←', '↑', '↓', '→']], does: does.pickInput },
        {
          combos: [
            [key.shift, '↑'],
            [key.shift, '↓'],
          ],
          does: does.extendInputs,
        },
        { combos: [['Esc']], does: does.escape },
      ],
    },
    {
      title: g.shortcutGroups.change,
      shortcuts: [
        { combos: [[key.dragHandle]], does: does.moveInput },
        { combos: [[key.dragEdge]], does: does.resizeInputs },
        {
          combos: [
            [ALT_KEY, '↑'],
            [ALT_KEY, '↓'],
          ],
          does: does.reorderInputs,
        },
        { combos: [[key.dragButton]], does: does.addInput },
        { combos: [['E']], does: does.editInput },
        { combos: [[key.delete]], does: does.removeInputs },
        { combos: [[key.rightClick]], does: does.inputMenu },
        {
          combos: [
            [MOD_KEY, 'Z'],
            [key.shift, MOD_KEY, 'Z'],
          ],
          does: does.undo,
        },
      ],
    },
  ]
}

/**
 * Turns the input form rendered in `children` into an editor of the
 * workflow's `on.execute.inputs`, with edits sent through `editor`.
 */
export function InputsFormEditor({
  editor,
  inputs,
  children,
}: {
  editor: DependencyGraphEditor
  inputs: Json | undefined
  children: ReactNode
}) {
  const t = useInputsEditorStrings()
  const g = useGraphEditorStrings()
  const editing = useWorkflowEditing()
  const [store] = useState(createFormStore)
  const containerRef = useRef<HTMLDivElement>(null)
  const latest = useRef({ editor, inputs })
  // Rows read the inputs while they render, so they must see this render's, not the last one's.
  latest.current = { editor, inputs }
  const rowMenu = useRowMenu()
  const openMenu = useMemo(
    () => returningFocus(rowMenu.openMenu, () => containerRef.current),
    [rowMenu.openMenu],
  )
  const contextMenu = rowMenu.contextMenu
  useFocusAfterDialog(store, () => containerRef.current)
  // A press anywhere else on the page lets go of the selected inputs.
  usePressOutside(
    () => containerRef.current,
    () => {
      if (store.get().selection.length > 0) {
        store.set({ selection: [] })
      }
    },
  )

  const api = useMemo<InputsEditorApi>(() => {
    const send = (edit: GraphEdit) => {
      const result = latest.current.editor.onEdit(edit)
      reclaimFocus(containerRef.current)
      return result
    }
    const rowElement = (rowKey: string) =>
      [...(containerRef.current?.querySelectorAll<HTMLElement>('[data-input-path]') ?? [])].find(
        (el) => el.dataset['inputPath'] === rowKey,
      )
    const definition = (path: InputPath): Json =>
      path.length === 0
        ? asRecord(latest.current.inputs)
        : asRecord(
            containerAt(editing, latest.current.inputs, path.slice(0, -1))[path.at(-1) ?? ''],
          )
    const indexOf = (path: InputPath) =>
      namesIn(containerAt(editing, latest.current.inputs, path.slice(0, -1))).indexOf(
        path.at(-1) ?? '',
      )
    const create = (parent: InputPath, index: number, type: string, placement?: Placement) => {
      const { editor, inputs } = latest.current
      const container = containerAt(editing, inputs, parent)
      const ownWizard =
        type === 'step' && !isWizard(container)
          ? wizardGroupDefinition(t.stepsGroup, t.firstStep)
          : undefined
      if (editor.openOnAdd === false) {
        const name = nextInputName(editing, inputs)
        const add: GraphEdit = {
          type: 'addInput',
          parent,
          index: Math.min(index, namesIn(container).length),
          name,
          definition: { ...(ownWizard ?? newInputDefinition(type)), ...placement?.keys },
        }
        // The add goes last, so the batch reports the input it created.
        send(
          placement?.edits.length
            ? { type: 'batch', edits: [...placementEdits(placement, name), add] }
            : add,
        )
        return
      }
      store.set({
        dialog: {
          kind: 'create',
          parent,
          index,
          type: ownWizard ? 'group' : type,
          ...(ownWizard ? { definition: ownWizard } : {}),
          ...(placement ? { placement } : {}),
        },
      })
    }
    const splitIntoPages = () =>
      send({
        type: 'batch',
        edits: splitIntoPagesEdits(editing, latest.current.inputs, t.firstStep),
      })
    const openTypeMenu = (
      x: number,
      y: number,
      parent: InputPath,
      index: number,
      placement?: Placement,
    ) =>
      openMenu(
        x,
        y,
        typeMenu(t, stepAllowedIn(definition, parent), (type) =>
          create(parent, index, type, placement),
        ),
        undefined,
        typeSearch(t),
      )
    const edit = (path: InputPath) => store.set({ dialog: { kind: 'edit', path } })
    const remove = (path: InputPath) => send({ type: 'deleteInput', path })

    const inFormOrder = (paths: InputPath[]) => {
      const order = rowsIn(containerRef.current ?? document.body).map((row) => key(row.path))
      return [...paths].sort((a, b) => order.indexOf(key(a)) - order.indexOf(key(b)))
    }
    // Dropping a run of neighbours back among themselves changes nothing.
    const staysPut = (paths: InputPath[], gap: Gap) => {
      if (!paths.every((path) => samePath(path.slice(0, -1), gap.parent))) {
        return false
      }
      const at = paths.map(indexOf).sort((a, b) => a - b)
      const first = at[0] ?? 0
      const last = at.at(-1) ?? 0
      return (
        at.every((index, i) => index === first + i) && gap.index >= first && gap.index <= last + 1
      )
    }
    const dropOf = (gap: Gap): Drop => ({
      parent: gap.parent,
      index: gap.index,
      ...(gap.beside ? { beside: { path: gap.beside.path, side: gap.beside.side } } : {}),
      ...(gap.stack ? { stack: gap.stack } : {}),
    })
    const changesOf = (moving: InputPath[], drop: Drop) => {
      const root = containerRef.current
      return root ? dropChanges(linesIn(root), moving, drop, definition) : new Map<string, Change>()
    }
    // A drop's changes as edits, each at the path its input has once the drop has moved it.
    const layoutEdits = (
      changes: Map<string, Change>,
      moving: InputPath[],
      drop: Drop,
    ): GraphEdit[] => {
      const edits: GraphEdit[] = []
      for (const [rowKey, change] of changes) {
        const path = pathOf(rowKey)
        const now = definition(path)
        const patch: FieldPatch = {}
        for (const [field, value] of Object.entries(change)) {
          if (value === null && now[field] !== undefined) {
            patch.unset = [...(patch.unset ?? []), field]
          } else if (value !== null && value !== undefined && now[field] !== value) {
            patch.set = { ...patch.set, [field]: value }
          }
        }
        if (!patch.set && !patch.unset) {
          continue
        }
        const at = moving.some((other) => samePath(other, path))
          ? [...drop.parent, path.at(-1) ?? '']
          : path
        edits.push({ type: 'updateInput', path: at, ...patch })
      }
      return edits
    }
    // A move along the list, rather than onto a spot, keeps each column's inputs together.
    const keepingColumns = (parent: InputPath, moved: string[], index: number): GraphEdit => {
      const names = namesIn(containerAt(editing, latest.current.inputs, parent))
      const stay = (from: number, to?: number) =>
        names.slice(from, to).filter((name) => !moved.includes(name))
      const after = [...stay(0, index), ...moved, ...stay(index)]
      const changes = reorderChanges(names, after, (name) => definition([...parent, name]))
      const move: GraphEdit = {
        type: 'moveInputs',
        paths: moved.map((name) => [...parent, name]),
        parent,
        index,
      }
      const edits = layoutEdits(
        new Map([...changes].map(([name, change]) => [key([...parent, name]), change])),
        [],
        { parent, index },
      )
      return edits.length > 0 ? { type: 'batch', edits: [move, ...edits] } : move
    }
    // A new input dropped beside or into a column takes its keys there from the same rules.
    const placementOf = (gap: Gap): Placement | undefined => {
      if (!gap.beside && !gap.stack) {
        return undefined
      }
      const drop = dropOf(gap)
      // No input is named '', so it stands in for the one not made yet.
      const placeholder = [...gap.parent, '']
      const changes = changesOf([placeholder], drop)
      const own = changes.get(key(placeholder)) ?? {}
      changes.delete(key(placeholder))
      const keys = Object.fromEntries(Object.entries(own).filter(([, value]) => value !== null))
      return { keys, edits: layoutEdits(changes, [], drop) }
    }
    // Moved inputs, and the selected ones inside them, stay selected at their new paths.
    const followSelection = (moved: InputPath[], parent: InputPath) =>
      store.set({
        selection: store.get().selection.map((rowKey) => {
          const path = pathOf(rowKey)
          const from = moved.find((other) => isInside(path, other))
          return from ? key([...parent, ...path.slice(from.length - 1)]) : rowKey
        }),
      })
    const removeSelection = () => {
      const paths = inFormOrder(outermost(store.get().selection.map(pathOf)))
      const edits: GraphEdit[] = paths.map((path) => ({
        type: 'deleteInput',
        path,
      }))
      const [only] = edits
      if (!only) {
        return false
      }
      if (send(edits.length === 1 ? only : { type: 'batch', edits })) {
        store.set({ selection: [] })
      }
      return true
    }

    // Up and down have no meaning across containers, so a selection spanning parents stays put.
    const moveSelection = (delta: -1 | 1) => {
      const paths = inFormOrder(outermost(store.get().selection.map(pathOf)))
      const [first] = paths
      if (!first) {
        return false
      }
      const parent = first.slice(0, -1)
      if (!paths.every((path) => samePath(path.slice(0, -1), parent))) {
        return false
      }
      const at = paths.map(indexOf).sort((a, b) => a - b)
      const count = namesIn(containerAt(editing, latest.current.inputs, parent)).length
      // moveInputs inserts before `index` in the original list, so down clears the next sibling.
      const index = delta < 0 ? (at[0] ?? 0) - 1 : (at.at(-1) ?? 0) + 2
      if (index < 0 || index > count) {
        return false
      }
      send(
        keepingColumns(
          parent,
          paths.map((path) => path.at(-1) ?? ''),
          index,
        ),
      )
      return true
    }

    const startDrag = (e: Press, path: InputPath | null, label: string, how: DragHow = {}) => {
      if (e.button !== 0) {
        return
      }
      e.stopPropagation()
      const selected = store.get().selection.map(pathOf)
      // A drag from one of several selected inputs takes them all along.
      const paths = path
        ? selected.length > 1 && selected.some((other) => samePath(other, path))
          ? inFormOrder(outermost(selected))
          : [path]
        : null
      const shown =
        paths && paths.length > 1 ? paths.map((other) => other.at(-1)).join(', ') : label
      const hiddenPaths = (paths ?? []).filter((path) =>
        containerRef.current
          ?.querySelector(`[data-input-path='${key(path)}']`)
          ?.hasAttribute('data-input-hidden'),
      )
      const mover: Mover = {
        paths,
        hidden: hiddenPaths.length > 0,
        shown: !paths || hiddenPaths.length < paths.length,
      }
      const onEnd = (client: { x: number; y: number }, dragged: boolean) => {
        const gap = store.get().drag?.gap ?? null
        store.set({ drag: null })
        if (!dragged) {
          how.onClick?.()
          return
        }
        if (!gap) {
          return
        }
        if (!paths) {
          openTypeMenu(client.x, client.y, gap.parent, gap.index, placementOf(gap))
          return
        }
        // The pressed grip can end up on another row once the rows redraw, holding its toolbar open.
        const root = containerRef.current
        root?.focus({ preventScroll: true })
        const drop = dropOf(gap)
        const edits: GraphEdit[] = [
          ...(staysPut(paths, gap)
            ? []
            : [{ type: 'moveInputs' as const, paths, parent: gap.parent, index: gap.index }]),
          ...layoutEdits(changesOf(paths, drop), paths, drop),
        ]
        const [only] = edits
        if (only && send(edits.length === 1 ? only : { type: 'batch', edits })) {
          followSelection(paths, gap.parent)
        }
      }
      trackDrag(
        { x: e.clientX, y: e.clientY },
        {
          escape: true,
          swallowClick: how.swallowClick ?? 'drag',
          ...(how.holdText ? { holdText: how.holdText } : {}),
          onMove: (client) => {
            const root = containerRef.current
            const gap = root ? dropGap(root, client, mover) : null
            store.set({ drag: { paths, label: shown, client, gap } })
          },
          onEnd,
          onCancel: () => store.set({ drag: null }),
        },
      )
    }

    const menuFor = (path: InputPath): RowMenuItem[] => {
      const parent = path.slice(0, -1)
      const index = indexOf(path)
      const count = namesIn(containerAt(editing, latest.current.inputs, parent)).length
      return [
        {
          kind: 'action',
          label: t.editInput,
          icon: <EditIcon />,
          onSelect: () => edit(path),
        },
        {
          kind: 'submenu',
          label: t.addInputBelow,
          icon: <AddIcon />,
          items: typeMenu(t, stepAllowedIn(definition, parent), (type) =>
            create(parent, index + 1, type),
          ),
          search: typeSearch(t),
        },
        {
          kind: 'action',
          label: t.duplicate,
          icon: <DuplicateIcon />,
          onSelect: () => send({ type: 'duplicateInput', path }),
        },
        {
          kind: 'action',
          label: t.moveUp,
          icon: <ArrowUpIcon />,
          disabled: index <= 0,
          onSelect: () => send(keepingColumns(parent, [path.at(-1) ?? ''], index - 1)),
        },
        {
          kind: 'action',
          label: t.moveDown,
          icon: <ArrowDownIcon />,
          disabled: index >= count - 1,
          onSelect: () => send(keepingColumns(parent, [path.at(-1) ?? ''], index + 2)),
        },
        { kind: 'divider' },
        {
          kind: 'action',
          label: t.deleteInput,
          icon: <TrashIcon />,
          destructive: true,
          onSelect: () => remove(path),
        },
      ]
    }

    // Both sides of an edge get their share of the line as a percent, as one undo step.
    const resize = (edge: Edge, split: [number, number]) => {
      const edits: GraphEdit[] = []
      for (const [path, share] of [
        [edge.left, split[0]],
        [edge.right, split[1]],
      ] as const) {
        const width = `${share}%`
        if (definition(path)['width'] !== width) {
          edits.push({ type: 'updateInput', path, set: { width } })
        }
      }
      const [only] = edits
      return only ? Boolean(send(edits.length === 1 ? only : { type: 'batch', edits })) : false
    }
    const startResize = (e: Press, edge: Edge) => {
      const root = containerRef.current
      const cells = root && cellsAt(root, edge)
      if (e.button !== 0 || !cells) {
        return
      }
      e.stopPropagation()
      const from = cells.left.getBoundingClientRect().left
      const width = cells.flow.getBoundingClientRect().width
      const total = edge.split[0] + edge.split[1]
      const drawn = [cells.left, cells.right].map((cell) => cell.style.getPropertyValue(WIDTH_VAR))
      // The cells show the new split while the drag lasts; the edit then sets it for good.
      const show = (split: [number, number]) => {
        cells.left.style.setProperty(WIDTH_VAR, `${split[0]}%`)
        cells.right.style.setProperty(WIDTH_VAR, `${split[1]}%`)
      }
      const restore = () => {
        cells.left.style.setProperty(WIDTH_VAR, drawn[0] ?? '')
        cells.right.style.setProperty(WIDTH_VAR, drawn[1] ?? '')
      }
      let split = edge.split
      store.set({ resizing: true })
      trackDrag(
        { x: e.clientX, y: e.clientY },
        {
          escape: true,
          holdText: 'press',
          swallowClick: 'always',
          onMove: (client) => {
            split = snapSplit(total, ((client.x - from) / width) * 100)
            show(split)
            store.set({ edge: { ...edge, x: cells.left.getBoundingClientRect().right, split } })
          },
          // Focus goes back to the form, or the pressed handle would stay up on this edge.
          onEnd: () => {
            store.set({ resizing: false })
            root.focus({ preventScroll: true })
            if (!resize(edge, split)) {
              restore()
            }
          },
          onCancel: () => {
            store.set({ resizing: false })
            root.focus({ preventScroll: true })
            restore()
          },
        },
      )
    }

    return {
      store,
      definition,
      indexOf,
      edit,
      remove,
      openMenu: (x, y, path) => openMenu(x, y, menuFor(path)),
      openTypeMenu,
      startDrag,
      startResize,
      nudgeEdge: (edge, delta) => {
        resize(edge, snapSplit(edge.split[0] + edge.split[1], edge.split[0] + delta))
      },
      reveal: (line) => latest.current.editor.onReveal?.({ line }),
      removeSelection,
      moveSelection,
      navigate: (direction, extend) => {
        const root = containerRef.current
        const rows = root ? rowsIn(root) : []
        const { cursor, selection } = store.get()
        const from = rows.find((row) => key(row.path) === (cursor ?? selection.at(-1)))
        const to = from
          ? neighbour(rows, from, direction)
          : direction === 'up' || direction === 'left'
            ? rows.at(-1)
            : rows[0]
        if (!to) {
          return false
        }
        const reached = key(to.path)
        // With shift each input passed is added, the one started from too.
        const visited = from ? [key(from.path), reached] : [reached]
        store.set({
          cursor: reached,
          selection: extend ? [...new Set([...selection, ...visited])] : [reached],
        })
        rowElement(reached)?.scrollIntoView?.({ block: 'nearest' })
        return true
      },
      hover: (rowKey) => {
        const root = containerRef.current
        if (!root || store.get().hovered === rowKey) {
          return
        }
        // On a line of several columns every column opens its head's toolbar, so the columns stay level.
        const line = linesIn(root).find(
          ({ columns }) =>
            columns.length > 1 &&
            columns.some((column) => column.rows.some((row) => key(row.path) === rowKey)),
        )
        const heads = line?.columns.flatMap((column) =>
          column.rows[0] ? [key(column.rows[0].path)] : [],
        )
        store.set({ hovered: rowKey, open: [...new Set([rowKey, ...(heads ?? [])])] })
      },
      splitIntoPages,
      editSelection: () => {
        const [only, ...more] = store.get().selection
        if (only === undefined || more.length > 0) {
          return false
        }
        edit(pathOf(only))
        return true
      },
    }
  }, [store, openMenu, t, editing])

  const problems = editor.problems
  useEffect(() => {
    store.set({ problems: problems ?? [] })
  }, [store, problems])

  // After an edit the shown edge follows its two inputs, or goes once they no longer share a line.
  useEffect(() => {
    const { edge, resizing } = store.get()
    const root = containerRef.current
    if (edge && !resizing && root && inputs) {
      store.set({ edge: edgeBetween(root, edge.left, edge.right) })
    }
  }, [store, inputs])

  // A selected input that's gone, by an undo or a change typed in the YAML, drops out.
  useEffect(() => {
    const { selection } = store.get()
    const kept = selection.filter((rowKey) => {
      const path = pathOf(rowKey)
      return Object.hasOwn(containerAt(editing, inputs, path.slice(0, -1)), path.at(-1) ?? '')
    })
    if (kept.length !== selection.length) {
      store.set({ selection: kept })
    }
  }, [store, inputs, editing])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !(e.target instanceof Element) || e.target.closest(CHROME)) {
        return
      }
      const row = e.target.closest<HTMLElement>('[data-input-path]')
      const start = { x: e.clientX, y: e.clientY }
      if (!e.shiftKey) {
        const rowKey = row?.dataset['inputPath']
        // A plain click between the fields clears the selection.
        if (!rowKey) {
          trackDrag(start, {
            onEnd: (_, dragged) => {
              if (!dragged) {
                store.set({ selection: [] })
              }
            },
          })
          return
        }
        const selected = store.get().selection.includes(rowKey)
        const title = e.target.closest<HTMLElement>('[data-field-label]')
        const ownTitle = title !== null && title.closest('[data-input-path]') === row
        // A field takes its own press; pressing one outside the selection lets the selection go.
        if (!ownTitle && e.target.closest(CONTROLS)) {
          if (!selected) {
            store.set({ selection: [] })
          }
          return
        }
        const path = pathOf(rowKey)
        const name = path.at(-1) ?? ''
        // Anywhere else on an input carries it in a drag. A group's title still folds the group on a click.
        if (ownTitle && title.tagName !== 'LABEL') {
          api.startDrag(e, path, name, { holdText: 'drag' })
          return
        }
        e.preventDefault()
        container.focus({ preventScroll: true })
        // Pressing a selected input keeps the whole selection, so a drag takes it all along.
        if (!selected) {
          store.set({ selection: [rowKey], cursor: rowKey })
        }
        api.startDrag(e, path, name, { swallowClick: 'always', holdText: 'drag' })
        return
      }
      // With shift the press selects, so the field under it neither takes focus nor reacts.
      e.preventDefault()
      e.stopPropagation()
      container.focus({ preventScroll: true })
      const base = store.get().selection
      trackDrag(start, {
        holdText: 'press',
        swallowClick: 'always',
        onMove: (client) => {
          const box = {
            left: Math.min(start.x, client.x),
            right: Math.max(start.x, client.x),
            top: Math.min(start.y, client.y),
            bottom: Math.max(start.y, client.y),
          }
          store.set({
            selection: [...new Set([...base, ...inputsInBox(container, box).map(key)])],
            marquee: box,
          })
        },
        onEnd: (_, dragged) => {
          store.set({ marquee: null })
          const rowKey = row?.dataset['inputPath']
          if (!dragged && rowKey) {
            store.set({
              selection: base.includes(rowKey)
                ? base.filter((other) => other !== rowKey)
                : [...base, rowKey],
              cursor: rowKey,
            })
          }
        },
        onCancel: () => store.set({ marquee: null }),
      })
    }
    container.addEventListener('pointerdown', onDown, true)
    return () => container.removeEventListener('pointerdown', onDown, true)
  }, [api, store])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) {
        return
      }
      const arrow = ARROWS[e.key]
      if (e.metaKey || e.ctrlKey) {
        undoKeys(e, latest.current.editor)
      } else if (DELETE_KEYS.has(e.key) && !e.altKey && api.removeSelection()) {
        e.preventDefault()
      } else if (e.key.toLowerCase() === 'e' && !e.altKey && api.editSelection()) {
        e.preventDefault()
      } else if (
        e.altKey &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        api.moveSelection(e.key === 'ArrowUp' ? -1 : 1)
      ) {
        e.preventDefault()
      } else if (!e.altKey && arrow && api.navigate(arrow, e.shiftKey)) {
        e.preventDefault()
      } else if (e.key === 'Escape' && !store.get().drag) {
        store.set({ selection: [] })
      }
    }
    container.addEventListener('keydown', onKey)
    return () => container.removeEventListener('keydown', onKey)
  }, [api, store])

  const registerShow = editor.registerShow
  useEffect(() => {
    if (!registerShow) {
      return
    }
    return registerShow((problem) => {
      const key = problem.input ? JSON.stringify(problem.input) : null
      const row = [
        ...(containerRef.current?.querySelectorAll<HTMLElement>('[data-input-path]') ?? []),
      ].find((el) => el.dataset['inputPath'] === key)
      if (!row) {
        return false
      }
      const still =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      row.scrollIntoView?.({
        block: 'center',
        behavior: still ? 'auto' : 'smooth',
      })
      if (!still) {
        row.animate?.(
          [
            {
              boxShadow: '0 0 0 4px color-mix(in srgb, var(--theme-element) 45%, transparent)',
            },
            { boxShadow: '0 0 0 0 transparent' },
          ],
          { duration: 1200, easing: 'ease-out' },
        )
      }
      if (problem.input) {
        store.set({ dialog: { kind: 'edit', path: problem.input } })
      }
      return true
    })
  }, [registerShow, store])

  const empty = namesIn(asRecord(inputs)).length === 0
  return (
    <ApiContext.Provider value={api}>
      <InputsContext.Provider value={inputs}>
        <FormEditingContext.Provider value={EDITING}>
          <div
            ref={containerRef}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so the undo shortcuts reach the form instead of the YAML editor.
            tabIndex={0}
            className="relative outline-none"
            onPointerMove={(e) => {
              const state = store.get()
              const root = containerRef.current
              if (!root || state.drag || state.marquee || state.resizing || resizerFocused(root)) {
                return
              }
              // Only a form with widths draws inputs side by side.
              const edge = root.querySelector('[data-input-cell]')
                ? edgeAt(root, e.clientX, e.clientY)
                : null
              if (!sameEdge(edge, state.edge)) {
                store.set({ edge })
              }
            }}
            onPointerLeave={() => {
              const root = containerRef.current
              const keep = store.get().resizing || (root !== null && resizerFocused(root))
              store.set({ hovered: null, open: [], ...(keep ? {} : { edge: null }) })
            }}
          >
            {empty && <div className="mb-3 text-sm theme-muted-text">{t.noInputs}</div>}
            {children}
            <DropIndicator store={store} container={containerRef} />
            <RowResizer api={api} container={containerRef} />
            <Marquee store={store} container={containerRef} />
            <div data-input-chrome className="sticky bottom-2 z-10 mt-2 flex justify-end">
              <EditorBar editor={editor} groups={formShortcuts(g)}>
                <AddChip
                  icon={<AddIcon className="h-3 w-3" />}
                  label={t.addInput}
                  hint={t.addInputHint}
                  onPointerDown={(e) => api.startDrag(e, null, t.addInput)}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    api.openTypeMenu(r.left, r.bottom, [], Number.MAX_SAFE_INTEGER)
                  }}
                />
                {editor.onOpenSettings && <BarDivider />}
              </EditorBar>
            </div>
          </div>
          <Dialogs api={api} inputs={inputs} editor={editor} />
          {contextMenu}
        </FormEditingContext.Provider>
      </InputsContext.Provider>
    </ApiContext.Provider>
  )
}

function DropIndicator({
  store,
  container,
}: {
  store: Store
  container: React.RefObject<HTMLDivElement | null>
}) {
  const drag = useUi(store, (state) => state.drag)
  const root = container.current
  if (!drag || !root) {
    return null
  }
  const rect = root.getBoundingClientRect()
  return (
    <>
      {drag.gap?.beside ? (
        <div
          className="pointer-events-none absolute z-20 w-1 rounded-full bg-(--theme-element)"
          style={{
            left: drag.gap.beside.x - rect.left - 2,
            top: drag.gap.beside.top - rect.top,
            height: drag.gap.beside.bottom - drag.gap.beside.top,
          }}
        />
      ) : (
        drag.gap && (
          <div
            className="pointer-events-none absolute z-20 h-1 rounded-full bg-(--theme-element)"
            style={{
              left: drag.gap.left - rect.left,
              top: drag.gap.y - rect.top - 2,
              width: drag.gap.right - drag.gap.left,
            }}
          />
        )
      )}
      <DragLabel
        at={{ x: drag.client.x - rect.left, y: drag.client.y - rect.top }}
        text={drag.label}
      />
    </>
  )
}

const resizerFocused = (root: HTMLElement) =>
  document.activeElement instanceof HTMLElement &&
  root.contains(document.activeElement) &&
  document.activeElement.dataset['inputResizer'] !== undefined

/** The handle on the edge between two inputs sharing a line, which moves width between them. */
function RowResizer({
  api,
  container,
}: {
  api: InputsEditorApi
  container: React.RefObject<HTMLDivElement | null>
}) {
  const t = useInputsEditorStrings()
  const edge = useUi(api.store, (state) => state.edge)
  const root = container.current
  if (!edge || !root) {
    return null
  }
  const rect = root.getBoundingClientRect()
  const total = edge.split[0] + edge.split[1]
  return (
    // biome-ignore lint/a11y/useSemanticElements: a window splitter must be focusable and full height; <hr> is reset to height 0 and cannot host the drag surface.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t.resizeInputs}
      aria-valuenow={edge.split[0]}
      aria-valuemin={Math.min(10, total / 2)}
      aria-valuemax={total - Math.min(10, total / 2)}
      tabIndex={0}
      data-input-chrome
      data-input-resizer
      className="group/edge absolute z-20 flex w-3 -translate-x-1/2 cursor-col-resize touch-none justify-center outline-none"
      style={{
        left: edge.x - rect.left,
        top: edge.top - rect.top,
        height: edge.bottom - edge.top,
      }}
      onPointerDown={(e) => api.startResize(e, edge)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          e.stopPropagation()
          api.nudgeEdge(edge, e.key === 'ArrowLeft' ? -5 : 5)
        }
      }}
      onBlur={() => {
        if (!api.store.get().resizing) {
          api.store.set({ edge: null })
        }
      }}
    >
      <div className="h-full w-0.5 rounded-full bg-(--theme-element) opacity-50 group-hover/edge:opacity-100 group-focus-visible/edge:opacity-100" />
    </div>
  )
}

function Marquee({
  store,
  container,
}: {
  store: Store
  container: React.RefObject<HTMLDivElement | null>
}) {
  const box = useUi(store, (state) => state.marquee)
  const root = container.current
  if (!box || !root) {
    return null
  }
  const rect = root.getBoundingClientRect()
  return (
    <MarqueeBox
      className="pointer-events-none z-20"
      box={{
        left: box.left - rect.left,
        top: box.top - rect.top,
        right: box.right - rect.left,
        bottom: box.bottom - rect.top,
      }}
    />
  )
}

function Dialogs({
  api,
  inputs,
  editor,
}: {
  api: InputsEditorApi
  inputs: Json | undefined
  editor: DependencyGraphEditor
}) {
  const editing = useWorkflowEditing()
  const dialog = useUi(api.store, (state) => state.dialog)
  const close = () => api.store.set({ dialog: null })
  if (!dialog) {
    return null
  }
  const save = (edit: GraphEdit, created: PendingInput[], home: InputHome) => {
    const merged = withCreatedInputs(editing, created, home, edit)
    if (merged) {
      editor.onEdit(merged)
    }
  }
  if (dialog.kind === 'create') {
    const siblings = namesIn(containerAt(editing, inputs, dialog.parent))
    const index = Math.min(dialog.index, siblings.length)
    const home = homeFor(editing, inputs, dialog.parent, index)
    const placement = dialog.placement
    return (
      <InputDialog
        key={`create:${key(dialog.parent)}:${dialog.index}`}
        name={nextInputName(editing, inputs)}
        definition={{
          ...(dialog.definition ?? newInputDefinition(dialog.type)),
          ...placement?.keys,
        }}
        isNew
        siblings={siblings}
        anchors={siblings.slice(0, index)}
        allowStep={isWizard(containerAt(editing, inputs, dialog.parent))}
        inputs={inputs}
        home={home}
        onClose={close}
        view={editor.settingsView}
        onViewChange={editor.onSettingsViewChange}
        openOnAdd={openOnAddOf(editor)}
        yaml={{
          onSave: (name, text) =>
            editor.onEdit({
              type: 'batch',
              edits: [
                ...placementEdits(placement, name),
                {
                  type: 'addInput',
                  parent: dialog.parent,
                  index,
                  name,
                  definition: asRecord(editing.loadYaml(text)),
                },
                // The text as written, comments included.
                {
                  type: 'setInputYaml',
                  path: [...dialog.parent, name],
                  yaml: text,
                },
              ],
            }),
        }}
        onSave={(name, definition, _patch, created) => {
          const add: GraphEdit = {
            type: 'addInput',
            parent: dialog.parent,
            index: samePath(home.parent, dialog.parent) ? index + created.length : index,
            name,
            definition,
          }
          save(
            placement?.edits.length
              ? { type: 'batch', edits: [...placementEdits(placement, name), add] }
              : add,
            created,
            home,
          )
        }}
      />
    )
  }
  const { path } = dialog
  const name = path.at(-1) ?? ''
  const container = containerAt(editing, inputs, path.slice(0, -1))
  if (!Object.hasOwn(container, name)) {
    return null
  }
  const home = homeFor(editing, inputs, path.slice(0, -1), namesIn(container).indexOf(name))
  return (
    <InputDialog
      key={`edit:${key(path)}`}
      name={name}
      definition={asRecord(container[name])}
      isNew={false}
      siblings={namesIn(container).filter((other) => other !== name)}
      anchors={namesIn(container).slice(0, namesIn(container).indexOf(name))}
      allowStep={isWizard(container)}
      inputs={inputs}
      home={home}
      onClose={close}
      onDelete={() => editor.onEdit({ type: 'deleteInput', path })}
      view={editor.settingsView}
      onViewChange={editor.onSettingsViewChange}
      openOnAdd={openOnAddOf(editor)}
      yaml={{
        source: editor.readSource?.(),
        path,
        onSave: (next, text) => {
          const at = [...path.slice(0, -1), next]
          editor.onEdit(
            next === name
              ? { type: 'setInputYaml', path, yaml: text }
              : {
                  type: 'batch',
                  edits: [
                    { type: 'updateInput', path, name: next },
                    { type: 'setInputYaml', path: at, yaml: text },
                  ],
                },
          )
        },
      }}
      onSave={(next, _definition, patch, created) =>
        save(
          {
            type: 'updateInput',
            path,
            ...(next !== name ? { name: next } : {}),
            ...patch,
          },
          created,
          home,
        )
      }
    />
  )
}

// Created inputs go just before the top-level input, or wizard step field, holding the
// edited one, so the form asks for them first.
function homeFor(
  editing: WorkflowEditing,
  inputs: Json | undefined,
  container: InputPath,
  index: number,
): InputHome {
  const [top, next] = container
  if (top === undefined) {
    return { parent: [], index }
  }
  if (text(asRecord(asRecord(inputs)[top])['type']) === 'step') {
    const fields = namesIn(containerAt(editing, inputs, [top]))
    return {
      parent: [top],
      index: next === undefined ? index : fields.indexOf(next),
    }
  }
  return { parent: [], index: namesIn(asRecord(inputs)).indexOf(top) }
}

function nextInputName(editing: WorkflowEditing, inputs: Json | undefined): string {
  return editing.newInputName(allNames(editing, asRecord(inputs), new Set()))
}
