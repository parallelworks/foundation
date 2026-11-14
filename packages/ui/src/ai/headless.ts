// The chat without its components: what a message and its parts are, the reducers that build
// them, how an agent's tool calls read, how a composer turns large pastes into cards, and which
// model and allocation the chat starts on. Nothing reachable from here imports React, a
// stylesheet, another package or a component, so a host that draws the chat itself, or reads
// one where there is no DOM, can import it. scripts/verify-pack.mjs fails when that stops holding.
export * from './adapter/types'
export * from './agent/index'
export {
  type ChatAction,
  type ChatState,
  chatReducer,
  initialState,
} from './core/chatReducer'
export {
  defaultAllocation,
  defaultModel,
  isOrgModel,
  providerIssueFor,
} from './core/models'
export { applyPartDelta, finalizeParts } from './core/parts'
export {
  type ComposerPastes,
  createPasteCards,
  type PasteCard,
  type PasteCards,
  type PasteCardsHost,
  type PasteUploadResult,
} from './core/pasteCards'
export {
  countLines,
  joinPastes,
  normalizeNewlines,
  PASTE_CARD_MIN_BYTES,
  PASTE_INLINE_CAP,
  pasteInlineMaxBytes,
  splitPastes,
  utf8Bytes,
} from './core/pastes'
export * from './types'
