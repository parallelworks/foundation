import { type RefObject, useEffect, useState } from 'react'

// The box an element scrolls in, or null for the window. `hidden` clips without scrolling, a box
// with room for all it holds (such as one that scrolls only sideways) clips nothing, and the root
// element's and the body's overflow scrolls the window. A root that doesn't contain the element
// never sees it, so past a fixed box the window is the root, and past an absolute one only a
// positioned box is.
function scroller(el: Element): Element | null {
  const { body, documentElement } = el.ownerDocument
  let position = getComputedStyle(el).position
  for (let node = el.parentElement; node && node !== body; node = node.parentElement) {
    if (position === 'fixed') {
      return null
    }
    const style = getComputedStyle(node)
    if (position === 'absolute' && style.position === 'static') {
      continue
    }
    if (
      node !== documentElement &&
      /auto|scroll|overlay/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node
    }
    position = style.position
  }
  return null
}

/** Whether the element has come within two screens of view, which it then stays: for work that
 *  is only worth doing for what a reader is about to see, such as loading a summary. The margin
 *  grows only the root, so it goes on the box the element scrolls in, which would clip it first. */
export function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (near || !el) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
        }
      },
      { root: scroller(el), rootMargin: '200% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, near])
  return near
}
