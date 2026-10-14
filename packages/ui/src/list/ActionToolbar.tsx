import { Button as BaseButton } from '@base-ui/react/button'
import { Menu } from '@base-ui/react/menu'
import { Toggle } from '@base-ui/react/toggle'
import { Toolbar } from '@base-ui/react/toolbar'
import {
  cloneElement,
  createContext,
  Fragment,
  use,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { AppLink } from '../components/AppLink'
import { buttonClasses } from '../components/buttonClasses'
import { MenuPopup } from '../components/Menu'
import { MenuEntries, useRunAction, warnIfInert } from '../components/MenuEntries'
import { useStrings } from '../components/Provider'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { MoreIcon } from '../icons'
import type { RowAction } from './rowMenu'

/** Where a ToolbarButton renders: one of an ActionToolbar's items, a row of its
 *  `…` menu, or a plain button with no toolbar around it. */
type Placement = 'toolbar' | 'menu' | 'alone'

// Pre-rendered element items can render a ToolbarButton, which then fits
// wherever the toolbar put the element: an item, or a row once it overflows.
const PlacementContext = createContext<Placement>('alone')

/** A toolbar button, which moves into the `…` menu as a row when the toolbar runs out of room. */
export type ToolbarAction = RowAction & {
  /** A hint on the enabled button. */
  tooltip?: string | undefined
  /** The one action the view leads to, filled in the accent. Give it to one
   *  action at most: the rest are outlined, so it stands out. */
  primary?: boolean | undefined
  hidden?: boolean
}

/** A pre-rendered element (e.g. a button component that owns its modal). */
interface ToolbarElement {
  key: string
  element: React.ReactNode
  hidden?: boolean
}

export type ToolbarItem = ToolbarAction | ToolbarElement

function ToolbarItemView({ item }: { item: ToolbarItem }) {
  if ('element' in item) {
    return <>{item.element}</>
  }
  return <ToolbarButton action={item} />
}

/** A toolbar action as a button: a link with `href`, a toggle with `checked`.
 *  In an ActionToolbar it is one of its items, reached with the arrow keys. */
export function ToolbarButton({ action }: { action: ToolbarAction }) {
  const placement = use(PlacementContext)
  const runAction = useRunAction()
  if (placement === 'menu') {
    return <MenuEntries entries={[action]} />
  }
  warnIfInert(action, 'ActionToolbar')
  // Outlined unless it's the view's one primary action, so the toolbar has a
  // hierarchy; a toggle shows its state by `aria-pressed` instead of a fill. A
  // destructive one reads in the error color, as it does in a menu.
  const primary = action.primary && action.checked === undefined
  const className = cx(
    buttonClasses({ variant: primary ? 'primary' : 'outline', size: 'sm' }),
    action.destructive && !primary && 'text-(--theme-error-text)',
  )
  const reason = action.disabled ? action.disabledReason : undefined
  const content = (
    <>
      {action.icon}
      {action.label}
      {/* The tooltip is only seen, so the reason is also part of the name. */}
      {reason && <span className="sr-only">. {reason}</span>}
    </>
  )
  const run = () => runAction(action)
  const inToolbar = placement === 'toolbar'
  let control: React.ReactElement
  if (action.href) {
    // A disabled link stays a link, without its href and still focusable.
    const link = (
      <AppLink
        href={action.href}
        reloadDocument={action.reloadDocument}
        target={action.target}
        disabled={action.disabled}
        className={className}
      />
    )
    control = inToolbar ? (
      <Toolbar.Link render={link}>{content}</Toolbar.Link>
    ) : (
      cloneElement(link, undefined, content)
    )
  } else if (action.checked !== undefined) {
    const toggle = (
      <Toggle
        pressed={action.checked}
        onPressedChange={run}
        disabled={action.disabled}
        className={className}
      />
    )
    control = inToolbar ? (
      <Toolbar.Button render={toggle} disabled={action.disabled}>
        {content}
      </Toolbar.Button>
    ) : (
      cloneElement(toggle, undefined, content)
    )
  } else {
    // Focusable while disabled, so keyboard users can reach the reason.
    const Control = inToolbar ? Toolbar.Button : BaseButton
    control = (
      <Control onClick={run} disabled={action.disabled} focusableWhenDisabled className={className}>
        {content}
      </Control>
    )
  }
  return (
    <Tooltip content={reason ?? action.tooltip} side="bottom">
      {control}
    </Tooltip>
  )
}

function OverflowMenu({ items }: { items: ToolbarItem[] }) {
  const { list: t } = useStrings()
  return (
    <Menu.Root>
      <Tooltip content={t.moreActions}>
        <Toolbar.Button
          render={<Menu.Trigger />}
          aria-label={t.moreActions}
          className={buttonClasses({ variant: 'outline', size: 'sm', iconOnly: true })}
          data-testid="action-toolbar-menu-button"
        >
          <MoreIcon />
        </Toolbar.Button>
      </Tooltip>
      {/* Element items own their modal state (e.g. delete confirmations), and
          opening one closes the menu, so unmounting on close would destroy it. */}
      <MenuPopup keepMounted align="end" className="min-w-56">
        <PlacementContext value="menu">
          {items.map((item) =>
            'element' in item ? (
              <Fragment key={item.key}>{item.element}</Fragment>
            ) : (
              <MenuEntries key={item.key} entries={[item]} />
            ),
          )}
        </PlacementContext>
      </MenuPopup>
    </Menu.Root>
  )
}

// gap-1 between toolbar items.
const ITEM_GAP = 4
// Width reserved for the `…` overflow button (a size-7 square) plus its leading gap.
const MENU_BUTTON_WIDTH = 28 + ITEM_GAP

function fitCount(widths: number[], available: number, gap: number, menuWidth: number) {
  if (widths.length === 0) {
    return 0
  }
  const totalAll = widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1)
  if (totalAll <= available) {
    return widths.length
  }
  // Something overflows, so reserve room for the menu button up front.
  let used = menuWidth
  let count = 0
  for (const w of widths) {
    if (used + gap + w > available) {
      break
    }
    used += gap + w
    count++
  }
  return count
}

