import { renderToStaticMarkup } from 'react-dom/server'
import { UIProvider } from './components/Provider'
import { formatDateTime, UIStringsProvider, useClock, useLocale, useStrings } from './headless'

const START = Date.UTC(2026, 0, 1, 12)
const MINUTE = 60_000

// Each request a server answers starts a task of its own.
const nextRequest = () => new Promise((resolve) => setTimeout(resolve))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

function Age({ at }: { at: number }) {
  const t = useStrings().time
  const minutes = useClock((now) => Math.floor((now - at) / MINUTE))
  return <span>{minutes < 1 ? t.now : t.minutes(minutes)}</span>
}

function Locale() {
  return <span>{useLocale() ?? 'none'}</span>
}

function Day() {
  return <span>{formatDateTime('2026-03-14T12:00', 'date', useLocale())}</span>
}

const spans = (html: string) => html.match(/<span>[^<]*<\/span>/g)

describe('headless', () => {
  it('renders where there is no DOM', () => {
    expect(typeof document).toBe('undefined')
    expect(renderToStaticMarkup(<Age at={START - 5 * MINUTE} />)).toBe('<span>5m</span>')
  })

  it('reads the time each render happens at, not when the clock loaded', async () => {
    const at = START - 5 * MINUTE
    expect(renderToStaticMarkup(<Age at={at} />)).toBe('<span>5m</span>')
    await nextRequest()
    vi.setSystemTime(START + 60 * MINUTE)
    expect(renderToStaticMarkup(<Age at={at} />)).toBe('<span>65m</span>')
  })

  it('translates through UIStringsProvider, over the English defaults', () => {
    const html = renderToStaticMarkup(
      <UIStringsProvider strings={{ time: { minutes: (n) => `${n} Min.` } }}>
        <Age at={START - 5 * MINUTE} />
        <Age at={START} />
      </UIStringsProvider>,
    )
    expect(html).toBe('<span>5 Min.</span><span>now</span>')
  })

  it("gives UIStringsProvider's locale to useLocale and the formatters", () => {
    expect(spans(renderToStaticMarkup(<Locale />))).toEqual(['<span>none</span>'])
    const html = renderToStaticMarkup(
      <UIStringsProvider locale="de-DE">
        <Locale />
        <Day />
      </UIStringsProvider>,
    )
    expect(spans(html)).toEqual(['<span>de-DE</span>', '<span>14. März 2026</span>'])
  })

  it("reads UIProvider's strings", () => {
    const html = renderToStaticMarkup(
      <UIProvider strings={{ time: { now: 'jetzt' } }}>
        <Age at={START} />
      </UIProvider>,
    )
    expect(html).toContain('<span>jetzt</span>')
  })

  it("reads UIProvider's locale, which a UIStringsProvider without one keeps", () => {
    const html = renderToStaticMarkup(
      <UIProvider locale="de-DE">
        <Locale />
        <UIStringsProvider strings={{ time: { now: 'jetzt' } }}>
          <Locale />
        </UIStringsProvider>
        <UIStringsProvider locale="fr-FR">
          <Locale />
        </UIStringsProvider>
        <UIProvider>
          <Locale />
        </UIProvider>
      </UIProvider>,
    )
    expect(spans(html)).toEqual([
      '<span>de-DE</span>',
      '<span>de-DE</span>',
      '<span>fr-FR</span>',
      '<span>none</span>',
    ])
  })
})
