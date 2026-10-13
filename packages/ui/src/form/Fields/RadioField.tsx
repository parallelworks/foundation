import { clsx as cx } from 'clsx'
import { useId } from 'react'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
import { fieldOption } from './fieldOption'

export interface IRadioField extends BaseField {
  type: 'radio'
  options?: Array<string | number | { label?: string; value: string | number }>
  optionLabelPosition?: 'left' | 'top'
}

export default function RadioField(props: FieldComponentProps<IRadioField>) {
  const {
    field,
    label,
    labelPosition,
    missing,
    disabled,
    onChange,
    tooltipComponent,
    spaceCompact,
  } = props
  const uid = useId()
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<unknown>(field.name ?? '')

  const handleChange = (val: string | number) => {
    if (disabled) {
      return
    }
    onChange?.(val)
    change(val)
  }

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ labelId, describedBy }) => (
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-required={field.optional ? undefined : true}
          className={cx(
            // py-1.5 centres the first row on the 34px field label beside it.
            'flex py-1.5',
            field.optionLabelPosition === 'top'
              ? 'flex-col gap-2'
              : 'flex-row flex-wrap gap-x-5 gap-y-2',
          )}
        >
          {field.options?.map((raw) => {
            const option = fieldOption(raw)
            // An option without a label of its own shows capitalized, as radio options always have.
            const unlabelled = typeof raw !== 'object' || raw.label === undefined
            return (
              <label
                key={field.name + option.value}
                htmlFor={`${uid}-${option.value}`}
                className={cx(
                  'flex items-center gap-2',
                  disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                )}
              >
                <input
                  id={`${uid}-${option.value}`}
                  className={cx(
                    'h-4 w-4',
                    disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                    missing && 'invalid',
                  )}
                  name={field.name}
                  type="radio"
                  value={option.value}
                  checked={value !== undefined && value !== null && String(value) === option.value}
                  disabled={disabled}
                  onChange={() => handleChange(option.raw)}
                />
                <span className={cx('theme-text', unlabelled && 'capitalize')}>{option.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </FieldWrapper>
  )
}