/** Measures in a layout effect (before paint) so the inline/overflow split never flashes. */
function CollapsibleRight({ items }: { items: ToolbarItem[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const widthCache = useRef<Record<string, number>>({})
  const [available, setAvailable] = useState(Number.POSITIVE_INFINITY)
  const [count, setCount] = useState(items.length)

  // Track the width flexbox allocates to this cluster.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) {
      return
    }
    const update = () => setAvailable(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Measure the inline items, cache their widths, and recompute the split.
  // Runs every render (cheap) but only re-renders when the split changes, so
  // it converges within a paint instead of flashing.
  useLayoutEffect(() => {
    for (const key in itemRefs.current) {
      const el = itemRefs.current[key]
      if (el) {
        widthCache.current[key] = el.offsetWidth
      }
    }
    const widths = items.map((item) => widthCache.current[item.key] ?? 0)
    const next = fitCount(widths, available, ITEM_GAP, MENU_BUTTON_WIDTH)
    setCount((prev) => (prev === next ? prev : next))
  })

  const visible = items.slice(0, count)
  const overflow = items.slice(count)

  return (
    // At least the `…` button's width, so the cluster keeps it in view however
    // narrow the page.
    <div ref={wrapRef} className="flex min-w-7 flex-1 items-center justify-end gap-1">
      {visible.map((item) => (
        <span
          key={item.key}
          ref={(el) => {
            itemRefs.current[item.key] = el
          }}
          className="inline-flex shrink-0"
        >
          <ToolbarItemView item={item} />
        </span>
      ))}
      {overflow.length > 0 && <OverflowMenu items={overflow} />}
    </div>
  )
}

/** Pins a toolbar to the top of the page's scroll area while the content scrolls under it. */
export const stickyToolbarClasses = 'sticky top-0 z-(--layer-sticky) bg-(--theme-app-bg)'

/** A view's controls in one WAI-ARIA toolbar: a single tab stop, with the arrow
 *  keys moving between its items, disabled ones included so their reasons stay
 *  reachable. Action groups sit on the left and wrap onto more lines in a narrow
 *  view; `right` holds secondary actions, which fold into a `…` menu when the
 *  toolbar runs out of room. Mark the one action the view leads to `primary`. */
export function ActionToolbar({
  groups,
  right = [],
  sticky = false,
  label,
}: {
  groups: ToolbarItem[][]
  right?: ToolbarItem[]
  /** Pins it to the top of the page's scroll area while the page scrolls. */
  sticky?: boolean
  /** Names the toolbar for assistive technology, such as "Log controls";
   *  defaults to "Actions". */
  label?: string | undefined
}) {
  const { common } = useStrings()
  const visibleGroups = groups
    .map((group) => group.filter((a) => !a.hidden))
    .filter((group) => group.length > 0)
  const visibleRight = right.filter((a) => !a.hidden)
  warnIfManyPrimary([...visibleGroups.flat(), ...visibleRight])
  return (
    <Toolbar.Root
      aria-label={label ?? common.actions}
      className={cx(
        '@container flex flex-wrap items-center gap-x-2.5 gap-y-1.5',
        sticky && cx(stickyToolbarClasses, 'py-1.5'),
      )}
    >
      <PlacementContext value="toolbar">
        {visibleGroups.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {visibleGroups.map((group, i) => (
              <Fragment key={group[0]?.key ?? i}>
                {i > 0 && (
                  // Hidden where the groups may wrap, so none hangs at a line's end;
                  // the wider gap still sets the groups apart.
                  <Toolbar.Separator
                    orientation="vertical"
                    className="h-5 w-px bg-(--theme-border) @max-2xl:hidden"
                  />
                )}
                <Toolbar.Group className="flex flex-wrap items-center gap-1">
                  {group.map((item) => (
                    <ToolbarItemView key={item.key} item={item} />
                  ))}
                </Toolbar.Group>
              </Fragment>
            ))}
          </div>
        )}
        {visibleRight.length > 0 && <CollapsibleRight items={visibleRight} />}
      </PlacementContext>
    </Toolbar.Root>
  )
}

const warnedPrimary = new Set<string>()

/** Warns in development when more than one action is primary: the fill marks
 *  the one next step, so two of them mark none. */
function warnIfManyPrimary(items: ToolbarItem[]) {
  // Checked first and on its own, so a production build drops the rest.
  if (process.env.NODE_ENV === 'production') {
    return
  }
  const labels = items.flatMap((item) => ('label' in item && item.primary ? [item.label] : []))
  const names = labels.map((label) => `"${label}"`).join(', ')
  if (labels.length < 2 || warnedPrimary.has(names)) {
    return
  }
  warnedPrimary.add(names)
  console.warn(`ActionToolbar: ${names} are all primary; mark one action at most.`)
}
