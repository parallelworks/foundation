import { useEffect, useRef, useState } from 'react'
import {
  type ComposerPastes,
  createPasteCards,
  type PasteCard,
  type PasteCards,
} from '../core/pasteCards'

/** Keeps the composer's cards in step with the model, so text or card shows how each paste is sent. */
export function usePasteCards(
  pastes: ComposerPastes | undefined,
  input: string,
  setInput: (value: string) => void,
): Omit<PasteCards, 'applyInlineLimit'> & { cards: PasteCard[]; blocking: boolean } {
  const [cards, setCards] = useState<PasteCard[]>([])
  const latest = useRef({ input, pastes, setInput })
  latest.current = { input, pastes, setInput }
  const [paste] = useState(() =>
    createPasteCards({
      pastes: () => latest.current.pastes,
      input: () => latest.current.input,
      setInput: (value) => latest.current.setInput(value),
      onCardsChange: setCards,
    }),
  )

  const inlineMax = pastes?.inlineMaxBytes
  useEffect(() => {
    if (inlineMax !== undefined) {
      paste.applyInlineLimit(inlineMax)
    }
  }, [inlineMax, paste])

  return {
    cards,
    handleTextPaste: paste.handleTextPaste,
    removeCard: paste.removeCard,
    takeCards: paste.takeCards,
    returnCards: paste.returnCards,
    blocking: cards.some((c) => !c.paste),
  }
}
