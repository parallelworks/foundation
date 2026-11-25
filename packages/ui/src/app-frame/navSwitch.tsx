import { type MouseEvent, type ReactNode, useId } from 'react'
import { AppLink, isPlainClick, type LinkTarget } from '../components/AppLink'
import { AppFrameNavItem, useAppFrame } from './index'

export interface AppFrameNavSwitchItem extends Omit<LinkTarget, 'href'> {
  href: string
  label: string
  icon: ReactNode
  /** Its page is the one showing. */
  selected: boolean
  /** Such as a count, read after the label, so give it its words (`CountBadge`'s `label`). */
  badge?: ReactNode
  onClick?: (event: MouseEvent<HTMLElement>) => void
}

/** Sibling places in the navigation, such as lists of two kinds that share it, as one control:
 *  side by side while the sidebar is open, and the items' icons in the rail. Each is a link, and
 *  the one showing is the current page. Two or three fit; more belong in the navigation itself. */
export function AppFrameNavSwitch({
  label,
  items,
}: {
  /** Names the group of links. */
  label: string
  items: AppFrameNavSwitchItem[]
}) {
  const { expanded } = useAppFrame()
  if (!expanded) {
    return (
      <nav aria-label={label} className="pw-frame-nav-switch-rail">
        {items.map(({ href, ...item }) => (
          <AppFrameNavItem key={href} href={href} {...item} />
        ))}
      </nav>
    )
  }
  return (
    <nav aria-label={label} className="pw-frame-nav-switch">
      {items.map((item) => (
        <SwitchItem key={item.href} {...item} />
      ))}
    </nav>
  )
}

function SwitchItem({
  href,
  label,
  icon,
  selected,
  badge,
  onClick,
  reloadDocument,
  target,
}: AppFrameNavSwitchItem) {
  const { closeNavigation } = useAppFrame()
  const id = useId()
  const [labelId, badgeId] = [`${id}-label`, `${id}-badge`]
  return (
    <AppLink
      href={href}
      reloadDocument={reloadDocument}
      target={target}
      className="pw-frame-nav-switch-item"
      // The label and badge name it, apart, as a navigation item's do.
      aria-labelledby={badge == null ? undefined : `${labelId} ${badgeId}`}
      aria-current={selected ? 'page' : undefined}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented && isPlainClick(event)) {
          closeNavigation()
        }
      }}
    >
      <span className="pw-frame-nav-switch-icon" aria-hidden="true">
        {icon}
      </span>
      <span id={labelId} className="pw-frame-nav-label">
        {label}
      </span>
      {badge != null && (
        <span id={badgeId} className="pw-frame-nav-switch-badge">
          {badge}
        </span>
      )}
    </AppLink>
  )
}
