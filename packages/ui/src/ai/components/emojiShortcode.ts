import { nameToEmoji } from 'gemoji'

const CLOSED_SHORTCODE = /:([^\s:]+):$/
// Two characters past the colon before anything is offered, so a colon in prose opens nothing.
const TYPING_SHORTCODE = /(?:^|\s):([^\s:]{2,})$/
const MAX_SHOWN = 8

export interface EmojiShortcode {
  name: string
  emoji: string
}

let sortedShortcodes: EmojiShortcode[] | undefined
const allShortcodes = () => {
  sortedShortcodes ??= Object.keys(nameToEmoji)
    .sort()
    .map((name) => ({ name, emoji: nameToEmoji[name] ?? '' }))
  return sortedShortcodes
}

/** The `:shortcode` being typed: the word that ends at `caret` and opens with a colon, with
 *  at least two characters after it and no closing colon yet. A caret inside a word reads as
 *  editing it, not typing it, so it offers nothing. */
export function typingShortcode(
  text: string,
  caret: number,
): { query: string; start: number } | null {
  if (/\S/.test(text.charAt(caret))) {
    return null
  }
  const name = TYPING_SHORTCODE.exec(text.slice(0, caret))?.[1]
  if (!name) {
    return null
  }
  return { query: name.toLowerCase(), start: caret - name.length - 1 }
}

/** The shortcodes for `query`: names that start with it before names that only contain it,
 *  and the shorter first within each, so `ey` leads with `eye` rather than a long name that
 *  merely holds it. */
export function emojiMatches(query: string): EmojiShortcode[] {
  const prefix: EmojiShortcode[] = []
  const contains: EmojiShortcode[] = []
  for (const shortcode of allShortcodes()) {
    if (shortcode.name.startsWith(query)) {
      prefix.push(shortcode)
    } else if (shortcode.name.includes(query)) {
      contains.push(shortcode)
    }
  }
  const shorterFirst = (a: EmojiShortcode, b: EmojiShortcode) => a.name.length - b.name.length
  return [...prefix.sort(shorterFirst), ...contains.sort(shorterFirst)].slice(0, MAX_SHOWN)
}

/** `text` with what was typed from `start` to `caret` replaced by `emoji` and a space, unless
 *  one already follows, and the caret after them. */
export function insertEmoji(
  text: string,
  start: number,
  caret: number,
  emoji: string,
): { text: string; caret: number } {
  const after = text.slice(caret)
  const before = text.slice(0, start) + emoji + (/^\s/.test(after) ? '' : ' ')
  return { text: before + after, caret: before.length }
}

/** When `next` is `previous` with one colon typed before `caret`, and that colon closes a known
 *  `:shortcode:`, the text with the emoji in its place and the caret just after it. Text that
 *  arrives in one piece, such as a paste, stays as written. */
export function closeShortcode(
  previous: string,
  next: string,
  caret: number,
): { text: string; caret: number } | null {
  if (
    next.length !== previous.length + 1 ||
    next[caret - 1] !== ':' ||
    next.slice(0, caret - 1) + next.slice(caret) !== previous
  ) {
    return null
  }
  const before = next.slice(0, caret)
  const match = CLOSED_SHORTCODE.exec(before)
  // Only a whole word counts, so the colons of a URL or a time are left alone.
  if (!match?.[1] || (match.index > 0 && !/\s/.test(before[match.index - 1] ?? ''))) {
    return null
  }
  const name = match[1].toLowerCase()
  const emoji = Object.hasOwn(nameToEmoji, name) ? nameToEmoji[name] : undefined
  if (emoji === undefined) {
    return null
  }
  return {
    text: before.slice(0, match.index) + emoji + next.slice(caret),
    caret: match.index + emoji.length,
  }
}
