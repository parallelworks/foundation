import type { MessagePaste } from '../types'
import {
  countLines,
  normalizeNewlines,
  PASTE_CARD_MIN_BYTES,
  PASTE_INLINE_CAP,
  utf8Bytes,
} from './pastes'

export type PasteUploadResult =
  | { paste: MessagePaste }
  | { error: string }
  // The target cannot store pastes, so the text goes into the box after all.
  | { unsupported: true }

/** Pastes over inlineMaxBytes are saved with the target and sent by placeholder; undefined keeps them text. */
export interface ComposerPastes {
  inlineMaxBytes: number | undefined
  upload: (text: string) => Promise<PasteUploadResult>
}

/** A paste waiting in the composer as a file card; paste is set once saved. */
export interface PasteCard {
  key: string
  text: string
  lines: number
  bytes: number
  paste?: MessagePaste
  error?: string
}

/** The composer the cards belong to. Each getter is read when needed, so it answers with the latest. */
export interface PasteCardsHost {
  pastes: () => ComposerPastes | undefined
  input: () => string
  setInput: (value: string) => void
  onCardsChange: (cards: PasteCard[]) => void
}

export interface PasteCards {
  /** Reports whether the paste became a card, so the caller stops the text pasting too. */
  handleTextPaste: (raw: string) => boolean
  /** Moves pastes between the box and cards for a new inline limit, such as another model's. */
  applyInlineLimit: (inlineMax: number) => void
  removeCard: (key: string) => void
  /** Empties the cards, answering with the pastes that were saved. */
  takeCards: () => MessagePaste[]
  /** Puts back cards taken for a send that failed. */
  returnCards: (taken: PasteCard[]) => void
}

function appendText(box: string, text: string): string {
  return box.trim() ? `${box}\n\n${text}` : text
}

/** Keeps a composer's cards in step with the model, so text or card shows how each paste is sent. */
export function createPasteCards(host: PasteCardsHost): PasteCards {
  let cards: PasteCard[] = []
  const setCards = (update: (current: PasteCard[]) => PasteCard[]) => {
    cards = update(cards)
    host.onCardsChange(cards)
  }
  // Large pastes that went into the box as text, so a model with a smaller
  // window can turn them into cards while they are still there verbatim.
  let inBox: string[] = []
  // Pastes already saved, by their text, so one moving between the box and a
  // card as the limit settles is not saved again under a new number.
  const saved = new Map<string, MessagePaste>()
  // Cards still waiting on their upload; one removed, sent, or moved into the
  // box meanwhile must not have its text put back when the upload answers.
  const uploading = new Set<string>()
  let seq = 0

  const addCard = (text: string) => {
    const target = host.pastes()
    if (!target) {
      return
    }
    seq += 1
    const card: PasteCard = {
      key: `paste-${seq}`,
      text,
      lines: countLines(text),
      bytes: utf8Bytes(text),
    }
    const known = saved.get(text)
    if (known) {
      setCards((current) => [...current, { ...card, paste: known }])
      return
    }
    setCards((current) => [...current, card])
    uploading.add(card.key)
    const settle = (result: PasteUploadResult) => {
      const waiting = uploading.delete(card.key)
      if ('unsupported' in result) {
        setCards((current) => current.filter((c) => c.key !== card.key))
        if (waiting) {
          host.setInput(appendText(host.input(), text))
        }
        return
      }
      if ('paste' in result) {
        saved.set(text, result.paste)
      }
      setCards((current) =>
        current.map((c) => {
          if (c.key !== card.key) {
            return c
          }
          return 'error' in result ? { ...c, error: result.error } : { ...c, paste: result.paste }
        }),
      )
    }
    target
      .upload(text)
      .then(settle, (err: unknown) =>
        settle({ error: err instanceof Error ? err.message : String(err) }),
      )
  }

  const handleTextPaste = (raw: string): boolean => {
    const pastes = host.pastes()
    if (!pastes || !raw) {
      return false
    }
    const text = normalizeNewlines(raw)
    const bytes = utf8Bytes(text)
    if (
      pastes.inlineMaxBytes === undefined ||
      (bytes <= pastes.inlineMaxBytes && utf8Bytes(host.input()) + bytes <= PASTE_INLINE_CAP)
    ) {
      if (bytes >= PASTE_CARD_MIN_BYTES) {
        inBox.push(text)
      }
      return false
    }
    addCard(text)
    return true
  }

  const applyInlineLimit = (inlineMax: number) => {
    const box = host.input()
    const boxed = inBox.filter((text) => box.includes(text))
    const outgrown = boxed.filter((text) => utf8Bytes(text) > inlineMax)
    let boxBytes = utf8Bytes(box) - outgrown.reduce((sum, text) => sum + utf8Bytes(text), 0)
    // Pastes that each fit can still add up past what one message takes
    // inline; the latest become cards first.
    for (const text of boxed.toReversed()) {
      if (boxBytes <= PASTE_INLINE_CAP) {
        break
      }
      if (!outgrown.includes(text)) {
        outgrown.push(text)
        boxBytes -= utf8Bytes(text)
      }
    }
    const fitting = cards.filter((c) => {
      if (c.bytes > inlineMax || boxBytes + c.bytes > PASTE_INLINE_CAP) {
        return false
      }
      boxBytes += c.bytes
      return true
    })
    if (fitting.length === 0 && outgrown.length === 0) {
      return
    }
    let next = box
    for (const text of outgrown) {
      next = next.replace(text, () => '')
    }
    for (const card of fitting) {
      next = appendText(next, card.text)
      uploading.delete(card.key)
    }
    inBox = [...inBox.filter((text) => !outgrown.includes(text)), ...fitting.map((c) => c.text)]
    setCards((cs) => cs.filter((c) => !fitting.some((f) => f.key === c.key)))
    host.setInput(next)
    for (const text of outgrown) {
      addCard(text)
    }
  }

  const removeCard = (key: string) => {
    uploading.delete(key)
    setCards((current) => current.filter((c) => c.key !== key))
  }

  const takeCards = (): MessagePaste[] => {
    const sent = cards.flatMap((c) => (c.paste ? [c.paste] : []))
    setCards(() => [])
    uploading.clear()
    inBox = []
    saved.clear()
    return sent
  }

  const returnCards = (taken: PasteCard[]) => {
    for (const card of taken) {
      if (card.paste) {
        saved.set(card.text, card.paste)
      }
    }
    setCards((current) => [...taken, ...current])
  }

  return { handleTextPaste, applyInlineLimit, removeCard, takeCards, returnCards }
}
