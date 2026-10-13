import { Field as BaseField } from '@base-ui/react/field'
import { Fieldset } from '@base-ui/react/fieldset'
import { clsx as cx } from 'clsx'
import { createContext, type ReactNode, use, useId } from 'react'
import { AlertIcon, EyeIcon, EyeOffIcon } from '../icons'
import { useStrings } from './Provider'
import { RequiredMark } from './RequiredMark'

/** What a field's control takes to be named, described and marked by its field. Spread it
 *  on the control: `{(control) => <input {...control} />}`. */
export interface FieldControlProps {
  id: string
  /** Set for a group, which its legend names rather than a label. */
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: true | undefined
  'aria-required'?: true | undefined
}

const ControlContext = createContext<FieldControlProps | null>(null)

/** The surrounding Field's control props, for a control drawn further down than the Field's
 *  own children. Null outside a Field. */
export function useFieldControl(): FieldControlProps | null {
  return use(ControlContext)
}

export type FieldLayout = 'stacked' | 'inline'

export interface FieldProps {
  label: ReactNode
  /** Beside the label and outside it, so it stays out of the control's name: an InfoTip, a count. */
  hint?: ReactNode
  /** Help under the control, read with it. */
  description?: ReactNode
  /** A message under the control. It also marks the control invalid. */
  error?: ReactNode
  /** Marks the control invalid without a message, for one shown elsewhere. */
  invalid?: boolean | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  /** `stacked` puts the label above the control. `inline` puts it in a column to the left, as a
   *  form lays out its fields. */
  layout?: FieldLayout | undefined
  /** With `inline`, the label takes only its own width rather than the column's. */
  compact?: boolean | undefined
  /** A set of controls, such as radios or checkboxes, that a legend names instead of a label. */
  group?: boolean | undefined
  /** The control's id; one is made up when left out. */
  id?: string | undefined
  className?: string | undefined
  /** The control, or a function that places the control props on it. A Base UI control, such
   *  as Select, Combobox, NumberInput, Checkbox or Switch, needs only the `id`. */
  children: ReactNode | ((control: FieldControlProps) => ReactNode)
}

const labelClassName = 'flex items-center gap-1 text-sm font-medium text-(--theme-app)'

/** A control with its label, help and error, tied to it for assistive technology. One frame
 *  for every field, in a form or standing alone. */
export function Field({
  label,
  hint,
  description,
  error,
  invalid,
  required = false,
  disabled = false,
  layout = 'stacked',
  compact = false,
  group = false,
  id: ownId,
  className,
  children,
}: FieldProps) {
  const uid = useId()
  const id = ownId ?? `${uid}control`
  const labelId = `${uid}label`
  const descriptionId = description ? `${uid}description` : undefined
  const errorId = error ? `${uid}error` : undefined
  const isInvalid = Boolean(error) || Boolean(invalid)
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ')
  // Only what is set, so spreading it never clears a control's own attribute.
  const control: FieldControlProps = {
    id,
    ...(group && { 'aria-labelledby': labelId }),
    ...(describedBy && { 'aria-describedby': describedBy }),
    ...(isInvalid && { 'aria-invalid': true }),
    ...(required && { 'aria-required': true }),
  }

  const inline = layout === 'inline'
  const labelBox = cx(
    labelClassName,
    inline && cx('min-h-9 shrink-0', compact ? 'mr-2 w-fit' : 'w-52 pr-3'),
  )
  const labelContent = (
    <>
      <span>
        {label}
        {required && <RequiredMark />}
      </span>
      {hint}
    </>
  )
  const body = (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <ControlContext value={control}>
        {typeof children === 'function' ? children(control) : children}
      </ControlContext>
      {description && (
        <BaseField.Description
          id={descriptionId}
          className="text-xs leading-relaxed text-(--theme-muted-text-color)"
        >
          {description}
        </BaseField.Description>
      )}
      {error && (
        <BaseField.Error
          id={errorId}
          match
          role="alert"
          className="flex items-center gap-1.5 text-xs text-(--theme-error)"
        >
          <AlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </BaseField.Error>
      )}
    </div>
  )
  const frame = cx('flex w-full', inline ? 'items-start' : 'flex-col gap-1.5', className)

  if (group) {
    return (
      <BaseField.Root
        invalid={isInvalid}
        disabled={disabled}
        // The fieldset is the group itself, so a set of checkboxes needs no second one inside.
        render={
          <Fieldset.Root
            aria-describedby={control['aria-describedby']}
            aria-invalid={control['aria-invalid']}
          />
        }
      >
        <div className={frame}>
          <Fieldset.Legend id={labelId} className={labelBox}>
            {labelContent}
          </Fieldset.Legend>
          {body}
        </div>
      </BaseField.Root>
    )
  }
  return (
    <BaseField.Root invalid={isInvalid} disabled={disabled} className={frame}>
      {/* The hint sits beside the label rather than in it, so a help button doesn't name the control. */}
      <div className={labelBox}>
        <BaseField.Label htmlFor={id} id={labelId} data-field-label>
          {label}
          {required && <RequiredMark />}
        </BaseField.Label>
        {hint}
      </div>
      {body}
    </BaseField.Root>
  )
}

/** One checkbox or radio and its label inside a Field, such as an option of a group. A bare
 *  `<label>` there would take the Field's label as its own, so every option read as the field. */
export function FieldOption({
  disabled,
  className,
  children,
}: {
  disabled?: boolean | undefined
  className?: string | undefined
  children: ReactNode
}) {
  return (
    <BaseField.Item
      disabled={disabled}
      // biome-ignore lint/a11y/noLabelWithoutControl: the option's checkbox or radio and its text are the children.
      render={<label />}
      className={cx(disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', className)}
    >
      {children}
    </BaseField.Item>
  )
}

/** The eye button inside a secret's box that shows or hides what was typed. Give the box
 *  room for it on the right, such as `pr-9`. */
export function RevealToggle({
  revealed,
  onRevealedChange,
  disabled,
}: {
  revealed: boolean
  onRevealedChange: (revealed: boolean) => void
  disabled?: boolean | undefined
}) {
  const { common: t } = useStrings()
  const Icon = revealed ? EyeOffIcon : EyeIcon
  return (
    <button
      type="button"
      aria-label={revealed ? t.hideValue : t.showValue}
      aria-pressed={revealed}
      disabled={disabled}
      onClick={() => onRevealedChange(!revealed)}
      className="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center text-(--theme-muted-text-color) hover:text-(--theme-app) disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  )
}
