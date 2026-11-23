import { Disclosure } from '../../components/Disclosure'
import { withPathBreaks } from '../../components/pathBreaks'
import { cx } from '../../cx'
import type { CommandAnswer as Answer } from '../types'
import Markdown from '../ui/Markdown'
import { chatProseClasses } from '../ui/prose'

/** What a command the person ran answered, hung under their message as a
 *  terminal draws it rather than drawn as a reply. A document the command
 *  showed, such as a plan, sits under it in a box, so it reads as a
 *  document and not as something the agent said. */
export default function CommandAnswer({
  answer,
  alignEnd,
  afterAvatar = false,
}: {
  answer: Answer
  /** Under a message drawn at the end of the row, as the reader's own are. */
  alignEnd: boolean
  /** Under a message with its author's avatar before it. */
  afterAvatar?: boolean | undefined
}) {
  const text = (
    <span
      className={cx(
        'block min-w-0 whitespace-pre-wrap wrap-break-word',
        alignEnd ? 'text-end' : 'text-start',
      )}
    >
      {withPathBreaks(answer.text)}
    </span>
  )
  return (
    <>
      <div
        className={cx(
          'flex max-w-[80%] items-start gap-1.5 text-sm theme-muted-text',
          // The hook drops from under the message's text, at its padding: from the end of
          // the reader's own, which end the row, and from the start of anyone else's.
          alignEnd ? 'flex-row-reverse self-end pe-4' : afterAvatar ? 'ps-11' : 'ps-4',
        )}
        data-testid="command-answer"
      >
        <span
          aria-hidden="true"
          className={cx(
            // -mt-1 reaches up through the message list's space-y-1 to meet the message's edge,
            // and h-3.5 brings the turn level with the middle of the answer's first line.
            '-mt-1 h-3.5 w-3 shrink-0 border-b border-current opacity-40',
            alignEnd ? 'rounded-ee-md border-e' : 'rounded-es-md border-s',
          )}
          data-testid="command-answer-hook"
        />
        <div className="min-w-0">
          {answer.detail ? (
            <Disclosure
              summary={text}
              summaryClassName="hover:theme-text"
              panelClassName="mt-1 text-sm"
            >
              <Markdown>{answer.detail}</Markdown>
            </Disclosure>
          ) : (
            text
          )}
        </div>
      </div>
      {answer.document && (
        <div
          className={cx(
            chatProseClasses,
            'mt-2 w-full self-stretch rounded-lg border theme-border px-4 py-3 text-start',
          )}
          data-testid="command-document"
        >
          <Markdown>{answer.document}</Markdown>
        </div>
      )}
    </>
  )
}
