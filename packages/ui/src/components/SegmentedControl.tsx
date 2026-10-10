import cx from 'classnames'
import type { ReactNode } from 'react'
import { useLink } from './Provider'
import { TOOLTIP_ID } from './Tooltip'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Beside the label, or in the corner when only the icon shows. */
  badge?: ReactNode
  /** Navigates instead of calling `onChange`, for segments that are pages. */
  to?: string
  testId?: string
}

const itemBase =
  'relative flex min-w-0 items-center justify-center rounded-md font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--theme-link)'
const itemCurrent = 'bg-(--theme-panel-bg) theme-text shadow-sm ring-1 ring-(--theme-border)'
const itemIdle = 'theme-muted-text hover:theme-text hover:bg-(--theme-hover)'

/** A few mutually exclusive choices side by side, one always current. With
 *  `iconOnly` the segments stack as icons with their labels in tooltips, for
 *  a collapsed rail. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  fill = false,
  iconOnly = false,
  testId,
}: {
  label: string
  options: SegmentedOption<T>[]
  value: T
  onChange?: (value: T) => void
  /** Segments share the container's width equally. */
  fill?: boolean
  iconOnly?: boolean
  testId?: string
}) {
  const Link = useLink()
  const links = options.some((o) => o.to)

  const items = options.map((option) => {
    const current = option.value === value
    const className = cx(
      itemBase,
      current ? itemCurrent : itemIdle,
      iconOnly ? 'h-8 w-8' : cx('h-7 gap-1.5 text-[13px]', fill ? 'px-1.5' : 'px-2.5'),
    )
    const content = (
      <>
        {option.icon}
        {iconOnly ? (
          <span className="sr-only">{option.label}</span>
        ) : (
          <span className="truncate">{option.label}</span>
        )}
        {option.badge &&
          (iconOnly ? (
            <span className="absolute top-1 right-1 inline-flex">{option.badge}</span>
          ) : (
            option.badge
          ))}
      </>
    )
    const tooltip = iconOnly
      ? {
          'data-tooltip-id': TOOLTIP_ID,
          'data-tooltip-content': option.label,
          'data-tooltip-place': 'right' as const,
        }
      : {}
    return option.to ? (
      <Link
        key={option.value}
        to={option.to}
        aria-current={current ? 'page' : undefined}
        data-testid={option.testId}
        className={className}
        {...tooltip}
      >
        {content}
      </Link>
    ) : (
      <button
        key={option.value}
        type="button"
        aria-pressed={current}
        data-testid={option.testId}
        onClick={() => onChange?.(option.value)}
        className={className}
        {...tooltip}
      >
        {content}
      </button>
    )
  })

  const groupClassName = cx(
    'gap-0.5',
    iconOnly
      ? 'flex flex-col items-center'
      : cx(
          'rounded-lg theme-muted-panel p-0.5',
          fill ? 'grid auto-cols-fr grid-flow-col' : 'inline-flex',
        ),
  )
  return links ? (
    <nav aria-label={label} data-testid={testId} className={groupClassName}>
      {items}
    </nav>
  ) : (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring a border and legend the control does not have; the group role names the set of toggle buttons.
    <div role="group" aria-label={label} data-testid={testId} className={groupClassName}>
      {items}
    </div>
  )
}
