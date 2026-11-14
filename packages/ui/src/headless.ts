// What the root entry has that draws nothing: the formatters, the strings and the clock. What is
// reachable from here imports only React, luxon and dequal, none of which needs a DOM, and no
// component or stylesheet, so a host without a DOM can import it. scripts/verify-pack.mjs fails
// when that stops holding.
export { useClock } from './components/clock'
export {
  type UIStringOverrides,
  type UIStrings,
  UIStringsProvider,
  useStrings,
} from './components/strings'
export {
  type DateTimeStyle,
  formatBytes,
  formatCount,
  formatDateTime,
  formatDuration,
  formatTimeLeft,
  type TimeValue,
} from './format'
