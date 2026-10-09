import cx from 'classnames'
import { useField, useFormikContext } from 'formik'
import type React from 'react'
import { useId } from 'react'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
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
    setFormDirty,
  } = props
  // The form names every field before it renders one.
  const fieldName = field.name ?? ''

  const uid = useId()
  const [fieldState] = useField(fieldName)
  const { setFieldValue, setFieldTouched } = useFormikContext()

  const handleChange = (val: string) => {
    if (disabled) {
      return
    }
    onChange?.(val)
    setFieldTouched(fieldName, true)
    setFieldValue(fieldName, val)
    setFormDirty(true)
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
                  checked={
                    fieldState.value !== undefined &&
                    fieldState.value !== null &&
                    String(fieldState.value) === option.value
                  }
                  disabled={disabled}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    handleChange(e.target.value)
                  }}
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
