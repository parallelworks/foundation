import { Drawer as BaseDrawer } from '@base-ui/react/drawer'
import { clsx as cx } from 'clsx'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { CloseIcon } from '../icons'
import { portalContainer } from './floating'
import { useStrings } from './Provider'

const KEYBOARD_STEP_PX = 16

export interface DrawerProps
  extends Omit<BaseDrawer.Popup.Props, 'className' | 'children' | 'render' | 'title'> {
  open: boolean
  onClose: () => void
  /** The header's heading, which names the drawer. Without one, name it with `aria-label`. */
  title?: ReactNode
  /** A line under the title. */
  description?: ReactNode
  /** Actions along the bottom edge, such as Cancel and Save; they stay in view as the body scrolls. */
  footer?: ReactNode
  /** The edge it slides in from, and the way a swipe dismisses it. */
  side?: 'left' | 'right'
  /** Its width: pixels, or any CSS length such as `'100%'` for as wide as the space allows. */
  width?: number | string
  /** Adds a handle on the inner edge that drags, or arrow keys move, to change the width. */
  resizable?: boolean
  /** The narrowest a drag leaves it, in pixels. */
  minWidth?: number
  /** False ignores the backdrop and Escape, so typed input isn't lost to a stray
   *  click; the drawer's own buttons still close it. */
  dismissible?: boolean
  /** True dims the page behind it, locks its scroll and keeps focus inside;
   *  `'trap-focus'` dims and keeps focus but leaves the page's scroll alone, as an
   *  embedded panel wants; false is a side panel the page stays usable beside. */
  modal?: boolean | 'trap-focus'
  /** False drops the header's close button, for a drawer whose footer closes it. */
  closeButton?: boolean
  /** Covers its nearest positioned ancestor instead of the window, as a drawer
   *  inside an embedded panel does. */
  contained?: boolean
  /** Keeps the content mounted while closed, so its scroll and state survive. */
  keepMounted?: boolean
  /** False drops the body's padding, for content that fills the drawer edge to edge. */
  padded?: boolean
  /** On the body. */
  className?: string
  children: ReactNode
}

/** A panel that slides in from an edge over the page. A swipe toward that edge,
 *  Escape or a press outside closes it, and focus returns where it was.
 *
 *  A host whose chrome should stay uncovered sets `--ds-drawer-top` (for a top
 *  bar) and `--ds-drawer-gutter` (the strip left beside the drawer at its widest,
 *  2.5rem by default) on an ancestor. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  side = 'right',
  width = 480,
  resizable = false,
  minWidth = 320,
  dismissible = true,
  modal = true,
  closeButton = true,
  contained = false,
  keepMounted = false,
  padded = true,
  className,
  children,
  ...popupProps
}: DrawerProps) {
  const strings = useStrings().drawer
  const container = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const header = title !== undefined || description !== undefined || closeButton
  // A contained drawer fills its container; one over the window leaves the host's top bar uncovered.
  const area = contained
    ? 'absolute inset-0'
    : 'fixed inset-x-0 bottom-0 top-[var(--ds-drawer-top,0px)]'

  const onOpenChange = (next: boolean, details: BaseDrawer.Root.ChangeEventDetails) => {
    if (next) {
      return
    }
    if (!dismissible && details.reason === 'escape-key') {
      details.cancel()
      return
    }
    onClose()
  }

  return (
    <BaseDrawer.Root
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection={side}
      modal={modal}
      disablePointerDismissal={!dismissible}
    >
      {contained && <div ref={container} className="contents" />}
      <BaseDrawer.Portal
        container={contained ? container : portalContainer()}
        keepMounted={keepMounted}
        className={contained ? 'contents' : undefined}
      >
        {modal !== false && (
          <BaseDrawer.Backdrop
            className={cx(
              area,
              'z-[9980] bg-black/40 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 motion-reduce:transition-none',
            )}
          />
        )}
        <BaseDrawer.Viewport
          ref={viewport}
          className={cx(
            area,
            // Passes presses through to the page beside the drawer when it isn't modal.
            'pointer-events-none z-[9980] flex',
            side === 'right'
              ? 'justify-end pl-[var(--ds-drawer-gutter,2.5rem)]'
              : 'justify-start pr-[var(--ds-drawer-gutter,2.5rem)]',
          )}
        >
          <BaseDrawer.Popup
            {...popupProps}
            ref={popup}
            className={cx(
              'pointer-events-auto relative flex h-full max-w-full flex-col border-(--theme-border) bg-(--theme-panel-bg) text-(--theme-app) shadow-xl outline-none',
              side === 'right' ? 'border-l' : 'border-r',
              'transition-transform duration-300 ease-in-out [transform:translateX(var(--drawer-swipe-movement-x))] data-swiping:select-none data-swiping:duration-0 motion-reduce:transition-none',
              side === 'right'
                ? 'data-ending-style:[transform:translateX(100%)] data-starting-style:[transform:translateX(100%)]'
                : 'data-ending-style:[transform:translateX(-100%)] data-starting-style:[transform:translateX(-100%)]',
            )}
            style={{ width: dragWidth ?? width }}
          >
            {resizable && (
              <ResizeHandle
                side={side}
                width={dragWidth}
                minWidth={minWidth}
                popup={popup}
                viewport={viewport}
                onWidth={setDragWidth}
                label={strings.resize}
                valueText={strings.width}
              />
            )}
            <BaseDrawer.Content className="flex min-h-0 flex-1 flex-col">
              {header && (
                <div className="flex shrink-0 items-start gap-3 border-b border-(--theme-border) px-4 py-3">
                  <div className="min-w-0 flex-1">
                    {title !== undefined && (
                      <BaseDrawer.Title className="truncate text-sm font-semibold">
                        {title}
                      </BaseDrawer.Title>
                    )}
                    {description !== undefined && (
                      <BaseDrawer.Description className="mt-0.5 text-xs text-(--theme-muted-text-color)">
                        {description}
                      </BaseDrawer.Description>
                    )}
                  </div>
                  {closeButton && (
                    <BaseDrawer.Close
                      aria-label={strings.close}
                      className="-m-1 shrink-0 cursor-pointer rounded-md p-1 text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app)"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </BaseDrawer.Close>
                  )}
                </div>
              )}
              <div
                className={cx(
                  'relative flex min-h-0 flex-1 flex-col overflow-y-auto',
                  padded && 'p-4',
                  className,
                )}
              >
                {children}
              </div>
              {footer && (
                <div className="flex shrink-0 justify-end gap-2 border-t border-(--theme-border) px-4 py-3">
                  {footer}
                </div>
              )}
            </BaseDrawer.Content>
          </BaseDrawer.Popup>
        </BaseDrawer.Viewport>
      </BaseDrawer.Portal>
    </BaseDrawer.Root>
  )
}

/** The inner edge's splitter: a drag, or arrow keys, set the width between
 *  `minWidth` and the space the viewport leaves beside its gutter. */
