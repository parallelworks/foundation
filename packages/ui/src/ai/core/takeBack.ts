import type { MessagePaste } from '../types'

/** A message taken back before it was read. */
export interface RecalledMessage {
  text: string
  /** Pastes the target saved, which the text names by placeholder. */
  pastes?: MessagePaste[] | undefined
  /** Still drawn where it was sent, such as one whose turn failed: a take
   *  that asked for an empty box lets it go when the box filled meanwhile,
   *  rather than join what was typed. */
  shown?: boolean | undefined
}

/** Messages sent but not read yet, as a terminal holds what is typed while it works. */
export interface ComposerRecall {
  /** Something waiting can still be taken back. */
  available: boolean
  /** Takes back what waits, oldest first. One read meanwhile stays sent, so
   *  this can answer with fewer, or none. */
  take: () => Promise<RecalledMessage[]>
  /** Told which of what `take` answered went into the box, the same objects
   *  in their order, once it settles: a take into an empty box lets a `shown`
   *  message go when the box filled meanwhile. A host that puts back parts
   *  of a message the box does not hold, such as its images, puts back those
   *  of these messages only. */
  placed?: ((messages: RecalledMessage[]) => void) | undefined
}

/** A key pressed in the box. A host whose events carry no modifiers leaves them out. */
export interface ComposerKey {
  key: string
  shiftKey?: boolean | undefined
  altKey?: boolean | undefined
  metaKey?: boolean | undefined
  ctrlKey?: boolean | undefined
  /** An input method is still composing, so the key is its own. */
  isComposing?: boolean | undefined
}

/** The box a take started from, which it reads again and puts back into once the take answers. */
export interface TakeBackBox {
  /** Holds something the person put there: typing, a paste card or a file,
   *  but not a sent message being browsed. */
  holds: () => boolean
  /** Puts what was taken back ahead of what the box holds, its saved pastes as cards. */
  put: (text: string, pastes: MessagePaste[]) => void
}

/** The composer taking back. Each getter is read as a take starts, so it answers with the latest. */
export interface TakeBackHost {
  recall: () => ComposerRecall | undefined
  /** What comes back goes into this box even once the composer moved on, such as to another conversation. */
  box: () => TakeBackBox
}

export interface TakeBack {
  /** Takes back what waits into the box, resolving to whether anything came
   *  back. `ifEmpty` takes nothing while the box holds something, as a
   *  terminal refills only an empty line. */
  take: (options?: { ifEmpty?: boolean | undefined }) => Promise<boolean>
  /** Takes back on ↑ in an empty box, reporting whether the key was its own,
   *  so the caller stops it moving the caret or walking the history. */
  handleKey: (key: ComposerKey, text: string) => boolean
}

/** What was taken back, ahead of what was typed. */
export function joinTakenBack(taken: string, typed: string): string {
  return [taken, typed].filter((text) => text.trim()).join('\n\n')
}

/** Its pastes come back as cards, so the placeholders the send added go. */
export function recalledText(messages: RecalledMessage[]): string {
  return messages
    .map((m) =>
      (m.pastes ?? []).reduce((text, p) => text.replace(p.placeholder, () => ''), m.text).trim(),
    )
    .filter(Boolean)
    .join('\n')
}

/** Takes back what a composer sent but was not read yet, one take at a time. */
export function createTakeBack(host: TakeBackHost): TakeBack {
  // Held while a take is out, so another ↑ neither takes again nor walks the history.
  let taking = false

  const take = async ({ ifEmpty = false }: { ifEmpty?: boolean | undefined } = {}) => {
    const recall = host.recall()
    if (!recall || taking) {
      return false
    }
    const box = host.box()
    if (ifEmpty && box.holds()) {
      return false
    }
    taking = true
    try {
      const took = await recall.take()
      // Typed into while the take was out, the box keeps what was typed: a message
      // still drawn where it was sent goes, and only what nothing else holds comes back.
      const taken = ifEmpty && box.holds() ? took.filter((m) => !m.shown) : took
      if (taken.length > 0) {
        box.put(
          recalledText(taken),
          taken.flatMap((m) => m.pastes ?? []),
        )
      }
      if (took.length > 0) {
        recall.placed?.(taken)
      }
      return taken.length > 0
    } catch (error) {
      console.error('Failed to take back messages:', error)
      return false
    } finally {
      taking = false
    }
  }

  const handleKey = (key: ComposerKey, text: string) => {
    const recall = host.recall()
    if (
      !recall ||
      !(recall.available || taking) ||
      key.key !== 'ArrowUp' ||
      key.shiftKey ||
      key.altKey ||
      key.metaKey ||
      key.ctrlKey ||
      key.isComposing ||
      text.trim() !== ''
    ) {
      return false
    }
    void take()
    return true
  }

  return { take, handleKey }
}
