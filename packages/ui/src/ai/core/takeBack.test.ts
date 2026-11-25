import type { MessagePaste } from '../types'
import {
  type ComposerKey,
  type ComposerRecall,
  createTakeBack,
  joinTakenBack,
  type RecalledMessage,
  recalledText,
} from './takeBack'

const saved: MessagePaste = {
  id: 3,
  placeholder: '[Pasted text #3 +200 lines]',
  lines: 200,
  bytes: 2400,
}

function waiting(taken: RecalledMessage[]) {
  return { available: true, take: vi.fn(async () => taken), placed: vi.fn() }
}

// A take whose answer the test gives when it chooses.
function outstanding() {
  let answer: (taken: RecalledMessage[]) => void = () => {}
  const take = vi.fn(
    () =>
      new Promise<RecalledMessage[]>((resolve) => {
        answer = resolve
      }),
  )
  return {
    recall: { available: true, take, placed: vi.fn() },
    answer: (taken: RecalledMessage[]) => answer(taken),
  }
}

// A composer as a host without a DOM keeps one: its text and the pastes it shows as cards.
function composer(recall: ComposerRecall | undefined) {
  const box = { text: '', pastes: [] as MessagePaste[] }
  const takeBack = createTakeBack({
    recall: () => recall,
    box: () => ({
      holds: () => box.text.trim() !== '' || box.pastes.length > 0,
      put: (text, pastes) => {
        box.text = joinTakenBack(text, box.text)
        box.pastes = [...pastes, ...box.pastes]
      },
    }),
  })
  return { box, takeBack }
}

describe('recalledText', () => {
  it('leaves out the placeholders of pastes that come back as cards, a line between messages', () => {
    expect(
      recalledText([
        { text: `summarize\n\n${saved.placeholder}`, pastes: [saved] },
        { text: 'and the tests' },
      ]),
    ).toBe('summarize\nand the tests')
  })

  it('leaves out a message that was only its pastes, or blank', () => {
    expect(
      recalledText([
        { text: saved.placeholder, pastes: [saved] },
        { text: '  \n' },
        { text: 'also the docs' },
      ]),
    ).toBe('also the docs')
  })
})

describe('joinTakenBack', () => {
  it('puts what was taken back ahead of what was typed, a blank line apart', () => {
    expect(joinTakenBack('also the docs', 'my draft')).toBe('also the docs\n\nmy draft')
  })

  it('leaves out a side with nothing in it', () => {
    expect(joinTakenBack('also the docs', '  ')).toBe('also the docs')
    expect(joinTakenBack('', 'my draft')).toBe('my draft')
  })
})

