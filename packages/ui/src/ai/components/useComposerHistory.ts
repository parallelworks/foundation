import { type KeyboardEvent, useEffect, useRef } from 'react'
import { appendHistory, mergeHistory, readHistory } from './chatHistory'
import { isShellLine, shellText } from './shellLine'

export interface ComposerHistory {
  /** Composers with the same name in a tab share one history, which ends with the tab. */
  name: string
  /** What was sent before or beyond this tab, oldest first, such as the
   *  messages of a conversation reopened here. */
  seed?: readonly string[] | undefined
  /** Text to forget, such as a command carrying a secret: no history, no draft, no return from a failed send. */
  skip?: ((text: string) => boolean) | undefined
}

interface Walk {
  entries: string[]
  index: number
  /** What the box held when the walk began, which ↓ past the newest entry brings back: empty, or a bare `!`. */
  draft: string
}

/** ↑ and ↓ step through what was sent, as a shell's history does. A walk starts
 *  from an empty box, so arrows in a draft still move the caret. Moving the caret
 *  off the end of a recalled entry hands the arrows back too, so a long entry
 *  can be edited. In a composer with `shell`, a walk begun on a bare `!` steps
 *  through shell commands only, as a terminal's shell mode does. */
export function useComposerHistory(
  history: ComposerHistory | undefined,
  input: string,
  setInput: (value: string) => void,
  shell = false,
) {
  const walk = useRef<Walk | null>(null)
  const recalled = walk.current?.entries[walk.current.index] === input
  const inShell = shell && isShellLine(input)
  // A shell line's `!` is the box's prompt, so the caret moves through its command alone.
  const box = inShell ? shellText(input) : input

  // An edit ends the walk, or retyping an entry's text would read as recalling it.
  useEffect(() => {
    if (!recalled) {
      walk.current = null
    }
  }, [recalled])

  const show = (entries: string[], index: number, draft: string) => {
    walk.current = { entries, index, draft }
    setInput(entries[index] ?? '')
  }

  /** Called before the send, so what fails is as recallable as what succeeds. */
  const record = (text: string) => {
    walk.current = null
    if (history && text && !history.skip?.(text)) {
      appendHistory(history.name, text)
    }
  }

  /** What comes back into the box is the box's own, even with an entry's text. */
  const leave = () => {
    walk.current = null
  }

  /** True when the key moved through the history. */
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const up = e.key === 'ArrowUp'
    if (
      !history ||
      (!up && e.key !== 'ArrowDown') ||
      e.shiftKey ||
      e.altKey ||
      e.metaKey ||
      e.ctrlKey ||
      e.nativeEvent.isComposing
    ) {
      return false
    }
    const { selectionStart, selectionEnd } = e.currentTarget
    if (recalled ? selectionStart !== box.length || selectionEnd !== box.length : box.trim()) {
      return false
    }
    const current = recalled ? walk.current : null
    if (current) {
      const index = current.index + (up ? -1 : 1)
      if (index >= current.entries.length) {
        walk.current = null
        setInput(current.draft)
      } else if (index >= 0) {
        show(current.entries, index, current.draft)
      }
      return true
    }
    const seed = history.seed?.filter((text) => !history.skip?.(text)) ?? []
    const sent = up ? mergeHistory(seed, readHistory(history.name)) : []
    const entries = inShell ? sent.filter(isShellLine) : sent
    if (entries.length === 0) {
      return false
    }
    show(entries, entries.length - 1, inShell ? '!' : '')
    return true
  }

  return { recalled, record, handleKey, leave }
}
