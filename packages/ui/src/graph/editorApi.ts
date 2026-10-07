import {
  type CSSProperties,
  createContext,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useSyncExternalStore,
} from 'react'
import type {
  GraphEdit,
  GraphEditResult,
  GraphSlot,
  NeedRef,
  NudgeDirection,
  StepRef,
} from '../editing'
import type { Box, Point, Store } from './editorPrimitives'
import type { GraphEditorStrings } from './editorStrings'
import type { SettingsView } from './GraphEditorDialogs'
import type { ListedProblem } from './ProblemsButton'
import { jobLabel, NODE_CONNECTOR_Y } from './util'

export type { Box }

export interface EditorProblem {
  message: string
  line: number
  job?: string
  step?: number
  input?: string[]
  /** In a workflow-level setting the settings dialog edits. */
  setting?: boolean
}

/** What to show in the YAML beside the graph: a job, one of its steps, or a line. */
export type RevealTarget = { job: string; step?: number } | { line: number }

/** Build-page callbacks that turn the dependency graph into an editor. */
export interface DependencyGraphEditor {
  onEdit: (edit: GraphEdit) => GraphEditResult | undefined
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** `uses` values offered in the step editor, such as the user's own workflows. */
  usesSuggestions?: string[]
  /** Opens the workflow-level settings: env, permissions, sessions and more. */
  onOpenSettings?: () => void
  /** The YAML the edits apply to, for editing a job or step as text. */
  readSource?: () => string
  /** The view the job, step and input dialogs open in; YAML when not given. */
  settingsView?: SettingsView
  onSettingsViewChange?: (view: SettingsView) => void
  /** False adds a new job, step or input with its defaults, without opening its dialog. */
  openOnAdd?: boolean
  onOpenOnAddChange?: (open: boolean) => void
  /** Problems in the workflow, marked on the jobs, steps and inputs they're in. */
  problems?: EditorProblem[]
  /** The problems this pane's toolbar counts and lists. */
  listedProblems?: ListedProblem[]
  /** Hands the page this pane's way to bring a problem into view, false where it can't; returns its undo. */
  registerShow?: (show: (problem: EditorProblem) => boolean) => () => void
  /** Shows a job's, step's or line's YAML, when the YAML editor is beside the graph. */
  onReveal?: (target: RevealTarget) => void
}

/** Pointer-downs on this class drag editor items instead of panning the graph. */
export const EDITOR_HANDLE_CLASS = 'dag-editor-handle'

/** A node's left circle takes dependencies; its right circle gives them. */
export type PortSide = 'in' | 'out'

export type ConnectPayload = {
  kind: 'connect'
  from: string[]
  side: PortSide
  label: string
  /** The circle dragged from: `node:<head job>`, or `selection`. */
  port: string
  /** An end of a connector being moved: its needs go on the drop, and the line starts at its other end. */
  replaces?: NeedRef[]
  origin?: Point
}

export type DragPayload =
  /** `anchor` lands where the drag drops; the other jobs keep their offsets from it. */
  | { kind: 'jobs'; jobs: string[]; label: string; anchor?: string }
  | { kind: 'new'; matrix: boolean; label: string }
  | ConnectPayload
  | { kind: 'steps'; steps: StepRef[]; label: string }

export type DropTarget =
  /** `blocked` when the move would cut a need an expression of a moved job reads. */
  | { kind: 'slot'; slot: GraphSlot; indicator: Box; blocked?: boolean }
  | { kind: 'trash' }
  /** `edits` is null when the drop can't connect. */
  | { kind: 'connect'; edits: GraphEdit[] | null; box: Box }
  /** Dragged jobs join `into`'s node, taking its needs; `valid` is false when that would loop. */
  | { kind: 'merge'; into: string; jobs: string[]; valid: boolean; box: Box }
  /** Steps land at `index` of `job`; `around` outlines a job whose steps aren't shown, `problem` refuses the drop. */
  | {
      kind: 'steps'
      job: string
      index: number
      indicator: Box
      around?: boolean
      problem?: string
    }

