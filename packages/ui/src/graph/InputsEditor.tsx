import {
  type GraphEdit,
  type InputPath,
  inputChildrenKey,
  loadYaml,
  newInputName,
} from '@parallelworks/workflow-parser'
import cx from 'classnames'
import {
  createContext,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useStrings } from '../components/Provider'
import { TOOLTIP_ID } from '../components/Tooltip'
import { type FormEditing, FormEditingContext } from '../form/formEditing'
import {
  AddIcon,
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  DragHandleIcon,
  DuplicateIcon,
  EditIcon,
  MinusIcon,
  MoreIcon,
  TrashIcon,
} from '../icons'
import { type MenuSearch, type RowMenuItem, useRowMenu } from '../list/RowContextMenu'
import {
  AddChip,
  BarDivider,
  type Box,
  createStore,
  DragLabel,
  EditorBar,
  type Store as EditorStore,
  MarqueeBox,
  trackDrag,
  useStore,
} from './editorChrome'
import { asRecord, type Json, openOnAddOf, text } from './editorFields'
import { type DependencyGraphEditor, type EditorProblem, overlaps, typing } from './GraphEditor'
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
import { MOD_KEY, type ShortcutGroup } from './ShortcutsButton'

type Dialog =
  | { kind: 'edit'; path: InputPath }
  | { kind: 'create'; parent: InputPath; index: number; type: string }

/** Where a dragged input would land: before `index` of `parent`. */
interface Gap {
  parent: InputPath
  index: number
  left: number
  right: number
  y: number
}

interface DragView {
  /** What moves; none for a new input. */
  paths: InputPath[] | null
  label: string
  client: { x: number; y: number }
  gap: Gap | null
}

interface UiState {
  drag: DragView | null
  dialog: Dialog | null
  /** The innermost row under the pointer, whose toolbar shows. */
  hovered: string | null
  problems: EditorProblem[]
  /** Selected inputs, by row key. */
  selection: string[]
  /** The box a shift + drag is drawing, in the page's coordinates. */
  marquee: Box | null
}

const createFormStore = () =>
  createStore<UiState>({
    drag: null,
    dialog: null,
    hovered: null,
    problems: [],
    selection: [],
    marquee: null,
  })

type Store = EditorStore<UiState>

interface InputsEditorApi {
  store: Store
  definition: (path: InputPath) => Json
  indexOf: (path: InputPath) => number
  edit: (path: InputPath) => void
  remove: (path: InputPath) => void
  openMenu: (x: number, y: number, path: InputPath) => void
  openTypeMenu: (x: number, y: number, parent: InputPath, index: number) => void
  startDrag: (e: ReactPointerEvent, path: InputPath | null, label: string) => void
  /** Shows a line of the YAML, when the YAML editor is beside the form. */
  reveal: (line: number) => void
  /** Deletes the selected inputs, reporting whether any were. */
  removeSelection: () => boolean
  /** Opens the one selected input's dialog, reporting whether one was. */
  editSelection: () => boolean
  /** Moves the selected inputs one slot among their siblings, reporting whether any moved. */
  moveSelection: (delta: -1 | 1) => boolean
}

const ApiContext = createContext<InputsEditorApi | null>(null)
// By context, so a reorder re-renders each row even where the field above it skips rendering.
const InputsContext = createContext<Json | undefined>(undefined)
const EMPTY_STORE = createFormStore()

function useUi<T>(store: Store, select: (state: UiState) => T): T {
  return useStore(store, select)
}

