// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { GrowingTextarea } from './editorFields'

afterEach(cleanup)

describe('GrowingTextarea', () => {
  it('grows with each new value, not only the first', () => {
    // jsdom lays nothing out, so each line stands in as 20px of text.
    const scrollHeight = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(function (this: HTMLTextAreaElement) {
        return this.value.split('\n').length * 20
      })
    onTestFinished(() => scrollHeight.mockRestore())
    const { rerender } = render(
      <GrowingTextarea aria-label="Notes" value="one" onChange={() => {}} />,
    )
    const area = screen.getByLabelText('Notes')
    expect(area.style.height).toBe('20px')
    rerender(<GrowingTextarea aria-label="Notes" value={'one\ntwo\nthree'} onChange={() => {}} />)
    expect(area.style.height).toBe('60px')
  })
})
