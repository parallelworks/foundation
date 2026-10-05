/** A choice as `{ label, value }`, its value as text so a numeric option or default still matches. */
export function fieldOption(
  option: string | number | { label?: string; value: string | number; description?: string },
): { label: string; value: string; description?: string | undefined } {
  return typeof option === 'object' && option !== null
    ? {
        ...option,
        label: option.label ?? String(option.value),
        value: String(option.value),
      }
    : { label: String(option), value: String(option) }
}
