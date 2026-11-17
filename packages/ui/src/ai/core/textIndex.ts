import type { ChatMessage as Message } from '../types'

/** The text a reader sees in each message of a transcript, kept for the
 *  messages the list doesn't draw, so a search reaches them without drawing
 *  them all. A message is known by its object, which a change replaces, so one
 *  read before it changed is read again. */
export interface TextIndex {
  get(message: Message): string | undefined
  set(message: Message, text: string): void
  clear(): void
  subscribe(listener: () => void): () => void
}

export function createTextIndex(): TextIndex {
  let texts = new WeakMap<Message, string>()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }
  return {
    get: (message) => texts.get(message),
    set(message, text) {
      if (texts.get(message) !== text) {
        texts.set(message, text)
        notify()
      }
    },
    clear() {
      texts = new WeakMap()
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