export interface DragView {
  payload: DragPayload
  client: Point
  content: Point | null
  origin: Point | null
  target: DropTarget | null
}

/** A job or step being added: `yml` is the workflow as if `edit` were applied, which the dialog's first save does. */
export interface Addition {
  edit: GraphEdit
  yml: string
}

export type Dialog =
  | { kind: 'job'; job: string; addition?: Addition }
  | { kind: 'step'; job: string; index: number; addition?: Addition }

export const labelsOf = (jobs: string[]) => jobs.map((job) => jobLabel(job)).join(', ')

/** A drawn connector, named by the head jobs of the boxes it joins. */
export interface EdgeSelection {
  from: string
  to: string
}

export interface UiState {
  drag: DragView | null
  /** Selected connectors. Jobs, steps and connectors are never selected together. */
  edges: EdgeSelection[]
  dialog: Dialog | null
  selection: string[]
  /** Selected steps. */
  steps: StepRef[]
  problems: EditorProblem[]
  /** The box being dragged out on empty space, in content coordinates. */
  marquee: Box | null
}

export const NO_SELECTION: string[] = []
export const NO_STEPS: StepRef[] = []
export const NO_EDGES: EdgeSelection[] = []
export const NO_PROBLEMS: EditorProblem[] = []

// The problems in a job itself, or in one of its steps.
export const problemsIn = (problems: EditorProblem[], job: string, step?: number) =>
  problems.filter((problem) => problem.job === job && problem.step === step)

export const sameStep = (a: StepRef, b: StepRef) => a.job === b.job && a.index === b.index

export type UiStore = Store<UiState>

/** The drawn grid of the level being edited; `rows` holds each box's row, `columns` each column's number. */
export interface GraphGrid {
  wrapper: HTMLDivElement
  cols: string[][][]
  rows: number[][]
  columns: number[]
}

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

/** What the editor asks of the graph's view. */
export interface GraphView {
  /** Keeps `job` where it is on screen through the next layout change, rather than refitting. */
  hold: (job: string) => void
}

export interface GraphEditorApi {
  store: UiStore
  /** The editor's strings, so what the graph draws for it needn't load them itself. */
  t: GraphEditorStrings
  isMatrixJob: (job: string) => boolean
  startDrag: (e: ReactPointerEvent, payload: DragPayload) => void
  openJobMenu: (x: number, y: number, job: string) => void
  openStepMenu: (x: number, y: number, job: string, index: number) => void
  openEdgeMenu: (x: number, y: number, edge: EdgeSelection) => void
  /** Selects a connector alone, or adds it to the selection or takes it out when `add`. */
  selectEdge: (edge: EdgeSelection, add: boolean) => void
  /** Whether an expression reads one of a connector's needs, so it can't be removed or moved. */
  edgeInUse: (edge: EdgeSelection) => boolean
  /** Starts moving one end of a connector; `fixed` is its other end, in the graph's own pixels. */
  startEdgeEnd: (
    e: ReactPointerEvent,
    edge: EdgeSelection,
    end: 'from' | 'to',
    fixed: Point,
  ) => void
  /** Removes the selected jobs, steps and connectors; false when nothing is selected. */
  deleteSelection: () => boolean
  /** Opens the dialog of the one selected job or step, reporting whether there was one. */
  editSelection: () => boolean
  addJob: (matrix: boolean) => void
  addStep: (job: string) => void
  editJob: (job: string) => void
  editStep: (job: string, index: number) => void
  registerGrid: (grid: GraphGrid | null) => void
  grid: () => GraphGrid | null
  registerView: (view: GraphView | null) => void
  /** The selected jobs that still exist. */
  selected: () => string[]
  toggleSelected: (job: string) => void
  /** The selected steps that still exist. */
  selectedSteps: () => StepRef[]
  toggleStep: (step: StepRef) => void
  /** Puts the selected jobs or steps on the clipboard, as YAML; null when nothing is selected. */
  copySelection: () => string | null
  /** Adds the jobs or steps in `text` near `pointer`; false when `text` holds neither. */
  paste: (text: string, pointer: Point | null) => boolean
  /** Moves the selected jobs one slot; false when no jobs are selected. */
  nudge: (direction: NudgeDirection) => boolean
  reveal: (target: RevealTarget) => void
  /** Selects a job, or one of its steps, alone. */
  focus: (target: { job: string; step?: number }) => void
}

