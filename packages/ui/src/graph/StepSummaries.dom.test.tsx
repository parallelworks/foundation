// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

import { UIProvider } from '../components/Provider'
import { StepSummaries } from './StepSummaries'
import type { WorkflowJob } from './types'

const observers: IntersectionObserverInit[] = []
global.IntersectionObserver = class {
  constructor(_callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    observers.push(options)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
} as unknown as typeof IntersectionObserver

afterEach(() => {
  cleanup()
  observers.length = 0
})

const jobs: Record<string, WorkflowJob> = {
  test: {
    status: 'completed',
    steps: [{ name: 'Run tests', status: 'completed', summary: { bytes: 10 } }],
  },
}

function renderIn(wrap: (summaries: ReactNode) => ReactNode) {
  render(
    <UIProvider
      data={{ useRunFile: () => ({ data: undefined, isLoading: false, error: undefined }) }}
    >
      {wrap(<StepSummaries runSlug="run-1" jobs={jobs} onOpenLog={() => {}} />)}
    </UIProvider>,
  )
}

describe('StepSummaries loading ahead', () => {
  it('measures the margin from the box the cards scroll in', () => {
    renderIn((summaries) => (
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <div style={{ overflow: 'hidden' }}>{summaries}</div>
      </div>
    ))
    expect(observers).toEqual([{ root: screen.getByTestId('scroller'), rootMargin: '200% 0px' }])
  })

  it('measures it from the window when nothing scrolls', () => {
    renderIn((summaries) => summaries)
    expect(observers).toEqual([{ root: null, rootMargin: '200% 0px' }])
  })
})
