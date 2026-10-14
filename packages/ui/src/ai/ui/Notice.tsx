import type { ReactNode } from 'react'
import { type Tone, toneIcon, toneSurface, toneText } from '../../components/tone'
import { cx } from '../../cx'
import { CloseIcon, ErrorIcon, InfoIcon, WarningIcon } from '../../icons'

/** The tones a notice takes: the theme's status tones, so a notice reads the
 *  same as a badge or a callout in that status, on every theme. */
export type NoticeTone = Extract<Tone, 'default' | 'info' | 'warning' | 'error'>

const toneIconComponent = {
  default: InfoIcon,
  info: InfoIcon,
  warning: WarningIcon,
  error: ErrorIcon,
} as const

function NoticeIcon({ tone, className }: { tone: NoticeTone; className?: string }) {
  const Icon = toneIconComponent[tone]
  return <Icon aria-hidden="true" className={cx('shrink-0', toneIcon[tone], className)} />
}

// Spelled out so Tailwind sees each class.
const actionHover: Record<NoticeTone, string> = {
  default: 'hover:theme-hover',
  info: 'hover:bg-(--theme-info-muted)',
  warning: 'hover:bg-(--theme-warning-muted)',
  error: 'hover:bg-(--theme-error-muted)',
}

/** A link or button at the end of a notice: in the notice's own text color,
 *  with a tint of it on hover, so it reads as part of the notice. */
export function noticeActionClassName(tone: NoticeTone): string {
  return cx(
    'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
    toneText[tone],
    actionHover[tone],
  )
}

/** A standing condition on the surface: a full-width bar under the header
 *  with a title, an explanation, and the one thing the reader can do about it. */
export function NoticeBar({
  tone,
  title,
  children,
  action,
  onAction,
  testId,
}: {
  tone: NoticeTone
  title: string
  children?: ReactNode
  action?: string
  onAction?: () => void
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className={cx('flex shrink-0 items-start gap-3 border-b px-6 py-3', toneSurface[tone])}
    >
      <NoticeIcon tone={tone} className="mt-0.5 h-4 w-4" />
      <div className="min-w-0 flex-1">
        <p className={cx('text-sm font-medium', toneText[tone])}>{title}</p>
        {children && <p className="mt-0.5 text-xs theme-muted-text">{children}</p>}
      </div>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-lg border theme-border bg-(--theme-panel-bg) px-3 py-1.5 text-xs theme-text hover:theme-hover"
        >
          {action}
        </button>
      )}
    </div>
  )
}

/** What a command printed, kept verbatim under the command that printed it. */
export function OutputCard({
  title,
  text,
  onDismiss,
  dismissLabel,
  testId,
}: {
  title: string
  text: string
  onDismiss?: () => void
  dismissLabel?: string
  testId?: string
}) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className="relative my-3 rounded-lg border theme-border theme-muted-panel px-3 py-2"
    >
      <p className={cx('font-mono text-[11px] theme-muted-text', onDismiss && 'pr-6')}>{title}</p>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs theme-text">
        {text}
      </pre>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
          className="absolute top-1.5 right-1.5 rounded p-1 theme-muted-text hover:theme-hover"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </section>
  )
}

/** An inline notice next to the composer or over the thread. One with no
 *  dismiss states a fact that is still true; one with a dismiss is a message
 *  the reader can put away. With a `title` it leads with the tone's icon and
 *  the title, with the children as its explanation, and `action` at its end
 *  (a link or button styled with `noticeActionClassName`). */
export function NoticeCard({
  tone = 'default',
  title,
  children,
  action,
  onDismiss,
  dismissLabel,
  testId,
}: {
  tone?: NoticeTone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
  dismissLabel?: string
  testId?: string
}) {
  const dismiss = onDismiss && (
    <button
      type="button"
      onClick={onDismiss}
      aria-label={dismissLabel}
      title={dismissLabel}
      className="shrink-0 rounded p-0.5 hover:theme-hover"
    >
      <CloseIcon className="h-3 w-3" />
    </button>
  )
  if (title) {
    return (
      <div
        data-testid={testId}
        className={cx('flex items-start gap-3 rounded-lg border p-3', toneSurface[tone])}
      >
        <NoticeIcon tone={tone} className="mt-0.5 h-4 w-4" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          {children && <div className="mt-0.5 text-xs">{children}</div>}
        </div>
        {action}
        {dismiss}
      </div>
    )
  }
  return (
    <div
      data-testid={testId}
      className={cx(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
        toneSurface[tone],
      )}
    >
      <span className="flex-1">{children}</span>
      {action}
      {dismiss}
    </div>
  )
}
