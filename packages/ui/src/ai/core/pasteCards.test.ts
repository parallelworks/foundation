import type { MessagePaste } from '../types'
import {
  type ComposerPastes,
  createPasteCards,
  type PasteCard,
  type PasteUploadResult,
} from './pasteCards'
import { joinPastes, PASTE_INLINE_CAP } from './pastes'

const big = 'pasted line\n'.repeat(200)
const saved: MessagePaste = {
  id: 3,
  placeholder: '[Pasted text #3 +200 lines]',
  lines: 200,
  bytes: big.length,
}

// A composer as a host without a DOM keeps one: its text, its cards, and where pastes go.
function composer(upload: ComposerPastes['upload'], inlineMaxBytes: number | undefined) {
  const box = { input: '', cards: [] as PasteCard[], pastes: { inlineMaxBytes, upload } }
  const cards = createPasteCards({
    pastes: () => box.pastes,
    input: () => box.input,
    setInput: (value) => {
      box.input = value
    },
    onCardsChange: (next) => {
      box.cards = next
    },
  })
  const paste = (text: string) => {
    if (!cards.handleTextPaste(text)) {
      box.input += text
    }
  }
  const limit = (inlineMax: number) => {
    box.pastes = { inlineMaxBytes: inlineMax, upload }
    cards.applyInlineLimit(inlineMax)
  }
  return { box, cards, paste, limit }
}

describe('createPasteCards', () => {
  it('runs where there is no DOM', () => {
    expect(typeof document).toBe('undefined')
  })

  it('leaves a paste that fits inline as text', () => {
    const upload = vi.fn()
    const { box, paste } = composer(upload, 10_000)
    paste(big)
    expect(box.input).toBe(big)
    expect(box.cards).toEqual([])
    expect(upload).not.toHaveBeenCalled()
  })

  it('saves a paste too big to send inline and sends it by placeholder', async () => {
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    const { box, cards, paste } = composer(upload, 1000)
    paste(big.replaceAll('\n', '\r\n'))
    expect(box.input).toBe('')
    expect(upload).toHaveBeenCalledWith(big)
    expect(box.cards).toEqual([{ key: 'paste-1', text: big, lines: 200, bytes: big.length }])

    await vi.waitFor(() => expect(box.cards[0]?.paste).toEqual(saved))
    box.input = 'summarize'
    expect(joinPastes(box.input, cards.takeCards())).toBe(`summarize\n\n${saved.placeholder}`)
    expect(box.cards).toEqual([])
  })

  it('cards a paste that would push the message past what goes inline', () => {
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    const { box, paste } = composer(upload, PASTE_INLINE_CAP)
    const half = 'x'.repeat(PASTE_INLINE_CAP / 2 + 1)
    paste(half)
    paste(half.replaceAll('x', 'y'))
    expect(box.input).toBe(half)
    expect(box.cards).toHaveLength(1)
  })

  it('puts the text in the box when the target cannot store pastes', async () => {
    const upload = vi.fn().mockResolvedValue({ unsupported: true })
    const { box, paste } = composer(upload, 1000)
    box.input = 'see'
    paste(big)
    await vi.waitFor(() => expect(box.input).toBe(`see\n\n${big}`))
    expect(box.cards).toEqual([])
  })

  it('shows an upload that failed on its card', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
    const { box, paste } = composer(upload, 1000)
    paste(big)
    await vi.waitFor(() => expect(box.cards[0]?.error).toBe('Failed to fetch'))
  })

  it('keeps a paste removed while saving out of the box', async () => {
    let answer: (result: PasteUploadResult) => void = () => {}
    const upload = vi.fn(
      () =>
        new Promise<PasteUploadResult>((resolve) => {
          answer = resolve
        }),
    )
    const { box, cards, paste } = composer(upload, 1000)
    paste(big)
    cards.removeCard('paste-1')
    answer({ unsupported: true })
    await Promise.resolve()
    expect(box.input).toBe('')
    expect(box.cards).toEqual([])
  })

  it('leaves pastes as text until the limit is known, then cards the big ones', async () => {
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    const { box, paste, limit } = composer(upload, undefined)
    paste('keep ')
    paste(big)
    expect(upload).not.toHaveBeenCalled()

    limit(1000)
    expect(box.input).toBe('keep ')
    expect(upload).toHaveBeenCalledWith(big)
    await vi.waitFor(() => expect(box.cards[0]?.paste).toEqual(saved))
  })

  it('moves pastes between the box and cards when the limit changes, saving each once', async () => {
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    const { box, paste, limit } = composer(upload, 10_000)
    paste(big)

    limit(1000)
    expect(box.input).toBe('')
    await vi.waitFor(() => expect(box.cards[0]?.paste).toEqual(saved))

    limit(10_000)
    expect(box.input).toBe(big)
    expect(box.cards).toEqual([])

    limit(1000)
    expect(box.cards[0]?.paste).toEqual(saved)
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('puts back cards taken for a send that failed without saving them again', async () => {
    const upload = vi.fn().mockResolvedValue({ paste: saved })
    const { box, cards, paste } = composer(upload, 1000)
    paste(big)
    await vi.waitFor(() => expect(box.cards[0]?.paste).toEqual(saved))
    const taken = box.cards
    expect(cards.takeCards()).toEqual([saved])

    cards.returnCards(taken)
    expect(box.cards).toEqual(taken)
    expect(cards.takeCards()).toEqual([saved])
    expect(upload).toHaveBeenCalledTimes(1)
  })
})
