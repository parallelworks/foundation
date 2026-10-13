import { Button } from '@base-ui/react/button'
import { Menu } from '@base-ui/react/menu'
import { Toggle } from '@base-ui/react/toggle'
import { clsx as cx } from 'clsx'
import { createContext, Fragment, useContext, useLayoutEffect, useRef, useState } from 'react'
import { MenuItem, MenuLinkItem, MenuPopup } from '../components/Menu'
import { useLink, useStrings } from '../components/Provider'
import { Tooltip } from '../components/Tooltip'
import { CheckIcon, MenuIcon } from '../icons'

// True inside the `…` menu, so pre-rendered element items whose buttons
// normally render as chips restyle themselves as menu rows.
const OverflowMenuContext = createContext(false)

export interface ToolbarAction {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName?: string
  onClick?: (() => void) | undefined
  href?: string | undefined
  disabled?: boolean | undefined
  tooltip?: string | undefined
  /** Why the action is disabled, shown in place of the tooltip. */
  disabledReason?: string | undefined
  hidden?: boolean
  /** Makes the action a toggle, pressed while true; onClick flips it. */
  pressed?: boolean | undefined
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

function tooltipOf(action: ToolbarAction) {
  return action.disabled ? action.disabledReason : action.tooltip
}

export function ToolbarButton({ action }: { action: ToolbarAction }) {
  const inOverflowMenu = useContext(OverflowMenuContext)
  const Link = useLink()
  if (inOverflowMenu) {
    return <OverflowRow item={action} />
  }
  const off = action.pressed === false
  const className = cx(
    'inline-flex items-center gap-x-0.5 h-9 px-2 rounded-md text-[13.5px] uppercase font-semibold transition-colors whitespace-nowrap',
    off
      ? 'border theme-border theme-muted-text'
      : 'bg-(--theme-element) text-(--theme-element-text)',
    'data-disabled:opacity-50 data-disabled:cursor-not-allowed',
    !action.disabled &&
      (off
        ? 'cursor-pointer hover:theme-hover'
        : 'cursor-pointer hover:bg-(--theme-element-hover)'),
  )
  const Icon = action.icon
  const content = (
    <>
      <div className="h-6 flex items-center">
        <Icon className={cx('w-auto', action.iconClassName)} />
      </div>
      {action.label}
    </>
  )
  let control: React.ReactElement
  if (action.href && !action.disabled) {
    control = (
      <Link href={action.href} className={className}>
        {content}
      </Link>
    )
  } else if (action.pressed !== undefined) {
    control = (
      <Toggle
        pressed={action.pressed}
        onPressedChange={() => action.onClick?.()}
        disabled={action.disabled}
        className={className}
      >
        {content}
      </Toggle>
    )
  } else {
    // Focusable while disabled, so keyboard users can reach the reason.
    control = (
      <Button
        onClick={action.onClick}
        disabled={action.disabled}
        focusableWhenDisabled
        className={className}
      >
        {content}
      </Button>
    )
  }
  return (
    <Tooltip content={tooltipOf(action)} side="bottom">
      {control}
    </Tooltip>
  )
}

const overflowRowClassName = 'gap-x-1 px-4 py-2 uppercase font-semibold link'

/** A single overflowed item rendered as a full-width row inside the `…` menu. */
function OverflowRow({ item }: { item: ToolbarAction }) {
  const Link = useLink()
  const Icon = item.icon
  const content = (
    <>
      <div className="w-5 h-6 flex items-center">
        <Icon className={cx(item.iconClassName)} />
      </div>
      {item.label}
    </>
  )
  let row: React.ReactElement
  if (item.href && !item.disabled) {
    row = (
      <MenuLinkItem render={<Link href={item.href} />} className={overflowRowClassName}>
        {content}
      </MenuLinkItem>
    )
  } else if (item.pressed !== undefined) {
    row = (
      <Menu.CheckboxItem
        checked={item.pressed}
        onCheckedChange={() => item.onClick?.()}
        disabled={item.disabled}
        closeOnClick
        className={cx(
          'flex w-full items-center text-left text-[13px] cursor-pointer outline-none select-none data-highlighted:bg-(--theme-muted-panel-bg) data-disabled:cursor-not-allowed data-disabled:opacity-50',
          overflowRowClassName,
        )}
      >
        {content}
        <Menu.CheckboxItemIndicator className="ml-auto">
          <CheckIcon className="h-4 w-4 opacity-80" />
        </Menu.CheckboxItemIndicator>
      </Menu.CheckboxItem>
    )
  } else {
    row = (
      <MenuItem onClick={item.onClick} disabled={item.disabled} className={overflowRowClassName}>
        {content}
      </MenuItem>
    )
  }
  // Opens left, away from the menu panel, so the tooltip never covers other rows.
  return (
    <Tooltip content={tooltipOf(item)} side="left">
      {row}
    </Tooltip>
  )
}

function OverflowMenu({ items }: { items: ToolbarItem[] }) {
  const { list: t } = useStrings()
  return (
    <Menu.Root>
      <Tooltip content={t.moreActions}>
        <Menu.Trigger
          aria-label={t.moreActions}
          className="inline-flex items-center justify-center h-9 w-9 rounded-md border theme-border link hover:theme-hover transition-colors"
          data-testid="action-toolbar-menu-button"
        >
          <MenuIcon />
        </Menu.Trigger>
      </Tooltip>
      {/* Element items own their modal state (e.g. delete confirmations), and
          opening one closes the menu, so unmounting on close would destroy it. */}
      <MenuPopup keepMounted align="end" className="min-w-56">
        <OverflowMenuContext.Provider value={true}>
          {items.map((item) =>
            'element' in item ? (
              <Fragment key={item.key}>{item.element}</Fragment>
            ) : (
              <OverflowRow key={item.key} item={item} />
            ),
          )}
        </OverflowMenuContext.Provider>
      </MenuPopup>
    </Menu.Root>
  )
}

// Width reserved for the `…` overflow button (h-9 w-9 chip) plus its leading gap.
const MENU_BUTTON_WIDTH = 44
// gap-1 between toolbar chips.
const ITEM_GAP = 4

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
    <div ref={wrapRef} className="flex-1 min-w-0 flex items-center justify-end gap-1">
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

/** Pins a detail-page toolbar just below the sticky breadcrumb strip (top-10 matches the strip's 40px height). */
export const stickyToolbarClasses = 'sticky top-10 z-10 bg-(--theme-app-bg)'

/** Pins a detail-page tabs row under the pinned toolbar (top-22 = 40px strip + 48px toolbar block). */
export const stickyTabsClasses = 'sticky top-22 z-10 bg-(--theme-app-bg)'

/** Pins a detail-page tabs row directly under the breadcrumb strip when the page has no pinned toolbar (top-10 = the strip's height). */
export const stickyTabsUnderHeaderClasses = 'sticky top-10 z-10 bg-(--theme-app-bg)'

/** Action groups left, secondary actions right (collapsing into a `…` menu). */
export function ActionToolbar({
  groups,
  right = [],
  sticky = false,
}: {
  groups: ToolbarItem[][]
  right?: ToolbarItem[]
  /** Pin below the breadcrumb strip while the page scrolls. Requires the toolbar's parent to span the page content. */
  sticky?: boolean
}) {
  const visibleGroups = groups
    .map((group) => group.filter((a) => !a.hidden))
    .filter((group) => group.length > 0)
  const visibleRight = right.filter((a) => !a.hidden)
  return (
    <div className={cx('flex items-center gap-2.5', sticky && cx(stickyToolbarClasses, 'py-1.5'))}>
      {visibleGroups.length > 0 && (
        <div className="flex items-center gap-2.5 shrink-0">
          {visibleGroups.map((group, i) => (
            <Fragment key={group[0]?.key ?? i}>
              {i > 0 && <div className="w-px h-5 bg-(--theme-border)" />}
              <div className="flex items-center gap-1">
                {group.map((item) => (
                  <ToolbarItemView key={item.key} item={item} />
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      )}
      {visibleRight.length > 0 && <CollapsibleRight items={visibleRight} />}
    </div>
  )
}