function ResizeHandle({
  side,
  width,
  minWidth,
  popup,
  viewport,
  onWidth,
  label,
  valueText,
}: {
  side: 'left' | 'right'
  width: number | null
  minWidth: number
  popup: { current: HTMLDivElement | null }
  viewport: { current: HTMLDivElement | null }
  onWidth: (width: number) => void
  label: string
  valueText: (px: number) => string
}) {
  const drag = useRef<{ x: number; width: number } | null>(null)
  // The handle sits on the left of a right-hand drawer, so moving it left widens it.
  const grows = side === 'right' ? -1 : 1

  const maxWidth = () => {
    const el = viewport.current
    // Not laid out, as in a test: leave the width to the drawer's CSS max-width.
    if (!el?.clientWidth) {
      return Number.POSITIVE_INFINITY
    }
    const style = getComputedStyle(el)
    return (
      el.clientWidth -
      (Number.parseFloat(style.paddingLeft) || 0) -
      (Number.parseFloat(style.paddingRight) || 0)
    )
  }
  // The width the drawer renders at, which its CSS may hold below the width asked for.
  const [rendered, setRendered] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = popup.current
    if (!el) {
      return
    }
    const measure = () => setRendered(el.getBoundingClientRect().width || null)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [popup])
  const clamp = (px: number) => Math.round(Math.max(minWidth, Math.min(px, maxWidth())))
  const current = () => width ?? rendered ?? minWidth

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, width: current() }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      onWidth(clamp(drag.current.width + (e.clientX - drag.current.x) * grows))
    }
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const direction = { ArrowLeft: -1, ArrowRight: 1 }[e.key]
    if (direction !== undefined) {
      onWidth(clamp(current() + direction * grows * KEYBOARD_STEP_PX))
    } else if (e.key === 'Home') {
      onWidth(minWidth)
    } else if (e.key === 'End') {
      onWidth(clamp(Number.POSITIVE_INFINITY))
    } else {
      return
    }
    e.preventDefault()
  }

  const now = Math.round(current())
  return (
    // biome-ignore lint/a11y/useSemanticElements: a window splitter is focusable and full height; <hr> can't host the drag surface.
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={now}
      aria-valuemin={minWidth}
      aria-valuetext={valueText(now)}
      tabIndex={0}
      // Its drag resizes; it mustn't also swipe the drawer shut.
      data-base-ui-swipe-ignore=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={cx(
        'absolute inset-y-0 z-[1] w-1.5 cursor-ew-resize touch-none transition-colors hover:bg-(--theme-border) focus-visible:bg-(--theme-link) focus-visible:outline-none',
        side === 'right' ? '-left-0.75' : '-right-0.75',
      )}
    />
  )
}
