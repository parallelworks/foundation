import {
  createContext,
  type MouseEvent,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { LinkTarget } from '../components/AppLink'
import type { OpenMenu } from '../components/ContextMenu'
import {
  SHARED_COLLAPSED_GROUPS_STORAGE_KEY,
  useCollapsedGroups,
} from '../components/collapsedGroups'
import type { MenuEntry } from '../components/MenuEntries'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { AddIcon, ArrowLeftIcon, MoreIcon } from '../icons'
import { AppFrameNavGroup, AppFrameNavItem, useAppFrame } from './index'
import { PlacementContext } from './placement'

interface Takeover {
  /** Where a page's list renders; null while the app's own navigation shows. */
  slot: HTMLElement | null
  showList: () => void
}

const TakeoverContext = createContext<Takeover>({ slot: null, showList: () => {} })

export interface AppFrameTakeoverState {
  /** A page's list has the navigation. */
  active: boolean
  /** In place of the app's navigation while active: the element the list renders into. */
  navigation: ReactNode
  /** Leaves the list for the app's navigation, staying on the page. */
  showNavigation: () => void
  /** Brings the list back after `showNavigation`, such as when the reader picks the page's own
   *  item in the app's navigation. */
  showList: () => void
  /** Give to `AppFrameTakeover`. */
  takeover: Takeover
}

/** A page's own list, such as its conversations, can take the place of the app's navigation
 *  rather than open a second drawer on a narrow screen or a second column on a wide one. The host
 *  owns the frame and the page owns the list, so the host holds this: it renders `navigation` in
 *  the frame while `active`, and wraps the frame in `AppFrameTakeover` so the page's
 *  `AppFrameListTakeover` or `AppFrameTakeoverContent` finds its place. `enabled` is the host's
 *  call, such as a page that has a list. */
export function useAppFrameTakeover(enabled: boolean): AppFrameTakeoverState {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [showingNavigation, setShowingNavigation] = useState(false)
  const active = enabled && !showingNavigation
  const showList = useCallback(() => setShowingNavigation(false), [])
  const showNavigation = useCallback(() => setShowingNavigation(true), [])
  const takeover = useMemo(
    () => ({ slot: active ? slot : null, showList }),
    [active, slot, showList],
  )
  return {
    active,
    navigation: <div ref={setSlot} className="space-y-1" />,
    showNavigation,
    showList,
    takeover,
  }
}

/** Renders a page's own content in place of the app's navigation while the page has it, and
 *  nothing while the app's navigation shows. What it renders reads where it is from
 *  `useAppFrameNavigationPlacement`, as `ConversationSidebar` does to become the navigation's
 *  list rather than a column beside the page. */
export function AppFrameTakeoverContent({ children }: { children: ReactNode }) {
  const { slot, showList } = use(TakeoverContext)
  const { expanded, isMobile, mobileOpen } = useAppFrame()
  const placement = useMemo(() => ({ collapsed: !expanded }), [expanded])

  // Leaving for the app's navigation is a detour: the drawer opens on the list again next time.
  useEffect(() => {
    if (isMobile && !mobileOpen) {
      showList()
    }
  }, [isMobile, mobileOpen, showList])

  return slot
    ? createPortal(<PlacementContext value={placement}>{children}</PlacementContext>, slot)
    : null
}

export function AppFrameTakeover({ value, children }: { value: Takeover; children: ReactNode }) {
  return <TakeoverContext value={value}>{children}</TakeoverContext>
}

/** Atop a list that has the navigation: back to the app's own, staying on the page. The rail
 *  shows its arrow alone, named by the label. */
export function AppFrameTakeoverBack({
  onBack,
  label = 'Main menu',
  className,
}: {
  onBack: () => void
  label?: string
  className?: string
}) {
  const { expanded } = useAppFrame()
  const button = (
    <button
      type="button"
      onClick={onBack}
      aria-label={expanded ? undefined : label}
      className={cx(
        'flex min-w-0 items-center gap-2 rounded-md py-1 text-(--theme-sidebar-text,var(--theme-muted-text-color)) transition-colors hover:bg-(--theme-sidebar-hover,var(--theme-hover))',
        expanded ? 'flex-1 px-1.5' : 'h-9 w-full justify-center',
        className,
      )}
    >
      <ArrowLeftIcon className="h-4 w-4 shrink-0" />
      {expanded && <span className="truncate text-sm font-medium">{label}</span>}
    </button>
  )
  return expanded ? (
    button
  ) : (
    <Tooltip content={label} side="right" delay={0}>
      {button}
    </Tooltip>
  )
}

export type AppFrameTakeoverRow = LinkTarget & {
  key: string
  label: string
  /** For a row that is not a link, such as in an app with no addresses. */
  onClick?: ((event: MouseEvent<HTMLElement>) => void) | undefined
  /** The same mark, time and second line the list's own row shows. */
  leading?: ReactNode
  time?: ReactNode
  detail?: ReactNode
  selected: boolean
  menuItems: MenuEntry[]
}

export interface AppFrameTakeoverGroup {
  /** Also what remembers the group folded, so keep it the same across renders and visits. */
  key: string
  label: string
  rows: AppFrameTakeoverRow[]
}

/** A page's list as the frame's navigation, rendered into the host's place for it while there
 *  is one. Each row carries its actions behind a button that is always shown, since a touch
 *  screen has no hover to reveal it. A group's heading folds its rows away, and the list
 *  remembers it folded; a folded group shows how many rows it holds. */
export function AppFrameListTakeover({
  header,
  newItem,
  top,
  groups,
  groupsStorageKey = SHARED_COLLAPSED_GROUPS_STORAGE_KEY,
  empty,
  openMenu,
  moreLabel = 'More actions',
  children,
}: {
  /** Above the new item, such as an `AppFrameNavSwitch` between this list and a sibling's. */
  header?: ReactNode
  /** Starts a new one, above the list. */
  newItem: LinkTarget & {
    label: string
    selected: boolean
    onClick?: ((event: MouseEvent<HTMLElement>) => void) | undefined
  }
  /** Under the new item, above the list: more `AppFrameNavItem`s, such as one that opens a
   *  search. */
  top?: ReactNode
  groups: AppFrameTakeoverGroup[]
  /** Where the groups the reader folded are remembered. Give the same one as the list this
   *  stands in for, such as a `ConversationSidebar`'s, so both fold the same groups. */
  groupsStorageKey?: string
  /** In place of the groups when there are none. */
  empty?: ReactNode
  openMenu: OpenMenu
  /** Names each row's menu button. */
  moreLabel?: string
  /** The list's menus and dialogs, rendered outside the navigation. */
  children?: ReactNode
}) {
  const collapsedGroups = useCollapsedGroups(groupsStorageKey)

  const { label: newLabel, selected: newSelected, onClick: onNew, ...newTarget } = newItem
  return (
    <>
      <AppFrameTakeoverContent>
        {header}
        <div className="space-y-1">
          <AppFrameNavItem
            {...newTarget}
            {...(onNew ? { onClick: onNew } : {})}
            icon={<AddIcon />}
            label={newLabel}
            selected={newSelected}
          />
          {top}
        </div>
        {groups.length === 0 && empty}
        {groups.map((group) => (
          <AppFrameNavGroup
            key={group.key}
            label={group.label}
            open={!collapsedGroups.collapsed.has(group.key)}
            onOpenChange={() => collapsedGroups.toggle(group.key)}
            count={group.rows.length}
            selected={group.rows.some((row) => row.selected)}
          >
            {group.rows.map(
              ({ key, label, leading, time, detail, selected, menuItems, onClick, ...target }) => (
                <AppFrameNavItem
                  key={key}
                  {...target}
                  {...(onClick ? { onClick } : {})}
                  icon={leading}
                  label={label}
                  badge={
                    time && (
                      // The row keeps room for its menu button, which a pointer only shows on hover: the time takes that room until then.
                      <span className="inline-block [@media(hover:hover)]:-me-6 [@media(hover:hover)]:[.pw-frame-nav-row:focus-within_&]:invisible [@media(hover:hover)]:[.pw-frame-nav-row:hover_&]:invisible">
                        {time}
                      </span>
                    )
                  }
                  detail={detail}
                  selected={selected}
                  action={
                    <button
                      type="button"
                      aria-label={moreLabel}
                      onClick={(event) => openMenu(event.currentTarget, menuItems)}
                      className="rounded-md p-1.5 transition-colors hover:bg-(--theme-sidebar-hover,var(--theme-hover))"
                    >
                      <MoreIcon className="h-4 w-4" />
                    </button>
                  }
                />
              ),
            )}
          </AppFrameNavGroup>
        ))}
      </AppFrameTakeoverContent>
      {children}
    </>
  )
}
