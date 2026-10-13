import { clsx as cx } from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { RefreshIcon } from '../icons'
import { ghostButtonClasses } from './ghostButton'
import { useStrings } from './Provider'
import { useRelativeTime } from './relativeTime'
import { Tooltip } from './Tooltip'

const sizeClasses = {
  md: ghostButtonClasses,
  sm: 'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app)',
}

const iconOnlyClasses =
  'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md theme-muted-text transition-colors duration-150 hover:theme-text hover:theme-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-(--theme-link)'

export interface RefreshButtonProps {
  /** May return a promise; the button spins until it settles. */
  onRefresh: () => unknown
  /** Spins for a refresh the host tracks itself, such as a revalidation. */
  refreshing?: boolean | undefined
  /** When the data was last fetched. The button then reads "Updated 5
   *  seconds ago" instead of "Refresh", and keeps that current. */
  updatedAt?: Date | number | null | undefined
  size?: keyof typeof sizeClasses | undefined
  /** Only the icon shows, with "Refresh" as its name and tooltip. */
  iconOnly?: boolean | undefined
}

/** Fetches again on demand, and says so while it does, out loud too. */
export function RefreshButton({
  onRefresh,
  refreshing = false,
  updatedAt,
  size = 'md',
  iconOnly = false,
}: RefreshButtonProps) {
  const { common: t } = useStrings()
  const [pending, setPending] = useState(false)
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )
  const busy = refreshing || pending
  const ago = useRelativeTime(updatedAt)

  const refresh = () => {
    if (busy) {
      return
    }
    const result = onRefresh()
    if (result instanceof Promise) {
      setPending(true)
      result.finally(() => mounted.current && setPending(false))
    }
  }

  const button = (
    <button
      type="button"
      onClick={refresh}
      aria-busy={busy}
      aria-disabled={busy || undefined}
      aria-label={iconOnly ? t.refresh : undefined}
      className={cx(
        iconOnly ? iconOnlyClasses : sizeClasses[size],
        'group aria-disabled:cursor-default aria-disabled:opacity-60',
      )}
    >
      <RefreshIcon
        aria-hidden="true"
        className={cx(
          'shrink-0 motion-reduce:animate-none motion-reduce:transition-none',
          size === 'sm' && !iconOnly ? 'h-3 w-3' : 'h-3.5 w-3.5',
          busy ? 'animate-spin' : 'transition-transform duration-300 group-hover:rotate-180',
        )}
      />
      {!iconOnly && (ago ? t.updated(ago) : t.refresh)}
    </button>
  )
  return (
    <>
      {iconOnly ? <Tooltip content={t.refresh}>{button}</Tooltip> : button}
      <span role="status" className="sr-only">
        {busy ? t.refreshing : ''}
      </span>
    </>
  )
}
