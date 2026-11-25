const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+/gi
const TRAILING_PUNCTUATION = /[.,:;!?*_~'"]/
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

export interface TextLink {
  url: string
}

function count(text: string, char: string): number {
  return text.split(char).length - 1
}

// A URL written in a sentence ends before the sentence's punctuation, and
// before a closing bracket it didn't open: "(see https://example.com/a)." links
// to https://example.com/a, while https://example.com/a_(b) keeps its ")".
function trimUrl(url: string): string {
  let end = url.length
  while (end > 0) {
    const last = url.charAt(end - 1)
    const opener = CLOSERS[last]
    const head = url.slice(0, end)
    if (TRAILING_PUNCTUATION.test(last) || (opener && count(head, opener) < count(head, last))) {
      end--
      continue
    }
    break
  }
  return url.slice(0, end)
}

/** Splits text into its plain runs and the http and https URLs written in it. */
export function splitLinks(text: string): (string | TextLink)[] {
  const out: (string | TextLink)[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0])
    if (url.endsWith('://')) {
      continue
    }
    if (match.index > last) {
      out.push(text.slice(last, match.index))
    }
    out.push({ url })
    last = match.index + url.length
  }
  if (last < text.length) {
    out.push(text.slice(last))
  }
  return out
}
