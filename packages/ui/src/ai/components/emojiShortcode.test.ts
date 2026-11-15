import { closeShortcode, emojiMatches, insertEmoji, typingShortcode } from './emojiShortcode'

describe('typingShortcode', () => {
  it.each([
    [':ey', 'ey', 0],
    ['look :ey', 'ey', 5],
    ['look\n:EY', 'ey', 5],
    [':+1', '+1', 0],
  ])('reads %j as typing %j from %i', (text, query, start) => {
    expect(typingShortcode(text, text.length)).toEqual({ query, start })
  })

  it('reads the word before the caret, and keeps what follows it', () => {
    expect(typingShortcode('look :ey later', 'look :ey'.length)).toEqual({ query: 'ey', start: 5 })
  })

  it.each([
    [':e'],
    [':'],
    ['eyes'],
    ['10:30'],
    ['https://example.com/:eyes'],
    [':eyes:'],
    ['::eyes'],
  ])('offers nothing for %j', (text) => {
    expect(typingShortcode(text, text.length)).toBeNull()
  })

  it('offers nothing with the caret inside a word', () => {
    expect(typingShortcode(':eyes', 3)).toBeNull()
  })
})

describe('emojiMatches', () => {
  it('lists names that start with the query first, the shorter first', () => {
    expect(emojiMatches('ey').map((m) => m.name)).toEqual([
      'eye',
      'eyes',
      'eyeglasses',
      'eye_speech_bubble',
      'key',
      'donkey',
      'hankey',
      'jersey',
    ])
  })

  it('pairs each name with its emoji', () => {
    expect(emojiMatches('eyes')[0]).toEqual({ name: 'eyes', emoji: '👀' })
  })

  it('finds nothing for a name no emoji has', () => {
    expect(emojiMatches('notanemoji')).toEqual([])
  })
})

describe('insertEmoji', () => {
  it('replaces the shortcode with the emoji and a space', () => {
    expect(insertEmoji('look :ey', 5, 8, '👀')).toEqual({
      text: 'look 👀 ',
      caret: 'look 👀 '.length,
    })
  })

  it('keeps what follows the caret, and adds no second space', () => {
    expect(insertEmoji('look :ey later', 5, 8, '👀')).toEqual({
      text: 'look 👀 later',
      caret: 'look 👀'.length,
    })
  })
})

const typeColon = (text: string, caret = text.length) =>
  closeShortcode(text, `${text.slice(0, caret)}:${text.slice(caret)}`, caret + 1)

describe('closeShortcode', () => {
  it.each([
    [':eyes', '👀'],
    ['look :eyes', 'look 👀'],
    ['look\n:eyes', 'look\n👀'],
    ['look\t:eyes', 'look\t👀'],
    [':EYES', '👀'],
    [':x', '❌'],
    [':+1', '👍'],
    [':thumbsup', '👍'],
    [':woman_technologist', '👩‍💻'],
    ['👀 :heart', '👀 ❤️'],
  ])('replaces %j and its closing colon with the emoji', (typed, want) => {
    expect(typeColon(typed)).toEqual({ text: want, caret: want.length })
  })

  it('keeps the text after the caret and puts the caret after the emoji', () => {
    expect(typeColon('你好 :eyes later', '你好 :eyes'.length)).toEqual({
      text: '你好 👀 later',
      caret: '你好 👀'.length,
    })
  })

  it.each([
    [':ey'],
    [':notanemoji'],
    ['note'],
    [':'],
    [''],
    ['https://example.com/:eyes'],
    ['::eyes'],
    ['10:eyes'],
    [':constructor'],
    [':__proto__'],
  ])('leaves %j as typed', (typed) => {
    expect(typeColon(typed)).toBeNull()
  })

  it('leaves a shortcode that did not end at the typed colon', () => {
    expect(typeColon(':eyes later', ':eyes later'.length)).toBeNull()
  })

  it('leaves a whole shortcode that arrived at once, such as a paste', () => {
    expect(closeShortcode('look ', 'look :eyes:', 'look :eyes:'.length)).toBeNull()
    expect(closeShortcode(':eyes:', ':eyes:', ':eyes:'.length)).toBeNull()
  })

  it('leaves a colon that replaced a selection', () => {
    expect(closeShortcode(':eyesX', ':eyes:', ':eyes:'.length)).toBeNull()
  })
})
