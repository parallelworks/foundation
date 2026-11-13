/** Gives elements checkVisibility, which jsdom lacks, answering from computed
 *  style as a browser does: false under `display: none` and, when asked, for
 *  `visibility: hidden`. Returns the restore. */
export function mockCheckVisibility() {
  Element.prototype.checkVisibility = function (this: Element, options?: CheckVisibilityOptions) {
    if (!this.isConnected) {
      return false
    }
    for (let el: Element | null = this; el; el = el.parentElement) {
      if (getComputedStyle(el).display === 'none') {
        return false
      }
    }
    return !options?.visibilityProperty || getComputedStyle(this).visibility !== 'hidden'
  }
  return () => {
    delete (Element.prototype as Partial<Element>).checkVisibility
  }
}
