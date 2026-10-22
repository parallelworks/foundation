import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Checkbox } from '../../../components/Checkbox'
import { fieldBox, focusOutline } from '../../../components/fieldBox'
import { useStrings } from '../../../components/Provider'
import { TabPanel, Tabs } from '../../../components/Tabs'
import { cx } from '../../../cx'
import { ArrowRightIcon, ChatIcon, CheckIcon } from '../../../icons'
import { type PartRendererProps, useChatConfig } from '../../core/config'
import type { ApprovalPart, ApprovalQuestion, ApprovalQuestionAnswer } from '../../types'

/** What the reader has given one question so far. */
interface Given {
  picked: string[]
  /** Answering in their own words; a question without options always is. */
  own: boolean
  text: string
}

const optionRow =
  'flex w-full items-start gap-2 rounded-md border px-3 py-1.5 text-left text-xs hover:theme-hover'
const primaryButton =
  'px-3 py-1 text-xs font-medium rounded-full bg-(--theme-accent) text-(--theme-accent-text) disabled:opacity-50'
const outlineButton =
  'px-3 py-1 text-xs font-medium rounded-full border theme-border hover:theme-hover'
const quietButton = 'px-3 py-1 text-xs rounded-full theme-muted-text hover:theme-hover'

function answerOf(question: ApprovalQuestion, given: Given | undefined): ApprovalQuestionAnswer {
  // In option order, however they were ticked.
  const picked = (question.options ?? [])
    .map((o) => o.label)
    .filter((label) => given?.picked.includes(label))
  const text = given?.own ? given.text.trim() : ''
  return { ...(picked.length > 0 ? { picked } : {}), ...(text ? { text } : {}) }
}

function hasAnswer(answer: ApprovalQuestionAnswer | undefined): boolean {
  return (answer?.picked?.length ?? 0) > 0 || !!answer?.text
}

/** An answer on one line: the options picked, then the reader's own words. */
function joinAnswer(answer: ApprovalQuestionAnswer | undefined): string {
  return [...(answer?.picked ?? []), ...(answer?.text ? [answer.text] : [])].join(', ')
}

/** An ask's questions, answered here when the reader can, or listed with who has to answer. */
export function AskApproval({
  part,
  onAnswer,
}: {
  part: ApprovalPart
  onAnswer?: PartRendererProps['onApprovalAnswer']
}) {
  const questions = part.questions ?? []
  // An ask with no questions this card can read is answered where it was asked.
  if (!onAnswer || questions.length === 0) {
    return <AskPending part={part} questions={questions} />
  }
  return <AskForm id={part.id} questions={questions} onAnswer={onAnswer} />
}

function AskPending({ part, questions }: { part: ApprovalPart; questions: ApprovalQuestion[] }) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  return (
    <>
      {questions.map((q) => (
        <div key={q.question} className="space-y-0.5">
          <div className="text-sm">{q.question}</div>
          {(q.options ?? []).length > 0 && (
            <div className="text-xs theme-muted-text">
              <span className="font-medium">{t.approvalOptions}: </span>
              {(q.options ?? []).map((o) => o.label).join(' · ')}
            </div>
          )}
        </div>
      ))}
      <div className="text-xs theme-muted-text">
        {part.waitingOn ? t.approvalWaitingOn(part.waitingOn) : t.approvalPending}
      </div>
    </>
  )
}

