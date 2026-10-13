import type { FieldProps } from '../components/Field'
import { resolvedFlag } from './lib'
import type { FieldComponentProps } from './types/fieldComponentTypes'

/** How a form field's props frame it: its label, help, description, required mark and missing
 *  state, laid out as the form lays out its fields. Spread on `Field`. */
export function fieldFrame(
  {
    field,
    label,
    labelPosition,
    missing,
    disabled,
    spaceCompact,
    tooltipComponent,
  }: FieldComponentProps,
  { group = false }: { group?: boolean } = {},
): Omit<FieldProps, 'children'> {
  return {
    label,
    hint: tooltipComponent,
    description: field.description,
    group,
    required: !resolvedFlag(field.optional),
    invalid: missing,
    disabled,
    layout: labelPosition === 'top' ? 'stacked' : 'inline',
    compact: spaceCompact,
  }
}
