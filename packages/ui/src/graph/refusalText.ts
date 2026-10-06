import { EditRefusal, type EditRefusalReason, refusalMessage } from '@parallelworks/workflow-parser'
import { GRAPH_EDITOR_STRINGS, type GraphEditorStrings } from './editorStrings'

/** A refusal in the host's words, or the parser's English when the host gives none. */
export function refusalText(t: GraphEditorStrings, reason: EditRefusalReason): string {
  return t.refusal === GRAPH_EDITOR_STRINGS.refusal ? refusalMessage(reason) : t.refusal(reason)
}

/** What to tell the person when an edit throws: why it was refused, or the error itself. */
export function editErrorText(t: GraphEditorStrings, error: unknown): string {
  if (error instanceof EditRefusal) {
    return refusalText(t, error.reason)
  }
  return error instanceof Error ? error.message : String(error)
}
