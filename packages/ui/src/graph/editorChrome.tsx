import cx from 'classnames'
import { type ReactNode, type PointerEvent as ReactPointerEvent, useSyncExternalStore } from 'react'
import { IconButton } from '../components/IconButton'
import { TOOLTIP_ID } from '../components/Tooltip'
import { RedoIcon, SettingsIcon, UndoIcon } from '../icons'
import { useGraphEditorStrings } from './editorStrings'
import type { DependencyGraphEditor } from './GraphEditor'
import { ProblemsButton } from './ProblemsButton'
import { type ShortcutGroup, ShortcutsButton } from './ShortcutsButton'

export interface Point {
  x: number
  y: number
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** A small store for an editor's view state, so a change redraws only what reads it. */
export function createStore<T extends object>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch }
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type Store<T extends object> = ReturnType<typeof createStore<T>>

export function useStore<T extends object, V>(store: Store<T>, select: (state: T) => V): V {
  return useSyncExternalStore(store.subscribe, () => select(store.get()))
}

// A press becomes a drag once the pointer has moved this far, so a click stays a click.
const DRAG_THRESHOLD = 4

function suppressNextClick() {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    window.removeEventListener('click', swallow, true)
  }
  window.addEventListener('click', swallow, true)
  setTimeout(() => window.removeEventListener('click', swallow, true), 0)
}

interface DragOptions {
  /** Each move, once the pointer has gone past the threshold. */
  onMove?: (client: Point) => void
  /** The release; `dragged` tells a drag from a click. */
  onEnd?: (client: Point, dragged: boolean) => void
  /** A cancelled pointer, or Escape when `escape` is on. */
  onCancel?: (dragged: boolean) => void
  /** Escape cancels the press, and goes no further. */
  escape?: boolean
  /** Keeps the page's text from selecting: from the press, or once it is a drag. */
  holdText?: 'press' | 'drag'
  /** The click after the release: swallowed always, only after a drag, or never. */
  swallowClick?: 'always' | 'drag' | 'never'
}

/** Follows a press from `start` until it's released or cancelled. */
export function trackDrag(
  start: Point,
  { onMove, onEnd, onCancel, escape = false, holdText, swallowClick = 'never' }: DragOptions,
) {
  let dragged = false
  const cleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key, true)
    if (holdText) {
      document.body.style.userSelect = ''
    }
  }
  const move = (ev: PointerEvent) => {
    if (!dragged && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) {
      return
    }
    if (!dragged && holdText === 'drag') {
      document.body.style.userSelect = 'none'
    }
    dragged = true
    onMove?.({ x: ev.clientX, y: ev.clientY })
  }
  const up = (ev: PointerEvent) => {
    cleanup()
    if (swallowClick === 'always' || (swallowClick === 'drag' && dragged)) {
      suppressNextClick()
    }
    onEnd?.({ x: ev.clientX, y: ev.clientY }, dragged)
  }
  const cancel = () => {
    cleanup()
    onCancel?.(dragged)
  }
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') {
      return
    }
    ev.stopPropagation()
    if (dragged && swallowClick !== 'never') {
      suppressNextClick()
    }
    cancel()
  }
  if (holdText === 'press') {
    document.body.style.userSelect = 'none'
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  if (escape) {
    window.addEventListener('keydown', key, true)
  }
}

export function place(box: Box) {
  return {
    left: box.left,
    top: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
  }
}

/** The box a shift + drag draws, in its layer's coordinates. */
export function MarqueeBox({ box, className }: { box: Box; className?: string }) {
  return (
    <div
      className={cx(
        'absolute rounded-md border-2 border-dashed border-(--theme-element) bg-(--theme-element)/10',
        className,
      )}
      style={place(box)}
    />
  )
}

/** What a drag carries, beside the pointer at `at` in its layer's coordinates. */
export function DragLabel({
  at,
  text,
  refused = false,
}: {
  at: Point
  text: string
  refused?: boolean
}) {
  return (
    <div
      className={cx(
        'pointer-events-none absolute z-30 rounded-md border bg-(--theme-panel-bg) px-2 py-1 text-xs shadow',
        refused ? 'border-(--theme-error) text-(--theme-error)' : 'theme-border',
      )}
      style={{ left: at.x + 12, top: at.y + 12 }}
    >
      {text}
    </div>
  )
}

export function BarDivider() {
  return <div className="mx-0.5 h-5 w-px bg-(--theme-border)" />
}

/** A toolbar chip that adds something: click to add it, or drag it to where it goes. */
export function AddChip({
  icon,
  label,
  hint,
  className,
  onPointerDown,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint: string
  className?: string
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className={cx(
        'flex h-7 cursor-grab items-center gap-1 whitespace-nowrap rounded px-2 text-xs theme-hover',
        className,
      )}
      data-tooltip-id={TOOLTIP_ID}
      data-tooltip-content={hint}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

/** The bar both editors draw: problems, undo and redo, the editor's own controls, settings, shortcuts. */
export function EditorBar({
  editor,
  groups,
  className,
  children,
}: {
  editor: DependencyGraphEditor
  groups: ShortcutGroup[]
  className?: string
  children: ReactNode
}) {
  const t = useGraphEditorStrings()
  return (
    <div
      className={cx(
        'flex max-w-full flex-wrap items-center justify-end gap-0.5 rounded-md border theme-border bg-(--theme-panel-bg) p-0.5',
        className,
      )}
    >
      {!!editor.listedProblems?.length && (
        <>
          <ProblemsButton problems={editor.listedProblems} />
          <BarDivider />
        </>
      )}
      <IconButton
        icon={<UndoIcon className="h-4 w-4" />}
        label={t.undo}
        size="sm"
        variant="ghost"
        disabled={!editor.canUndo}
        onClick={editor.onUndo}
      />
      <IconButton
        icon={<RedoIcon className="h-4 w-4" />}
        label={t.redo}
        size="sm"
        variant="ghost"
        disabled={!editor.canRedo}
        onClick={editor.onRedo}
      />
      <BarDivider />
      {children}
      {editor.onOpenSettings && (
        <IconButton
          icon={<SettingsIcon className="h-4 w-4" />}
          label={t.workflowSettings}
          size="sm"
          variant="ghost"
          onClick={editor.onOpenSettings}
        />
      )}
      <ShortcutsButton groups={groups} />
    </div>
  )
}
