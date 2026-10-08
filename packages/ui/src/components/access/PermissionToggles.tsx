import cx from 'classnames'
import { useStrings } from '../Provider'
import { TOOLTIP_ID } from '../Tooltip'
import type { AccessPermission, PermissionState } from './accessDraft'

const OFF: PermissionState = { pressed: false, lockedBy: null }

export function PermissionToggles({
  label,
  permissions,
  states,
  disabled,
  onToggle,
}: {
  label: string
  permissions: readonly AccessPermission[]
  /** One per permission, in the same order. */
  states: readonly PermissionState[]
  disabled: boolean
  onToggle: (key: string) => void
}) {
  const strings = useStrings().access
  return (
    <fieldset
      aria-label={label}
      className="m-0 flex min-w-0 shrink-0 flex-wrap gap-1.5 border-0 p-0"
    >
      {permissions.map((permission, index) => {
        const state = states[index] ?? OFF
        const locked = state.lockedBy !== null
        const inert = disabled || locked
        const reason =
          state.lockedBy === 'organization'
            ? strings.grantedToOrganization
            : state.lockedBy === 'permission'
              ? strings.includedByHigher
              : undefined
        const tooltip = [permission.description, reason].filter(Boolean).join(' ')
        // aria-disabled rather than disabled: a locked toggle keeps focus and hover, so
        // keyboard and pointer users can still learn why it can't be turned off.
        return (
          <button
            key={permission.key}
            type="button"
            aria-pressed={state.pressed}
            aria-disabled={inert || undefined}
            onClick={inert ? undefined : () => onToggle(permission.key)}
            {...(tooltip && { 'data-tooltip-id': TOOLTIP_ID, 'data-tooltip-content': tooltip })}
            className={cx(
              'h-7 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors',
              state.pressed
                ? 'border-(--theme-element) bg-[color-mix(in_srgb,var(--theme-element)_14%,transparent)] text-(--theme-app)'
                : 'border-(--theme-border) text-(--theme-muted-text-color)',
              locked && 'border-dashed',
              inert
                ? 'cursor-not-allowed'
                : 'cursor-pointer hover:border-(--theme-element) hover:text-(--theme-app)',
              disabled && !locked && 'opacity-60',
            )}
          >
            {permission.label}
          </button>
        )
      })}
    </fieldset>
  )
}