describe('createTakeBack', () => {
  it('runs where there is no DOM', () => {
    expect(typeof document).toBe('undefined')
  })

  it('takes back what waits with its pastes, ahead of what was typed', async () => {
    const docs = { text: `summarize\n\n${saved.placeholder}`, pastes: [saved] }
    const tests = { text: 'and the tests' }
    const recall = waiting([docs, tests])
    const { box, takeBack } = composer(recall)
    box.text = 'my draft'
    await expect(takeBack.take()).resolves.toBe(true)
    expect(box.text).toBe('summarize\nand the tests\n\nmy draft')
    expect(box.pastes).toEqual([saved])
    expect(recall.placed).toHaveBeenCalledExactlyOnceWith([docs, tests])
    expect(recall.placed.mock.calls[0]?.[0][0]).toBe(docs)
  })

  it('takes nothing without a recall', async () => {
    const { takeBack } = composer(undefined)
    await expect(takeBack.take()).resolves.toBe(false)
  })

  it('takes once while a take is out', async () => {
    const { recall, answer } = outstanding()
    const { box, takeBack } = composer(recall)
    const first = takeBack.take()
    await expect(takeBack.take()).resolves.toBe(false)
    expect(recall.take).toHaveBeenCalledTimes(1)
    answer([{ text: 'also the docs' }])
    await expect(first).resolves.toBe(true)
    expect(box.text).toBe('also the docs')

    void takeBack.take()
    expect(recall.take).toHaveBeenCalledTimes(2)
  })

  it('leaves the box and tells the host nothing when everything was read first', async () => {
    const recall = waiting([])
    const { box, takeBack } = composer(recall)
    await expect(takeBack.take()).resolves.toBe(false)
    expect(box.text).toBe('')
    expect(recall.placed).not.toHaveBeenCalled()
  })

  it('takes only into an empty box when asked, as a terminal refills only an empty line', async () => {
    const recall = waiting([{ text: 'rerun the flaky test' }])
    const { box, takeBack } = composer(recall)
    box.pastes = [saved]
    await expect(takeBack.take({ ifEmpty: true })).resolves.toBe(false)
    expect(recall.take).not.toHaveBeenCalled()

    box.pastes = []
    await expect(takeBack.take({ ifEmpty: true })).resolves.toBe(true)
    expect(box.text).toBe('rerun the flaky test')
  })

  it('lets a shown message go when the box fills while a take for an empty one is out', async () => {
    const { recall, answer } = outstanding()
    const { box, takeBack } = composer(recall)
    const took = takeBack.take({ ifEmpty: true })
    box.text = 'my next message'
    const failed = { text: 'the failed one', shown: true }
    const queued = { text: 'the queued one' }
    answer([failed, queued])
    await expect(took).resolves.toBe(true)
    expect(box.text).toBe('the queued one\n\nmy next message')
    expect(recall.placed).toHaveBeenCalledExactlyOnceWith([queued])
    expect(recall.placed.mock.calls[0]?.[0][0]).toBe(queued)
  })

  it('tells the host nothing went in when the box filled meanwhile let everything go', async () => {
    const { recall, answer } = outstanding()
    const { box, takeBack } = composer(recall)
    const took = takeBack.take({ ifEmpty: true })
    box.text = 'my next message'
    answer([{ text: 'the failed one', shown: true }])
    await expect(took).resolves.toBe(false)
    expect(box.text).toBe('my next message')
    expect(recall.placed).toHaveBeenCalledExactlyOnceWith([])
  })

  it('brings a shown message back over what was typed when the take did not ask for an empty box', async () => {
    const { recall, answer } = outstanding()
    const { box, takeBack } = composer(recall)
    const took = takeBack.take()
    box.text = 'my next message'
    answer([{ text: 'the failed one', shown: true }])
    await expect(took).resolves.toBe(true)
    expect(box.text).toBe('the failed one\n\nmy next message')
  })

  it('puts back into the box the take started from, after the composer moved on', async () => {
    const { recall, answer } = outstanding()
    const first = { text: '', put: vi.fn() }
    const second = { text: '', put: vi.fn() }
    let showing = first
    const takeBack = createTakeBack({
      recall: () => recall,
      box: () => {
        const at = showing
        return { holds: () => at.text !== '', put: at.put }
      },
    })
    const took = takeBack.take()
    showing = second
    answer([{ text: 'also the docs' }])
    await expect(took).resolves.toBe(true)
    expect(first.put).toHaveBeenCalledExactlyOnceWith('also the docs', [])
    expect(second.put).not.toHaveBeenCalled()
  })

  it('answers false when the take fails, and can take again', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recall = { available: true, take: vi.fn(), placed: vi.fn() }
    recall.take.mockRejectedValueOnce(new Error('Failed to fetch'))
    recall.take.mockResolvedValueOnce([{ text: 'also the docs' }])
    const { box, takeBack } = composer(recall)
    await expect(takeBack.take()).resolves.toBe(false)
    expect(recall.placed).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledOnce()

    await expect(takeBack.take()).resolves.toBe(true)
    expect(box.text).toBe('also the docs')
    error.mockRestore()
  })

  describe('handleKey', () => {
    const up: ComposerKey = { key: 'ArrowUp' }

    it('takes back on ↑ in a box with nothing but blanks typed', async () => {
      const recall = waiting([{ text: 'also the docs' }])
      const { box, takeBack } = composer(recall)
      expect(takeBack.handleKey({ ...up, shiftKey: false, isComposing: false }, ' \n')).toBe(true)
      expect(recall.take).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => expect(box.text).toBe('also the docs'))
    })

    it.each(['shiftKey', 'altKey', 'metaKey', 'ctrlKey'] as const)(
      'leaves ↑ with %s held to the box',
      (modifier) => {
        const recall = waiting([{ text: 'also the docs' }])
        const { takeBack } = composer(recall)
        expect(takeBack.handleKey({ ...up, [modifier]: true }, '')).toBe(false)
        expect(recall.take).not.toHaveBeenCalled()
      },
    )

    it('leaves ↑ to an input method still composing', () => {
      const recall = waiting([{ text: 'also the docs' }])
      const { takeBack } = composer(recall)
      expect(takeBack.handleKey({ ...up, isComposing: true }, '')).toBe(false)
      expect(recall.take).not.toHaveBeenCalled()
    })

    it('leaves the arrows to the caret in a draft, and other keys alone', () => {
      const recall = waiting([{ text: 'also the docs' }])
      const { takeBack } = composer(recall)
      expect(takeBack.handleKey(up, 'a draft')).toBe(false)
      expect(takeBack.handleKey({ key: 'ArrowDown' }, '')).toBe(false)
      expect(recall.take).not.toHaveBeenCalled()
    })

    it('leaves ↑ to the history when nothing waits, or there is no recall', () => {
      const recall = { ...waiting([]), available: false }
      expect(composer(recall).takeBack.handleKey(up, '')).toBe(false)
      expect(recall.take).not.toHaveBeenCalled()
      expect(composer(undefined).takeBack.handleKey(up, '')).toBe(false)
    })

    it('keeps ↑ while a take is out, though nothing waits any more, without taking again', () => {
      const { recall } = outstanding()
      const { takeBack } = composer(recall)
      expect(takeBack.handleKey(up, '')).toBe(true)
      recall.available = false
      expect(takeBack.handleKey(up, '')).toBe(true)
      expect(recall.take).toHaveBeenCalledTimes(1)
    })
  })
})
