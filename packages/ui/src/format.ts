import { Duration, type DurationObjectUnits } from 'luxon'

// Numbers read in the reader's own locale; the units stay the symbols everyone reads.
const sizeNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/** A size in bytes the way a file list shows it: 512 B, 1.5 KB, 2.25 GB,
 *  counting in 1024s. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1) {
    return `${sizeNumber.format(0)} B`
  }
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  return `${sizeNumber.format(bytes / 1024 ** unit)} ${BYTE_UNITS[unit]}`
}

const countNumber = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** A count short enough for a status line: 512, 1.2K, 3.4M. */
export function formatCount(n: number): string {
  return countNumber.format(n)
}

// Japanese has no narrow units and would fall back to English.
const UNIT_DISPLAY: Record<string, 'narrow' | 'short'> = { ja: 'short' }

/** A length of time to whole seconds, in the host's locale: 45s, 2m 13s,
 *  1d 2h. Takes milliseconds or a luxon Duration; the sign is dropped. */
export function formatDuration(value: number | Duration): string {
  const duration = typeof value === 'number' ? Duration.fromMillis(value) : value
  // shiftTo keeps the largest units whole; luxon's toHuman alone would print
  // "0 days, 0 hours, 3,723 seconds" (https://github.com/moment/luxon/issues/1134).
  const parts = duration.shiftTo('days', 'hours', 'minutes', 'seconds').toObject()
  if (parts.seconds !== undefined) {
    parts.seconds = Math.round(parts.seconds)
  }
  const shown = Object.fromEntries(
    Object.entries(parts)
      .filter(([, n]) => n !== 0)
      .map(([unit, n]) => [unit, Math.abs(n)]),
  ) as DurationObjectUnits
  const human = Duration.fromObject(
    Object.keys(shown).length > 0 ? shown : { seconds: 0 },
    duration.locale ? { locale: duration.locale } : {},
  )
  return human
    .toHuman({ unitDisplay: UNIT_DISPLAY[human.locale?.split('-')[0] ?? ''] ?? 'narrow' })
    .replaceAll(/[,、]/g, '')
}
