import { dequal } from 'dequal'
import { useEffect, useEffectEvent, useRef } from 'react'
import { useFormContext } from 'react-hook-form'
import type { ComboboxItems } from '../components/Combobox'
import { useFieldValue } from './useFieldValue'
import { findChoice, itemValue, leaves } from './utils/fieldItems'
import { applySecondaryField } from './utils/secondaryField'

/**
 * Picks for a field on its own: with `autoselect`, the first enabled item whenever the items
 * change; unset, an only item; false, nothing. A value already held stays on the first pass, and
 * without `autoselect` one the items still offer stays too. The items change when their values or
 * which are enabled do, so a caller may rebuild them every render. Works with any value store;
 * `useChoiceField` binds it to a form field.
 */
export function useAutoselect({
  items,
  value,
  autoselect,
  select,
}: {
  items: ComboboxItems<unknown>
  value: unknown
  autoselect?: boolean | undefined
  select: (value: unknown) => void
}) {
  const first = useRef(true)
  const run = useEffectEvent(() => {
    const preset = first.current && value != null
    first.current = false
    if (preset || autoselect === false) {
      return
    }
    const all = leaves(items)
    if (all.length === 0 || (autoselect === undefined && all.length !== 1)) {
      return
    }
    if (!autoselect && all.some((item) => dequal(itemValue(item), value))) {
      return
    }
    const pick = all.find((item) => typeof item === 'string' || !item.disabled)
    if (pick !== undefined) {
      select(itemValue(pick))
    }
  })
  // Rebuilt items (fresh icons, a new array) are the same items unless a value or an enabled
  // state differs, so only that reruns autoselect and never overrides a choice.
  const shape = [
    autoselect,
    leaves(items).map((item) =>
      typeof item === 'string' ? item : [item.value, Boolean(item.disabled)],
    ),
  ]
  const lastShape = useRef<unknown>(undefined)
  useEffect(() => {
    if (dequal(lastShape.current, shape)) {
      return
    }
    lastShape.current = shape
    run()
  })
}

/**
 * A form field that picks one of `items`: its value, and the choice the person makes, which also
 * sets the fields its `secondaryField` names from the item's `secondaryValue`. Autoselects as
 * `useAutoselect` does.
 */
export function useChoiceField({
  name,
  items,
  autoselect,
  secondaryField,
  onChange,
}: {
  name: string
  items: ComboboxItems<unknown>
  autoselect?: boolean | undefined
  secondaryField?: string | string[] | undefined
  onChange?: ((value: unknown) => void) | undefined
}): [unknown, (value: unknown) => void] {
  const [value, change] = useFieldValue<unknown>(name)
  const { setValue } = useFormContext()

  const choose = (next: unknown) => {
    applySecondaryField(
      secondaryField,
      findChoice(items, next)?.secondaryValue,
      (field, secondary) => setValue(field, secondary, { shouldDirty: true }),
    )
    onChange?.(next)
    change(next)
  }

  useAutoselect({ items, value, autoselect, select: choose })
  return [value, choose]
}
