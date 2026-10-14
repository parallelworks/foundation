// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NoticeBar, NoticeCard, type NoticeTone } from './Notice'

afterEach(cleanup)

const STATUS: Exclude<NoticeTone, 'default'>[] = ['info', 'warning', 'error']

describe('notice tones', () => {
  it.each(STATUS)('a %s card takes its colors from the theme status tokens', (tone) => {
    render(
      <NoticeCard tone={tone} title="Title" testId="card">
        Body
      </NoticeCard>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).toContain(`bg-(--theme-${tone}-muted)`)
    expect(card.className).toContain(`text-(--theme-${tone}-text)`)
    expect(card.querySelector('svg')?.getAttribute('class')).toContain(`text-(--theme-${tone})`)
    expect(card.className).not.toMatch(/(red|amber|blue)-\d/)
  })

  it.each(STATUS)('a %s bar takes its colors from the theme status tokens', (tone) => {
    render(<NoticeBar tone={tone} title="Title" testId="bar" />)
    const bar = screen.getByTestId('bar')
    expect(bar.className).toContain(`bg-(--theme-${tone}-muted)`)
    expect(screen.getByText('Title').className).toContain(`text-(--theme-${tone}-text)`)
  })

  it('a titled card shows its action and explanation', () => {
    render(
      <NoticeCard tone="warning" title="Key rejected" action={<a href="/settings">Manage</a>}>
        Update the key.
      </NoticeCard>,
    )
    expect(screen.getByText('Key rejected')).toBeInTheDocument()
    expect(screen.getByText('Update the key.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/settings')
  })
})
