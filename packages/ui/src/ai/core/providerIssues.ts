import type { ChatStrings } from '../strings'
import type { ProviderIssue } from '../types'

type IssueStrings = ChatStrings['providerIssue']

/** A short name for what went wrong, such as beside the provider's heading. */
export function issueLabel(t: IssueStrings, issue: ProviderIssue): string {
  return issue.status === 'unauthorized' ? t.keyRejected : t.unreachable
}

/** What went wrong and what to do about it: the provider's own message when it sent one. */
export function issueDetail(t: IssueStrings, issue: ProviderIssue): string {
  return issue.message || (issue.status === 'unauthorized' ? t.keyRejectedHint : t.unreachableHint)
}
