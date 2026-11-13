/** Whether el shows. A host can keep a view mounted while another page shows,
 *  hidden with `display: none` or `visibility: hidden`, and keys pressed on
 *  that page are the page's. A browser without checkVisibility (Safari before
 *  17.4) counts it as shown, as it did before the check. */
export function onScreen(el: Element | null): boolean {
  return el?.checkVisibility?.({ visibilityProperty: true }) ?? true
}

/** Listens on target for the key presses `wants` picks that began while el
 *  showed. A capture listener on window reads that before any other handler
 *  runs, since one that closes a layer on another page can show the view again
 *  before a bubbling listener reads it. Returns the cleanup. */
export function listenWhileShown(
  target: EventTarget,
  el: () => Element | null,
  wants: (e: KeyboardEvent) => boolean,
  onKey: (e: KeyboardEvent) => void,
): () => void {
  let shown: Event | null = null
  const before = (e: KeyboardEvent) => {
    shown = wants(e) && onScreen(el()) ? e : null
  }
  const after = (e: Event) => {
    if (e === shown) {
      onKey(e as KeyboardEvent)
    }
  }
  window.addEventListener('keydown', before, true)
  target.addEventListener('keydown', after)
  return () => {
    window.removeEventListener('keydown', before, true)
    target.removeEventListener('keydown', after)
  }
}