const EditorContext = createContext<GraphEditorApi | null>(null)

export const GraphEditorProvider = EditorContext.Provider

export function useGraphEditor(): GraphEditorApi | null {
  return useContext(EditorContext)
}

const noopSubscribe = () => () => {}

export function useUi<T>(
  api: GraphEditorApi | null,
  select: (state: UiState) => T,
  fallback: T,
): T {
  return useSyncExternalStore(api ? api.store.subscribe : noopSubscribe, () =>
    api ? select(api.store.get()) : fallback,
  )
}

export function useSelectedEdges(api: GraphEditorApi | null): EdgeSelection[] {
  return useUi(api, (state) => state.edges, NO_EDGES)
}

export const sameEdge = (a: EdgeSelection, b: EdgeSelection) => a.from === b.from && a.to === b.to

export function toContent(wrapper: HTMLElement, client: Point): Point {
  const rect = wrapper.getBoundingClientRect()
  const scale = wrapper.offsetWidth > 0 ? rect.width / wrapper.offsetWidth : 1
  return { x: (client.x - rect.left) / scale, y: (client.y - rect.top) / scale }
}

export function contentBox(wrapper: HTMLElement, el: Element): Box {
  const rect = wrapper.getBoundingClientRect()
  const scale = wrapper.offsetWidth > 0 ? rect.width / wrapper.offsetWidth : 1
  const r = el.getBoundingClientRect()
  return {
    left: (r.left - rect.left) / scale,
    top: (r.top - rect.top) / scale,
    right: (r.right - rect.left) / scale,
    bottom: (r.bottom - rect.top) / scale,
  }
}

const SELECTION_PAD = 12
// Past a node's edge by more than a circle's width, so the two sets of circles never touch.
const SELECTION_SIDE_PAD = 36

/**
 * The outline around the selected jobs, in content coordinates: as tall as their rows and
 * as wide as their nodes, so its circles sit clear of the nodes' own.
 */
export function selectionBounds(
  wrapper: HTMLElement,
  jobs: string[],
): (Box & { connectorY: number }) | null {
  const found = jobs.flatMap((job) => {
    const row = wrapper.querySelector(`[data-dag-job="${CSS.escape(job)}"]`)
    const node = row?.closest('[id^="node_"]')
    const first = node?.querySelector('[data-dag-job]')
    return row && node && first
      ? [
          {
            row: contentBox(wrapper, row),
            node: contentBox(wrapper, node),
            first: contentBox(wrapper, first),
          },
        ]
      : []
  })
  if (found.length === 0) {
    return null
  }
  // The circles go level with the nodes' own: where a node's connectors would meet a row were
  // it the node's first, halfway between the top and bottom rows.
  const connectors = found.map((f) => f.node.top + NODE_CONNECTOR_Y + f.row.top - f.first.top)
  return {
    left: Math.min(...found.map((f) => f.node.left)) - SELECTION_SIDE_PAD,
    top: Math.min(...found.map((f) => f.row.top)) - SELECTION_PAD,
    right: Math.max(...found.map((f) => f.node.right)) + SELECTION_SIDE_PAD,
    bottom: Math.max(...found.map((f) => f.row.bottom)) + SELECTION_PAD,
    connectorY: (Math.min(...connectors) + Math.max(...connectors)) / 2,
  }
}
const TEXT_INPUT = 'input, textarea, select, [contenteditable="true"]'

export const typing = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest(TEXT_INPUT)

export function overlaps(rect: DOMRect, box: Box): boolean {
  return (
    rect.left <= box.right &&
    rect.right >= box.left &&
    rect.top <= box.bottom &&
    rect.bottom >= box.top
  )
}
