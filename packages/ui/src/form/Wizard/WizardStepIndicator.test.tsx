// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import type { StepFieldConfig } from './types'
import { WizardStepIndicator } from './WizardStepIndicator'

describe('WizardStepIndicator', () => {
  const stepOrder = Array.from({ length: 10 }, (_, index) => `site[${index}]`)
  const steps: Record<string, StepFieldConfig> = Object.fromEntries(
    stepOrder.map((key, index) => [
      key,
      { type: 'step', title: `Site ${index + 1}`, options: {} } satisfies StepFieldConfig,
    ]),
  )
  const indicator = (currentStep: string) => (
    <WizardStepIndicator
      stepOrder={stepOrder}
      currentStep={currentStep}
      steps={steps}
      visitedSteps={new Set()}
      invalidSteps={new Set()}
      onStepClick={() => true}
    />
  )

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('scrolls its row to bring the current step into view when the steps overflow it', () => {
    // A 300px row holding 1000px of steps, each 80px wide and 100px after the one before it.
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(1000)
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300)
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      // A step is the column holding its dot; anything else measures as the row.
      const isStep = this.querySelector(':scope > button') !== null
      const left = isStep ? [...(this.parentElement?.children ?? [])].indexOf(this) * 100 : 0
      const width = isStep ? 80 : 300
      return { left, right: left + width, width } as DOMRect
    })
    const scrolled = vi.spyOn(Element.prototype, 'scrollLeft', 'set')
    const { rerender } = render(indicator('site[1]'))
    expect(scrolled).not.toHaveBeenCalled()
    rerender(indicator('site[8]'))
    expect(scrolled).toHaveBeenLastCalledWith(800 - (300 - 80) / 2)
    expect(screen.getByRole('button', { name: /^Step 9:/ })).toHaveAttribute('aria-current', 'step')
    // With no dot to focus, the keyboard scrolls the row itself.
    expect(screen.getByRole('list', { name: 'Steps' })).toHaveAttribute('tabindex', '0')
  })

  it('takes no focus of its own when its steps fit', () => {
    render(indicator('site[1]'))
    expect(screen.getByRole('list', { name: 'Steps' })).not.toHaveAttribute('tabindex')
  })

  it('takes focus once a step widens past the row, though the row keeps its size', () => {
    const watched: Element[] = []
    let resized = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback
        }
        observe(box: Element) {
          watched.push(box)
        }
        disconnect() {}
      },
    )
    const width = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(300)
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300)
    render(indicator('site[1]'))
    const row = screen.getByRole('list', { name: 'Steps' })
    expect(watched).toEqual(expect.arrayContaining([row, ...row.children]))
    width.mockReturnValue(1000)
    act(() => resized())
    expect(row).toHaveAttribute('tabindex', '0')
    vi.unstubAllGlobals()
  })
})