function containerAt(inputs: Json | undefined, parent: InputPath): Json {
  let map = asRecord(inputs)
  for (const name of parent) {
    const definition = asRecord(map[name])
    const key = inputChildrenKey(definition['type'])
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
  const { inputsEditor: t, graphEditor: g } = useStrings()
  const rowKey = key(path)
  const active = useUi(
    api?.store ?? EMPTY_STORE,
    (state) => state.hovered === rowKey && !state.drag,
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
  const index = namesIn(containerAt(inputs, parent)).indexOf(name)
  // A hidden group or page draws nothing, so its fields are listed here instead.
  const childKey = hidden ? inputChildrenKey(definition['type']) : undefined
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
        if (api.store.get().hovered !== rowKey) {
          api.store.set({ hovered: rowKey })
        }
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

/** The add button that ends each list of inputs. */
function AddInput({ parent }: { parent: InputPath }) {
  const api = useContext(ApiContext)
  const { inputsEditor: t } = useStrings()
  if (!api) {
    return null
  }
  return (
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
}

const EDITING: FormEditing = { parent: [], Row: InputRow, Add: AddInput }

function typeSearch(labels: ReturnType<typeof useStrings>['inputsEditor']): MenuSearch {
  return { placeholder: labels.searchTypes, empty: labels.noMatchingTypes }
}

function typeMenu(
  labels: ReturnType<typeof useStrings>['inputsEditor'],
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

function gapsIn(root: HTMLElement): Gap[] {
  const gaps: Gap[] = []
  const last = new Map<string, { parent: InputPath; index: number; rect: DOMRect }>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-input-path]')) {
    const path = JSON.parse(el.dataset['inputPath'] ?? '[]') as InputPath
    const parent = path.slice(0, -1)
    const index = Number(el.dataset['inputIndex'] ?? 0)
    const rect = el.getBoundingClientRect()
    gaps.push({
      parent,
      index,
      left: rect.left,
      right: rect.right,
      y: rect.top,
    })
    last.set(key(parent), { parent, index, rect })
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-input-add]')) {
    const parent = JSON.parse(el.dataset['inputAdd'] ?? '[]') as InputPath
    const end = last.get(key(parent))
    const rect = el.getBoundingClientRect()
    gaps.push({
      parent,
      index: end ? end.index + 1 : 0,
      left: end?.rect.left ?? rect.left,
      right: end?.rect.right ?? rect.right,
      y: end ? end.rect.bottom : rect.top,
    })
  }
  return gaps
}

function nearestGap(gaps: Gap[], x: number, y: number, moving: InputPath[] | null): Gap | null {
  let best: Gap | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const gap of gaps) {
    if (moving?.some((path) => isInside(gap.parent, path))) {
      continue
    }
    if (x < gap.left - 24 || x > gap.right + 24) {
      continue
    }
    const distance = Math.abs(y - gap.y)
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

const DELETE_KEYS = new Set(['Delete', 'Backspace'])

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

function formShortcuts(g: ReturnType<typeof useStrings>['graphEditor']): ShortcutGroup[] {
  const key = g.shortcutKeys
  const does = g.shortcutDoes
  return [
    {
      title: g.shortcutGroups.select,
      shortcuts: [
        { combos: [[key.shift, key.click]], does: does.selectInput },
        { combos: [[key.shift, key.drag]], does: does.boxInputs },
        { combos: [['Esc']], does: does.escape },
      ],
    },
    {
      title: g.shortcutGroups.change,
      shortcuts: [
        { combos: [[key.dragHandle]], does: does.moveInput },
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
  const { inputsEditor: t, graphEditor: g } = useStrings()
  const [store] = useState(createFormStore)
  const containerRef = useRef<HTMLDivElement>(null)
  const latest = useRef({ editor, inputs })
  // Rows read the inputs while they render, so they must see this render's, not the last one's.
  latest.current = { editor, inputs }
  const { openMenu, contextMenu } = useRowMenu()

  const api = useMemo<InputsEditorApi>(() => {
    const send = (edit: GraphEdit) => latest.current.editor.onEdit(edit)
    const definition = (path: InputPath): Json =>
      path.length === 0
        ? asRecord(latest.current.inputs)
        : asRecord(containerAt(latest.current.inputs, path.slice(0, -1))[path.at(-1) ?? ''])
    const indexOf = (path: InputPath) =>
      namesIn(containerAt(latest.current.inputs, path.slice(0, -1))).indexOf(path.at(-1) ?? '')
    const create = (parent: InputPath, index: number, type: string) => {
      const { editor, inputs } = latest.current
      if (editor.openOnAdd === false) {
        send({
          type: 'addInput',
          parent,
          index: Math.min(index, namesIn(containerAt(inputs, parent)).length),
          name: nextInputName(inputs),
          definition: newInputDefinition(type),
        })
        return
      }
      store.set({ dialog: { kind: 'create', parent, index, type } })
    }
    const openTypeMenu = (x: number, y: number, parent: InputPath, index: number) =>
      openMenu(
        x,
        y,
        typeMenu(t, parent.length === 0, (type) => create(parent, index, type)),
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
      const count = namesIn(containerAt(latest.current.inputs, parent)).length
      // moveInputs inserts before `index` in the original list, so down clears the next sibling.
      const index = delta < 0 ? (at[0] ?? 0) - 1 : (at.at(-1) ?? 0) + 2
      if (index < 0 || index > count) {
        return false
      }
      send({ type: 'moveInputs', paths, parent, index })
      return true
    }

    const startDrag = (e: ReactPointerEvent, path: InputPath | null, label: string) => {
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
      const onEnd = (client: { x: number; y: number }, dragged: boolean) => {
        const gap = store.get().drag?.gap ?? null
        store.set({ drag: null })
        if (!dragged || !gap) {
          return
        }
        if (!paths) {
          openTypeMenu(client.x, client.y, gap.parent, gap.index)
          return
        }
        // The pressed grip can end up on another row once the rows redraw, holding its toolbar open.
        containerRef.current?.focus({ preventScroll: true })
        if (staysPut(paths, gap)) {
          return
        }
        if (
          send({
            type: 'moveInputs',
            paths,
            parent: gap.parent,
            index: gap.index,
          })
        ) {
          followSelection(paths, gap.parent)
        }
      }
      trackDrag(
        { x: e.clientX, y: e.clientY },
        {
          escape: true,
          swallowClick: 'drag',
          onMove: (client) => {
            const root = containerRef.current
            const gap = root ? nearestGap(gapsIn(root), client.x, client.y, paths) : null
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
      const count = namesIn(containerAt(latest.current.inputs, parent)).length
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
          items: typeMenu(t, parent.length === 0, (type) => create(parent, index + 1, type)),
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
          onSelect: () =>
            send({
              type: 'moveInputs',
              paths: [path],
              parent,
              index: index - 1,
            }),
        },
        {
          kind: 'action',
          label: t.moveDown,
          icon: <ArrowDownIcon />,
          disabled: index >= count - 1,
          onSelect: () =>
            send({
              type: 'moveInputs',
              paths: [path],
              parent,
              index: index + 2,
            }),
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

    return {
      store,
      definition,
      indexOf,
      edit,
      remove,
      openMenu: (x, y, path) => openMenu(x, y, menuFor(path)),
      openTypeMenu,
      startDrag,
      reveal: (line) => latest.current.editor.onReveal?.({ line }),
      removeSelection,
      moveSelection,
      editSelection: () => {
        const [only, ...more] = store.get().selection
        if (only === undefined || more.length > 0) {
          return false
        }
        edit(pathOf(only))
        return true
      },
    }
  }, [store, openMenu, t])

  const problems = editor.problems
  useEffect(() => {
    store.set({ problems: problems ?? [] })
  }, [store, problems])

  // A selected input that's gone, by an undo or a change typed in the YAML, drops out.
  useEffect(() => {
    const { selection } = store.get()
    const kept = selection.filter((rowKey) => {
      const path = pathOf(rowKey)
      return Object.hasOwn(containerAt(inputs, path.slice(0, -1)), path.at(-1) ?? '')
    })
    if (kept.length !== selection.length) {
      store.set({ selection: kept })
    }
  }, [store, inputs])

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
        // Clicking a field's label highlights its input; the field itself still takes the click.
        const rowKey = row?.dataset['inputPath']
        if (rowKey && e.target.closest('label')) {
          e.preventDefault()
          container.focus({ preventScroll: true })
          store.set({ selection: [rowKey] })
          return
        }
        // A plain click between the fields clears the selection.
        if (!row) {
          trackDrag(start, {
            onEnd: (_, dragged) => {
              if (!dragged) {
                store.set({ selection: [] })
              }
            },
          })
        }
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
            })
          }
        },
        onCancel: () => store.set({ marquee: null }),
      })
    }
    container.addEventListener('pointerdown', onDown, true)
    return () => container.removeEventListener('pointerdown', onDown, true)
  }, [store])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) {
        return
      }
      if (e.metaKey || e.ctrlKey) {
        undoKeys(e, latest.current.editor)
      } else if (DELETE_KEYS.has(e.key) && !e.altKey && api.removeSelection()) {
        e.preventDefault()
      } else if (e.key.toLowerCase() === 'e' && !e.altKey && api.editSelection()) {
        e.preventDefault()
      } else if (
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        !e.altKey &&
        api.moveSelection(e.key === 'ArrowUp' ? -1 : 1)
      ) {
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
            onPointerLeave={() => store.set({ hovered: null })}
          >
            {empty && <div className="mb-3 text-sm theme-muted-text">{t.noInputs}</div>}
            {children}
            <DropIndicator store={store} container={containerRef} />
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
      {drag.gap && (
        <div
          className="pointer-events-none absolute z-20 h-1 rounded-full bg-(--theme-element)"
          style={{
            left: drag.gap.left - rect.left,
            top: drag.gap.y - rect.top - 2,
            width: drag.gap.right - drag.gap.left,
          }}
        />
      )}
      <DragLabel
        at={{ x: drag.client.x - rect.left, y: drag.client.y - rect.top }}
        text={drag.label}
      />
    </>
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
  const dialog = useUi(api.store, (state) => state.dialog)
  const close = () => api.store.set({ dialog: null })
  if (!dialog) {
    return null
  }
  const save = (edit: GraphEdit, created: PendingInput[], home: InputHome) => {
    const merged = withCreatedInputs(created, home, edit)
    if (merged) {
      editor.onEdit(merged)
    }
  }
  if (dialog.kind === 'create') {
    const siblings = namesIn(containerAt(inputs, dialog.parent))
    const index = Math.min(dialog.index, siblings.length)
    const home = homeFor(inputs, dialog.parent, index)
    return (
      <InputDialog
        key={`create:${key(dialog.parent)}:${dialog.index}`}
        name={nextInputName(inputs)}
        definition={newInputDefinition(dialog.type)}
        isNew
        siblings={siblings}
        allowStep={dialog.parent.length === 0}
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
                {
                  type: 'addInput',
                  parent: dialog.parent,
                  index,
                  name,
                  definition: asRecord(loadYaml(text)),
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
        onSave={(name, definition, _patch, created) =>
          save(
            {
              type: 'addInput',
              parent: dialog.parent,
              index: samePath(home.parent, dialog.parent) ? index + created.length : index,
              name,
              definition,
            },
            created,
            home,
          )
        }
      />
    )
  }
  const { path } = dialog
  const name = path.at(-1) ?? ''
  const container = containerAt(inputs, path.slice(0, -1))
  if (!Object.hasOwn(container, name)) {
    return null
  }
  const home = homeFor(inputs, path.slice(0, -1), namesIn(container).indexOf(name))
  return (
    <InputDialog
      key={`edit:${key(path)}`}
      name={name}
      definition={asRecord(container[name])}
      isNew={false}
      siblings={namesIn(container).filter((other) => other !== name)}
      allowStep={path.length === 1}
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
function homeFor(inputs: Json | undefined, container: InputPath, index: number): InputHome {
  const [top, next] = container
  if (top === undefined) {
    return { parent: [], index }
  }
  if (text(asRecord(asRecord(inputs)[top])['type']) === 'step') {
    const fields = namesIn(containerAt(inputs, [top]))
    return {
      parent: [top],
      index: next === undefined ? index : fields.indexOf(next),
    }
  }
  return { parent: [], index: namesIn(asRecord(inputs)).indexOf(top) }
}

function nextInputName(inputs: Json | undefined): string {
  return newInputName(allNames(asRecord(inputs), new Set()))
}
