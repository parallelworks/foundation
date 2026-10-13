import { clsx as cx } from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { NumericFormat } from 'react-number-format'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
import { getPlaceholder } from '../utils/getPlaceholder'

export interface INumberField extends BaseField {
  type: 'number'
  default?: number
  prefillDefault?: boolean
  min?: number
  max?: number
  step?: number
  placeholder?: string
  thousandsSeparator?: boolean
}

type NumberValue = number | undefined

export default function NumberField({
  field,
  label,
  labelPosition,
  missing,
  disabled,
  onChange,
  tooltipComponent,
  spaceCompact,
}: FieldComponentProps<INumberField>) {
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<NumberValue | string>(field.name ?? '')
  // What the person types: it follows the value except while they type, when a parse would turn "1."
  // into 1 under them.
  const [text, setText] = useState(() =>
    value === undefined || value === null ? '' : String(value),
  )
  const typing = useRef(false)
  useEffect(() => {
    if (!typing.current) {
      setText(value === undefined || value === null ? '' : String(value))
    }
  }, [value])

  // With prefillDefault, seed the form value with the default (not just the placeholder) when it's
  // unset — e.g. gpuCount needs to actually hold 1, since the cost estimate prices the attached GPU
  // off the form value and would otherwise show the bare-VM price until the field is touched.
  const unset = value === undefined || value === null || value === ''
  const seed = field.prefillDefault && unset ? field.default : undefined
  useEffect(() => {
    if (seed !== undefined) {
      change(seed)
    }
  }, [seed, change])

  const set = (next: NumberValue) => {
    onChange?.(next)
    change(next)
  }
  // Leaving the field clamps what it holds into its range.
  const clamp = (next: NumberValue): NumberValue =>
    next === undefined
      ? undefined
      : Math.min(Math.max(next, field.min ?? -Infinity), field.max ?? Infinity)
  const placeholder = getPlaceholder(field.placeholder, field.default)

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ id, describedBy }) =>
        field.thousandsSeparator ? (
          <NumericFormat
            id={id}
            aria-describedby={describedBy}
            data-1p-ignore
            className={cx('w-full', disabled && 'disabled', missing && 'invalid')}
            name={field.name}
            value={typeof value === 'number' ? value : ''}
            aria-required={field.optional ? undefined : true}
            thousandSeparator=","
            decimalScale={20}
            allowNegative
            disabled={disabled}
            placeholder={placeholder}
            onValueChange={(v, { source }) => {
              if (source === 'event') {
                set(v.floatValue)
              }
            }}
            onBlur={() => {
              if (typeof value === 'number' && clamp(value) !== value) {
                set(clamp(value))
              }
            }}
          />
        ) : (
          <input
            id={id}
            aria-describedby={describedBy}
            data-1p-ignore
            className={cx('w-full', disabled && 'disabled', missing && 'invalid')}
            name={field.name}
            type="number"
            value={text}
            aria-required={field.optional ? undefined : true}
            disabled={disabled}
            placeholder={placeholder}
            step={field.step}
            min={field.min}
            max={field.max}
            onFocus={() => {
              typing.current = true
            }}
            onChange={(e) => {
              setText(e.target.value)
              const parsed = parseFloat(e.target.value)
              set(Number.isNaN(parsed) ? undefined : parsed)
            }}
            onBlur={() => {
              typing.current = false
              const parsed = parseFloat(text)
              const next = clamp(Number.isNaN(parsed) ? undefined : parsed)
              setText(next === undefined ? '' : String(next))
              set(next)
            }}
          />
        )
      }
    </FieldWrapper>
  )
}
