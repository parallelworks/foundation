export function isMac(): boolean {
  return navigator.platform.toUpperCase().includes('MAC')
}

/** Only org models bill to an allocation; any other model ignores it. */
export function isOrgModel(modelId: string | null | undefined): boolean {
  return modelId?.startsWith('org:') ?? false
}

/** A click the page handles itself: a modified or middle click opens the
 *  link in a new tab or window, and this page should stay as it is. */
export function isPlainClick(e: {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}
