import { dequal } from 'dequal'
import type { ReactNode } from 'react'
import type { ComboboxGroup, ComboboxItem, ComboboxItems } from '../../components/Combobox'

/** A choice as workflow YAML writes it, or as a host's option hook builds one. */
export interface FieldOptionItem<Value = string> {
  label: string
  value: Value
  description?: string | undefined
  /** The older key for description. */
  secondaryLabel?: string | undefined
  /** What choosing this sets the field's `secondaryField` to. */
  secondaryValue?: unknown
  disabled?: boolean | undefined
  icon?: ReactNode
}

/** Choices under a heading. */
export interface FieldOptionGroup<Value = string> {
  category?: string | undefined
  options: readonly (FieldOptionItem<Value> | string)[]
}

/** A dropdown option: a bare string is a choice labelled by its value. */
export type FieldOption<Value = string> = string | FieldOptionItem<Value> | FieldOptionGroup<Value>

/** A picker item that also sets other fields when chosen, through `secondaryField`. */
export type ChoiceItem<Value = unknown> = ComboboxItem<Value> & { secondaryValue?: unknown }

const isGroup = <Value>(option: FieldOption<Value>): option is FieldOptionGroup<Value> =>
  typeof option === 'object' && 'options' in option

function toItem<Value>(option: FieldOptionItem<Value> | string): ChoiceItem<Value> | string {
  if (typeof option === 'string') {
    return option
  }
  const { label, value, description, secondaryLabel, secondaryValue, disabled, icon } = option
  return {
    label,
    value,
    description: description ?? secondaryLabel,
    disabled,
    icon,
    ...(secondaryValue === undefined ? {} : { secondaryValue }),
  }
}

/** Options as picker items. Headed groups stay groups; choices between them join an untitled
 *  group in their place, since a picker lists either groups or plain items. */
export function toFieldItems<Value>(options: readonly FieldOption<Value>[]): ComboboxItems<Value> {
  type Leaf = ComboboxGroup<Value>['items'][number]
  if (!options.some(isGroup)) {
    return options.map((option) => toItem(option as FieldOptionItem<Value> | string)) as Leaf[]
  }
  const groups: ComboboxGroup<Value>[] = []
  // The untitled group collecting choices since the last headed one.
  let loose: Leaf[] | undefined
  for (const option of options) {
    if (isGroup(option)) {
      groups.push({ label: option.category ?? '', items: option.options.map(toItem) as Leaf[] })
      loose = undefined
    } else if (loose) {
      loose.push(toItem(option) as Leaf)
    } else {
      loose = [toItem(option) as Leaf]
      groups.push({ label: '', items: loose })
    }
  }
  return groups
}

/** Every item, groups flattened. */
export function leaves(items: ComboboxItems<unknown>): (ChoiceItem | string)[] {
  return items.flatMap((item) =>
    typeof item === 'object' && 'items' in item ? (item as ComboboxGroup<unknown>).items : [item],
  )
}

export const itemValue = (item: ChoiceItem | string) =>
  typeof item === 'string' ? item : item.value

/** The item among `items` holding `value`, with what it sets through `secondaryField`. */
export function findChoice(items: ComboboxItems<unknown>, value: unknown): ChoiceItem | undefined {
  return leaves(items).find(
    (item): item is ChoiceItem => typeof item === 'object' && dequal(item.value, value),
  )
}
