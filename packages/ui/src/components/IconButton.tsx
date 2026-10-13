import { clsx as cx } from 'clsx'
import { type ComponentPropsWithRef, type ReactNode, useCallback, useRef } from 'react'
import { useShortcutKey } from './shortcutKey'
import { Tooltip } from './Tooltip'

/** The outline look on its own, for a link or control that sits among outline icon buttons. */
export const iconButtonOutlineClasses =
  'relative flex h-7 w-7 items-center justify-center rounded-md border border-(--theme-border) text-(--theme-muted-text-color) hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5'

export interface IconButtonProps extends ComponentPropsWithRef<'button'> {
  icon: ReactNode
  /** The accessible name, also shown as the tooltip. */
  label: string
  /** `outline` is the bordered square of a toolbar or page header strip. */
  variant?: 'default' | 'ghost' | 'primary' | 'success' | 'outline'
  /** The outline variant has one size of its own. */
  size?: 'sm' | 'md' | 'lg'
  /** Selected, or for the outline variant, narrowing what the page shows: it gains a dot. */
  active?: boolean
  /** A single key, such as F, that presses the button from anywhere on the page
   *  outside a text field. Also shown in the tooltip. */
  shortcut?: string | undefined
}

const sizeClasses = {
  sm: 'w-7 h-7 [&_svg]:w-3.5 [&_svg]:h-3.5',
  md: 'w-9 h-9 [&_svg]:w-4 [&_svg]:h-4',
  lg: 'w-11 h-11 [&_svg]:w-5 [&_svg]:h-5',
}

const variantClasses = (active: boolean) => ({
  default: cx(
    'rounded-lg bg-(--theme-muted-panel-bg) text-(--theme-muted-text-color) hover:bg-(--theme-border) hover:text-(--theme-app)',
    active && 'bg-(--theme-element)/10 text-(--theme-element)',
  ),
  ghost: cx(
    'rounded-lg bg-transparent text-(--theme-muted-text-color) hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app)',
    active && 'text-(--theme-element)',
  ),
  primary: cx(
    'rounded-lg bg-(--theme-element) text-white hover:bg-(--theme-element)/90',
    active && 'ring-2 ring-(--theme-element)/50',
  ),
  success: cx(
    'rounded-lg bg-[#22c55e] text-white hover:bg-[#22c55e]/90',
    active && 'ring-2 ring-[#22c55e]/50',
  ),
  outline: cx(iconButtonOutlineClasses, active && 'border-(--theme-link) text-(--theme-app)'),
})

/** A button that shows only an icon, named by its tooltip. It can be a popup's
 *  trigger: it passes the trigger's props and ref on, and hides its tooltip while
 *  the popup is open. */
export function IconButton({
  icon,
  label,
  variant = 'default',
  size = 'md',
  active = false,
  shortcut,
  className,
  ref,
  ...props
}: IconButtonProps) {
  const button = useRef<HTMLButtonElement | null>(null)
  const setButton = useCallback(
    (node: HTMLButtonElement | null) => {
      button.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref],
  )
  useShortcutKey(shortcut, () => button.current?.click())
  const outline = variant === 'outline'
  return (
    <Tooltip
      content={label}
      shortcut={shortcut?.toUpperCase()}
      // A popup trigger reports itself expanded while its popup is open.
      disabled={props['aria-expanded'] === true}
    >
      <button
        type="button"
        aria-label={label}
        ref={setButton}
        className={cx(
          'shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
          !outline &&
            cx('inline-flex items-center justify-center transition-colors', sizeClasses[size]),
          variantClasses(active)[variant],
          className,
        )}
        {...props}
      >
        {icon}
        {outline && active && (
          <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-(--theme-link)" />
        )}
      </button>
    </Tooltip>
  )
}