function AskForm({
  id,
  questions,
  onAnswer,
}: {
  id: string
  questions: ApprovalQuestion[]
  onAnswer: NonNullable<PartRendererProps['onApprovalAnswer']>
}) {
  const { strings } = useChatConfig()
  const { common } = useStrings()
  const t = strings.agentTranscript
  const [given, setGiven] = useState<Given[]>(() =>
    questions.map((q) => ({ picked: [], own: (q.options ?? []).length === 0, text: '' })),
  )
  const [active, setActive] = useState(0)
  const body = useRef<HTMLDivElement>(null)
  const submit = useRef<HTMLButtonElement>(null)
  // The question an answer moved on to, whose first control takes focus once it shows.
  const focusNext = useRef<number | null>(null)
  const several = questions.length > 1
  const answers = questions.map((q, i) => answerOf(q, given[i]))

  const send = (all: ApprovalQuestionAnswer[], chat: boolean) =>
    onAnswer(id, { kind: 'ask', answers: all, ...(chat ? { chat: true } : {}) })

  // A question with its answer moves on to the next, the last to Submit; a lone one sends.
  const done = (i: number, next: Given) => {
    const all = given.map((g, j) => (j === i ? next : g))
    setGiven(all)
    if (!several) {
      send(
        questions.map((q, j) => answerOf(q, all[j])),
        false,
      )
    } else if (i < questions.length - 1) {
      focusNext.current = i + 1
      setActive(i + 1)
    } else {
      submit.current?.focus()
    }
  }

  useEffect(() => {
    if (focusNext.current === active) {
      focusNext.current = null
      body.current?.querySelector<HTMLElement>('button, input')?.focus()
    }
  }, [active])

  const fields = (q: ApprovalQuestion, i: number) => (
    <div ref={i === active ? body : undefined} className="space-y-2">
      <div className="text-sm">{q.question}</div>
      <AskQuestionFields
        question={q}
        given={given[i] ?? { picked: [], own: false, text: '' }}
        several={several}
        onChange={(next) => setGiven(given.map((g, j) => (j === i ? next : g)))}
        onDone={(next) => done(i, next)}
      />
    </div>
  )

  const lone = questions[0]
  // A lone single-select question sends with its pick, and a lone typed answer with its own Send.
  const loneMulti = !several && !!lone?.multiSelect && (lone.options ?? []).length > 0
  return (
    <>
      {several ? (
        <Tabs
          label={t.questionsLabel}
          items={questions.map((q, i) => ({
            value: String(i),
            label: q.header || t.questionTab(i + 1),
            ...(hasAnswer(answers[i])
              ? { icon: <CheckIcon aria-hidden="true" className="size-3.5" /> }
              : {}),
          }))}
          value={String(active)}
          onValueChange={(value) => setActive(Number(value))}
        >
          {questions.map((q, i) => (
            <TabPanel key={q.question} value={String(i)} className="pt-2">
              {fields(q, i)}
            </TabPanel>
          ))}
        </Tabs>
      ) : (
        lone && fields(lone, 0)
      )}
      {several && (
        <div className="text-xs theme-muted-text">
          {t.answeredCount(answers.filter(hasAnswer).length, questions.length)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {(several || loneMulti) && (
          <button
            ref={submit}
            type="button"
            onClick={() => send(answers, false)}
            className={primaryButton}
          >
            {several ? t.submitAnswers : common.send}
          </button>
        )}
        <button
          type="button"
          onClick={() => send(answers, true)}
          className={several ? outlineButton : quietButton}
        >
          {t.chatAboutThis}
        </button>
      </div>
    </>
  )
}

/** One question's options and own answer: picks for a single-select question, ticks for a multi-select one. */
function AskQuestionFields({
  question,
  given,
  several,
  onChange,
  onDone,
}: {
  question: ApprovalQuestion
  given: Given
  several: boolean
  onChange: (next: Given) => void
  onDone: (next: Given) => void
}) {
  const { strings } = useChatConfig()
  const { common } = useStrings()
  const t = strings.agentTranscript
  const options = question.options ?? []
  const multi = !!question.multiSelect && options.length > 0
  // Only a field the reader just opened takes focus, never one shown again with its question.
  const opened = useRef(false)
  const open = (next: Given) => {
    opened.current = true
    onChange(next)
  }
  const submitOwn = (e: FormEvent) => {
    e.preventDefault()
    // A blank answer is one still being written.
    if (given.text.trim()) {
      onDone(given)
    }
  }
  const ownField = (
    <form className="flex gap-2" onSubmit={submitOwn}>
      <input
        ref={(field) => {
          if (field && opened.current) {
            opened.current = false
            field.focus()
          }
        }}
        value={given.text}
        onChange={(e) => onChange({ ...given, text: e.target.value })}
        aria-label={t.ownAnswerLabel}
        placeholder={options.length > 0 ? t.ownAnswerLabel : t.typeYourAnswer}
        className={cx(fieldBox({ size: 'sm' }), 'flex-1')}
      />
      {/* Several questions move on with Enter, under one Submit for them all. */}
      {!several && !multi && (
        <button type="submit" disabled={!given.text.trim()} className={primaryButton}>
          {common.send}
        </button>
      )}
    </form>
  )

  if (options.length === 0) {
    return ownField
  }
  if (multi) {
    return (
      <div className="flex flex-col gap-1.5">
        {options.map((o) => {
          const ticked = given.picked.includes(o.label)
          return (
            <label key={o.label} className={cx(optionRow, 'cursor-pointer theme-border')}>
              <Checkbox
                checked={ticked}
                onCheckedChange={(on) =>
                  onChange({
                    ...given,
                    picked: on
                      ? [...given.picked, o.label]
                      : given.picked.filter((label) => label !== o.label),
                  })
                }
                className="mt-px"
              />
              <OptionText label={o.label} description={o.description} />
            </label>
          )
        })}
        <label className={cx(optionRow, 'cursor-pointer theme-border')}>
          <Checkbox
            checked={given.own}
            onCheckedChange={(on) => {
              if (on) {
                open({ ...given, own: true })
              } else {
                onChange({ ...given, own: false })
              }
            }}
            className="mt-px"
          />
          <span className="theme-muted-text">{t.writeOwnAnswer}</span>
        </label>
        {given.own && ownField}
      </div>
    )
  }
  // Rows rather than a radio group, so moving through them with the keyboard never picks one.
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => {
        const picked = given.picked.includes(o.label)
        return (
          <button
            key={o.label}
            type="button"
            aria-pressed={several ? picked : undefined}
            onClick={() => onDone({ ...given, picked: [o.label], own: false })}
            className={cx(
              optionRow,
              focusOutline,
              picked ? 'border-(--theme-focus)' : 'theme-border',
            )}
          >
            <PickMark picked={picked} />
            <OptionText label={o.label} description={o.description} />
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={several ? given.own : undefined}
        onClick={() => open({ ...given, picked: [], own: true })}
        className={cx(
          optionRow,
          focusOutline,
          given.own ? 'border-(--theme-focus)' : 'theme-border',
        )}
      >
        <PickMark picked={given.own} />
        <span className="theme-muted-text">{t.writeOwnAnswer}</span>
      </button>
      {given.own && ownField}
    </div>
  )
}

/** A single-select row's mark, drawn as the package's radio is. */
function PickMark({ picked }: { picked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'mt-px flex size-4 shrink-0 items-center justify-center rounded-full border',
        picked
          ? 'border-(--theme-focus) bg-(--theme-accent)'
          : 'border-(--theme-border-strong) bg-(--theme-input-bg)',
      )}
    >
      {picked && <span className="size-1.5 rounded-full bg-(--theme-accent-text)" />}
    </span>
  )
}

function OptionText({ label, description }: { label: string; description?: string | undefined }) {
  return (
    <span className="min-w-0">
      <span className="block font-medium">{label}</span>
      {description && <span className="block theme-muted-text">{description}</span>}
    </span>
  )
}

/** A settled ask: each question with what it was given, or the one answer an older record kept. */
export function AskAnswered({ part }: { part: ApprovalPart }) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  const answers = part.answers
  return (
    <>
      {(part.questions ?? []).map((q, i) => (
        <div key={q.question}>
          <div className="theme-text">{q.question}</div>
          {answers && (
            <div className="flex items-center gap-1.5">
              <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0" />
              {hasAnswer(answers[i]) ? (
                <span className="theme-text">{joinAnswer(answers[i])}</span>
              ) : (
                <span className="italic">{t.noAnswer}</span>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        {part.chat ? <ChatIcon className="w-3.5 h-3.5" /> : <CheckIcon className="w-3.5 h-3.5" />}
        <span>
          {part.chat ? t.chatAboutThis : t.answered}
          {!answers && part.answer ? `: ${part.answer}` : ''}
        </span>
      </div>
    </>
  )
}
