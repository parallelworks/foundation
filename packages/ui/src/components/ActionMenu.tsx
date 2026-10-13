import { Menu } from '@base-ui/react/menu'
import { Fragment, type ReactNode } from 'react'
import { MenuItem, MenuLinkItem, MenuPopup, MenuSeparator } from './Menu'
import { useLink } from './Provider'
import { Tooltip } from './Tooltip'

export interface ActionMenuItem {
  label: string
  icon?: ReactNode
  /** Navigates instead of calling onClick. */
  href?: string | undefined
  onClick?: (() => void) | undefined
  disabled?: boolean | undefined
  /** Why the item is disabled, shown on hover and read with its name. */
  disabledReason?: string | undefined
  separatorAbove?: boolean | undefined
}

/** A trigger that opens a list of actions, such as a header's "New" button. */
export function ActionMenu({
  items,
  label,
  triggerClassName,
  children,
}: {
  items: ActionMenuItem[]
  /** Names the trigger, which usually shows only an icon, and labels its tooltip. */
  label: string
  triggerClassName?: string | undefined
  /** The trigger's content. */
  children: ReactNode
}) {
  const Link = useLink()
  return (
    <Menu.Root>
      <Tooltip content={label}>
        <Menu.Trigger aria-label={label} className={triggerClassName}>
          {children}
        </Menu.Trigger>
      </Tooltip>
      <MenuPopup className="min-w-52">
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.separatorAbove && <MenuSeparator />}
            {item.href && !item.disabled ? (
              <MenuLinkItem render={<Link href={item.href} />}>
                {item.icon}
                {item.label}
              </MenuLinkItem>
            ) : (
              <Tooltip content={item.disabled ? item.disabledReason : undefined}>
                <MenuItem disabled={item.disabled} onClick={item.onClick}>
                  {item.icon}
                  {item.label}
                  {item.disabled && item.disabledReason && (
                    <span className="sr-only">. {item.disabledReason}</span>
                  )}
                </MenuItem>
              </Tooltip>
            )}
          </Fragment>
        ))}
      </MenuPopup>
    </Menu.Root>
  )
}
