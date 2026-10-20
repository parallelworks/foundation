import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import type { ReactNode } from 'react'
import {
  SegmentContent,
  type SegmentLayout,
  type SegmentTone,
  segmentClassName,
  segmentGroupClassName,
} from './segmented'
import { Tooltip } from './Tooltip'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Beside the label, or in the corner when only the icon shows. */
  badge?: ReactNode
  /** How many things the choice holds, as a pill after the label. */
  count?: number | undefined
  /** Colors the label and the count, for a choice that needs attention. */
  tone?: SegmentTone | undefined
  /** Can't be chosen now; it still shows, and the rest still work. */
  disabled?: boolean | undefined
  testId?: string
}

/** A few mutually exclusive choices side by side, one always current, such as
 *  a time range or what to group by. To move between views or pages, use
 *  `Tabs` with `variant="segmented"`, which looks the same. To filter a list
 *  by values that may all be off, or several at once, use `ToggleGroup`. Name
 *  it with `label`, or leave that out inside a `Field group`, whose legend
 *  names it. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  fill = false,
  iconOnly = false,
  size = 'md',
  disabled = false,
  testId,
}: SegmentLayout & {
  label?: string | undefined
  options: SegmentedOption<T>[]
  value: T
  onValueChange?: (value: T) => void
  /** None of the choices can be changed now, such as for a reader without
   *  the right to; the current one still shows. */
  disabled?: boolean | undefined
  testId?: string
}) {
  const layout = { fill, iconOnly, size }
  return (
    <ToggleGroup
      aria-label={label}
      data-testid={testId}
      className={segmentGroupClassName(layout)}
      orientation={iconOnly ? 'vertical' : 'horizontal'}
      disabled={disabled}
      value={[value]}
      // Pressing the current segment again would leave none current; one always is.
      onValueChange={([next]) => {
        if (next !== undefined) {
          onValueChange?.(next as T)
        }
      }}
    >
      {options.map((option) => (
        // A labeled segment shows its name already; only an icon needs the tooltip.
        <Tooltip key={option.value} content={option.label} side="right" disabled={!iconOnly}>
          <Toggle
            value={option.value}
            disabled={option.disabled}
            data-testid={option.testId}
            className={segmentClassName(option.value === value, layout, option.tone)}
          >
            <SegmentContent {...option} iconOnly={iconOnly} />
          </Toggle>
        </Tooltip>
      ))}
    </ToggleGroup>
  )
}
