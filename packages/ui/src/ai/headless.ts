// The chat without its components: what a message and its parts are, the reducers that build
// them, and how an agent's tool calls read. Nothing reachable from here imports React, a
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
export { applyPartDelta, finalizeParts } from './core/parts'
export * from './types'
