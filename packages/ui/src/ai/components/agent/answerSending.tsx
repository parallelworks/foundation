import { useState } from 'react'
import { Loader } from '../../../components/Loader'
import type { ApprovalAnswerHandler } from '../../core/config'
import type { ApprovalAnswerValue } from '../../types'

/** Sends an approval's answer, and names the control whose answer is still on its way: a host
 *  that returns a promise from its handler has not taken the answer until the promise settles,
 *  which over a slow connection is long enough to press the button again. */
export function useAnswerSending<Control extends string>(
  id: string,
  onAnswer: ApprovalAnswerHandler | undefined,
): { sending: Control | null; answer: (control: Control, value: ApprovalAnswerValue) => void } {
  const [sending, setSending] = useState<Control | null>(null)
  const answer = (control: Control, value: ApprovalAnswerValue) => {
    if (sending !== null) {
      return
    }
    const sent = onAnswer?.(id, value)
    if (sent instanceof Promise) {
      setSending(control)
      const settled = () => setSending(null)
      sent.then(settled, settled)
    }
  }
  return { sending, answer }
}

/** Marks the button whose answer is on its way; its label says which answer. */
export function SendingMark() {
  return <Loader inline decorative size={12} color="currentColor" />
}
