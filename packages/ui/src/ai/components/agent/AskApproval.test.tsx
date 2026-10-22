// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatConfigProvider, resolveChatConfig } from '../../core/config'
import type { ApprovalPart, ApprovalQuestion } from '../../types'
import { AskApproval } from './AskApproval'

const database: ApprovalQuestion = {
  question: 'Which database?',
  header: 'Database',
  options: [{ label: 'Postgres', description: 'Relational' }, { label: 'Mongo' }],
}
const auth: ApprovalQuestion = {
  question: 'Which auth?',
  options: [{ label: 'OAuth' }, { label: 'SAML' }],
}
const checks: ApprovalQuestion = {
  question: 'Which checks?',
  header: 'Checks',
  multiSelect: true,
  options: [{ label: 'Lint' }, { label: 'Tests' }, { label: 'E2E' }],
}
const notes: ApprovalQuestion = { question: 'Anything else?', header: 'Notes' }

function renderAsk(questions: ApprovalQuestion[], extra?: Partial<ApprovalPart>) {
  const onAnswer = vi.fn()
  render(
    <ChatConfigProvider value={resolveChatConfig()}>
      <AskApproval
        part={{ kind: 'approval', id: 'q1', approvalKind: 'ask', questions, ...extra }}
        onAnswer={onAnswer}
      />
    </ChatConfigProvider>,
  )
  return onAnswer
}

const tab = (name: string) => screen.getByRole('tab', { name })

// The question left behind stays until its exit ends, a frame after the switch.
const switched = () => waitFor(() => expect(screen.getAllByRole('tabpanel')).toHaveLength(1))

describe('AskApproval with several questions', () => {
  it('shows a tab per question, named by its header or its place', () => {
    renderAsk([database, auth])
    expect(screen.getByRole('tablist', { name: 'Questions' })).toBeInTheDocument()
    expect(tab('Database')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Q2')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Which database?')).toBeVisible()
    expect(screen.getByText('0 of 2 answered')).toBeInTheDocument()
  })

  it('moves on to the next question with a pick, focusing its first choice', () => {
    renderAsk([database, auth])
    fireEvent.click(screen.getByRole('button', { name: /Postgres/ }))
    expect(tab('Q2')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'OAuth' })).toHaveFocus()
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument()
  })

  it('sends one answer per question, a blank one included', () => {
    const onAnswer = renderAsk([database, auth])
    fireEvent.click(screen.getByRole('button', { name: /Postgres/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }))
    expect(onAnswer).toHaveBeenCalledWith('q1', {
      kind: 'ask',
      answers: [{ picked: ['Postgres'] }, {}],
    })
  })

  it('takes an own answer in place of a pick', async () => {
    const onAnswer = renderAsk([database, auth])
    fireEvent.click(screen.getByRole('button', { name: /Postgres/ }))
    fireEvent.click(tab('Database'))
    await switched()
    fireEvent.click(screen.getByRole('button', { name: 'Write my own answer…' }))
    const field = screen.getByRole('textbox', { name: 'Your answer' })
    expect(field).toHaveFocus()
    fireEvent.change(field, { target: { value: 'SQLite' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit answers' }))
    expect(onAnswer).toHaveBeenCalledWith('q1', { kind: 'ask', answers: [{ text: 'SQLite' }, {}] })
  })

  it('moves on from a typed answer with Enter, and keeps a blank one waiting', () => {
    renderAsk([notes, auth])
    const field = screen.getByRole('textbox', { name: 'Your answer' })
    fireEvent.submit(field)
    expect(tab('Notes')).toHaveAttribute('aria-selected', 'true')
    fireEvent.change(field, { target: { value: 'Keep the cache' } })
    fireEvent.submit(field)
    expect(tab('Q2')).toHaveAttribute('aria-selected', 'true')
  })

  it('focuses Submit once the last question has its answer', () => {
    renderAsk([database, auth])
    fireEvent.click(tab('Q2'))
    fireEvent.click(screen.getByRole('button', { name: 'SAML' }))
    expect(screen.getByRole('button', { name: 'Submit answers' })).toHaveFocus()
  })

  it('sends the answers so far to chat about them instead', () => {
    const onAnswer = renderAsk([database, auth])
    fireEvent.click(screen.getByRole('button', { name: /Mongo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Chat about this' }))
    expect(onAnswer).toHaveBeenCalledWith('q1', {
      kind: 'ask',
      answers: [{ picked: ['Mongo'] }, {}],
      chat: true,
    })
  })
})

describe('AskApproval with one question', () => {
  it('sends a pick at once', () => {
    const onAnswer = renderAsk([database])
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('Relational')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mongo/ }))
    expect(onAnswer).toHaveBeenCalledWith('q1', { kind: 'ask', answers: [{ picked: ['Mongo'] }] })
  })

  it('ticks multi-select options in option order, with the own answer while its box is ticked', () => {
    const onAnswer = renderAsk([checks])
    fireEvent.click(screen.getByRole('checkbox', { name: 'E2E' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lint' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Write my own answer…' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'and the docs build' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onAnswer).toHaveBeenLastCalledWith('q1', {
      kind: 'ask',
      answers: [{ picked: ['Lint', 'E2E'], text: 'and the docs build' }],
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Write my own answer…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onAnswer).toHaveBeenLastCalledWith('q1', {
      kind: 'ask',
      answers: [{ picked: ['Lint', 'E2E'] }],
    })
  })

  it('takes typed text for a question without options, never taking focus as it arrives', () => {
    const onAnswer = renderAsk([notes])
    const field = screen.getByRole('textbox', { name: 'Your answer' })
    expect(field).not.toHaveFocus()
    expect(field).toHaveAttribute('placeholder', 'Type your answer…')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    fireEvent.change(field, { target: { value: 'Keep the cache' } })
    fireEvent.submit(field)
    expect(onAnswer).toHaveBeenCalledWith('q1', {
      kind: 'ask',
      answers: [{ text: 'Keep the cache' }],
    })
  })
})

describe('AskApproval it cannot answer', () => {
  it('says to answer in the terminal when it can read no questions', () => {
    renderAsk([])
    expect(screen.getByText('Waiting for an answer in the terminal')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('names who has to answer, listing the questions and their choices', () => {
    render(
      <ChatConfigProvider value={resolveChatConfig()}>
        <AskApproval
          part={{
            kind: 'approval',
            id: 'q1',
            approvalKind: 'ask',
            questions: [database, auth],
            waitingOn: 'Dana',
          }}
        />
      </ChatConfigProvider>,
    )
    expect(screen.getByText('Which auth?')).toBeInTheDocument()
    expect(screen.getByText(/OAuth · SAML/)).toBeInTheDocument()
    expect(screen.getByText('Waiting for Dana to answer')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
