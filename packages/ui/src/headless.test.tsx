import { renderToStaticMarkup } from 'react-dom/server'
import { UIProvider } from './components/Provider'
import { UIStringsProvider, useClock, useStrings } from './headless'

// The clock last read the time when this file loaded, so an age a little past five minutes still
// reads 5m by the time it renders.
const FIVE_MINUTES_AGO = Date.now() - 5.5 * 60_000

function Age({ at }: { at: number }) {
  const t = useStrings().time
  const minutes = useClock((now) => Math.floor((now - at) / 60_000))
  return <span>{minutes < 1 ? t.now : t.minutes(minutes)}</span>
}

describe('headless', () => {
  it('renders where there is no DOM', () => {
    expect(typeof document).toBe('undefined')
    expect(renderToStaticMarkup(<Age at={FIVE_MINUTES_AGO} />)).toBe('<span>5m</span>')
  })

  it('translates through UIStringsProvider, over the English defaults', () => {
    const html = renderToStaticMarkup(
      <UIStringsProvider strings={{ time: { minutes: (n) => `${n} Min.` } }}>
        <Age at={FIVE_MINUTES_AGO} />
        <Age at={Date.now()} />
      </UIStringsProvider>,
    )
    expect(html).toBe('<span>5 Min.</span><span>now</span>')
  })

  it("reads UIProvider's strings", () => {
    const html = renderToStaticMarkup(
      <UIProvider strings={{ time: { now: 'jetzt' } }}>
        <Age at={Date.now()} />
      </UIProvider>,
    )
    expect(html).toContain('<span>jetzt</span>')
  })
})
