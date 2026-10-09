/** A choice as `{ label, value }`, its value as text so a numeric option or default still matches, and
 * `raw` as written, so a picked number is stored as one. */
export function fieldOption(
  option: string | number | { label?: string; value: string | number; description?: string },
): { label: string; value: string; raw: string | number; description?: string | undefined } {
  return typeof option === 'object' && option !== null
    ? {
        ...option,
        label: option.label ?? String(option.value),
        value: String(option.value),
        raw: option.value,
      }
    : { label: String(option), value: String(option), raw: option }
}
