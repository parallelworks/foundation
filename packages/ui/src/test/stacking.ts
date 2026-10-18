/** Whether two boxes share any area; a box with none, as in a test DOM, overlaps nothing. */
export const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** Whether the element drawn at an element's center is that element or inside it, so nothing covers it. */
export function onTop(el: Element): boolean {
  const box = el.getBoundingClientRect()
  const drawn = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return drawn !== null && el.contains(drawn)
}
