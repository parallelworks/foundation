// The transcript-shaping rules of a terminal coding agent, so a replayed
// history renders the same blocks the terminal draws.
import type { ApprovalOption, ApprovalQuestion } from '../types'
import { clip, sanitizeLabel, sanitizePanelText, stripTerminalEscapes } from './toolfmt'

// TodoWrite's plan pins above the composer instead; a block too would repeat
// it on every update. ExitPlanMode's whole argument is the plan, rendered as
// its own block. AskUserQuestion's answers are in the call's decision, or in
// the following tool result.
const HIDDEN_TRANSCRIPT_TOOLS = new Set(['AskUserQuestion', 'TodoWrite', 'ExitPlanMode'])

export function hiddenTranscriptTool(name: string): boolean {
  return HIDDEN_TRANSCRIPT_TOOLS.has(name)
}

function parseArgs(argsJSON: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(argsJSON)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Also reads an older call's lone `question`. */
export function askQuestionsFromArgs(argsJSON: string): ApprovalQuestion[] {
  const a = parseArgs(argsJSON)
  const asked = Array.isArray(a['questions']) ? a['questions'] : [a]
  return asked.flatMap((raw: unknown) => {
    const q = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const question = str(q['question'])
    if (!question) {
      return []
    }
    const header = str(q['header'])
    const options = Array.isArray(q['options']) ? q['options'].flatMap(askOption) : []
    return [
      {
        question,
        ...(header ? { header } : {}),
        ...(q['multiSelect'] === true ? { multiSelect: true } : {}),
        ...(options.length > 0 ? { options } : {}),
      },
    ]
  })
}

function askOption(raw: unknown): ApprovalOption[] {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const label = str(o['label'])
  const description = str(o['description'])
  const preview = str(o['preview'])
  return label
    ? [{ label, ...(description ? { description } : {}), ...(preview ? { preview } : {}) }]
    : []
}

export function planFromArgs(argsJSON: string): string {
  return str(parseArgs(argsJSON)['plan'])
}

/** A Task call's display label the way the tool itself picks it: the
 *  description, else the clipped prompt, plus its custom agent type. */
export function taskCallFromArgs(argsJSON: string): {
  description: string
  agentType: string
} {
  const a = parseArgs(argsJSON)
  const description = str(a['description']) || clip(str(a['prompt']), 40)
  return {
    description: sanitizeLabel(description),
    agentType: agentTypeLabel(str(a['subagent_type'])),
  }
}

/** The built-in "default" type is the same general-purpose agent an untyped
 *  Task spawns, so naming it would only add noise. */
export function agentTypeLabel(t: string): string {
  return t === 'default' ? '' : sanitizeLabel(t)
}

/** The first line when the model wrote it as a heading ("# Title" or
 *  "**Title**"), the way reasoning summaries open, so a folded thought says
 *  what it was about. Prose gets no label of its own. */
export function thinkingHeading(raw: string): string {
  const first = raw.trim().split('\n')[0]?.trim() ?? ''
  let line: string
  if (first.startsWith('#')) {
    line = first.replace(/^#+/, '').trim()
  } else if (first.length > 4 && first.startsWith('**') && first.endsWith('**')) {
    line = first.slice(2, -2).trim()
  } else {
    return ''
  }
  return clip(sanitizeLabel(line), 60)
}

/** How a turn the user cut short reads, whether replayed or watched live. */
export const INTERRUPTED_NOTICE = 'Request interrupted by the user.'

/** The line the daemon files as the assistant's when a turn is cut short, by
 *  the user or for a reason it names ("[Request interrupted because …]"); it
 *  is a status, not something the model said. */
export function interruptionNotice(text: string): string | null {
  const line = text.trim()
  return line.startsWith('[Request interrupted ') && line.endsWith('.]') ? line.slice(1, -1) : null
}

export function firstNonEmptyLine(text: string, max: number): string {
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (s !== '') {
      return clip(s, max)
    }
  }
  return ''
}

export interface SubagentNotice {
  id: string
  description: string
  preview: string
  /** The report itself, without the closing line addressed to the model. */
  body: string
  interim: boolean
  /** The interrupted form is written for the model alone; the child's own
   *  block already reads interrupted, so no line is drawn for it. */
  silent: boolean
  /** A background command's, rather than a subagent's. */
  shell?: boolean
  exitCode?: number
  failed?: boolean
  /** How long the subagent ran, or a monitor's time limit; 0 when the notice doesn't say. */
  elapsedMs?: number
  /** A monitor's: a script whose output lines arrive as events. An event's
   *  `body` is the lines it printed, and `preview` the first of them. */
  monitor?: boolean
  /** How a monitor ended; unset on an event. `exitCode` says how its script
   *  exited, and `elapsedMs` how long one that expired or flooded was given. */
  ended?: MonitorEnd
  /** The events a monitor sent before it expired. */
  events?: number
}

/** A monitor ends when its script exits, when its time runs out, or when it is
 *  stopped for printing too much. */
export type MonitorEnd = 'exited' | 'expired' | 'flooded'

/** The words of the line a background task's notice draws. A host that leaves
 *  out a monitor's lines gets the English ones. */
export interface SubagentNoticeStrings {
  messageFrom: (name: string) => string
  commandCompleted: (name: string) => string
  commandFailed: (name: string, exitCode: number) => string
  /** `elapsed` is empty when the notice doesn't say how long it ran. */
  agentFinished: (name: string, elapsed: string) => string
  agentFailed: (name: string, elapsed: string) => string
  /** `line` is the first line the script printed. */
  monitorEvent?: (name: string, line: string) => string
  monitorEnded?: (name: string) => string
  monitorFailed?: (name: string, exitCode: number) => string
  monitorExpired?: (name: string, elapsed: string, events: number) => string
  monitorFlooded?: (name: string, elapsed: string) => string
}

const withElapsed = (line: string, elapsed: string) => (elapsed ? `${line} · ${elapsed}` : line)

const eventCount = (n: number) => (n === 0 ? 'no events' : n === 1 ? '1 event' : `${n} events`)

export const defaultSubagentNoticeStrings: Required<SubagentNoticeStrings> = {
  messageFrom: (name) => `Message from ${name}`,
  commandCompleted: (name) => `Background command "${name}" completed (exit code 0)`,
  commandFailed: (name, code) => `Background command "${name}" failed with exit code ${code}`,
  agentFinished: (name, elapsed) => withElapsed(`Agent "${name}" finished`, elapsed),
  agentFailed: (name, elapsed) => withElapsed(`Agent "${name}" failed`, elapsed),
  monitorEvent: (name, line) => `Monitor event: ${line} · ${name}`,
  monitorEnded: (name) => `Monitor "${name}" stream ended`,
  monitorFailed: (name, code) => `Monitor "${name}" script failed (exit ${code})`,
  monitorExpired: (name, elapsed, events) =>
    `Monitor "${name}" expired after ${elapsed} with ${eventCount(events)} delivered`,
  monitorFlooded: (name, elapsed) =>
    `Monitor "${name}" stopped after ${elapsed} of too much output`,
}

// A Go duration as the notice writes it, such as "2m59.5s" or "850ms".
const DURATION_UNITS: Record<string, number> = {
  h: 3_600_000,
  m: 60_000,
  s: 1000,
  ms: 1,
  us: 0.001,
  µs: 0.001,
  ns: 0.000001,
}

function parseGoDuration(text: string): number {
  const units = [...text.trim().matchAll(/(\d+(?:\.\d+)?)(ms|us|µs|ns|h|m|s)/g)]
  if (units.length === 0 || units.map((u) => u[0]).join('') !== text.trim()) {
    return 0
  }
  return units.reduce((ms, [, n, unit]) => ms + Number(n) * (DURATION_UNITS[unit ?? ''] ?? 0), 0)
}

/** How long a subagent ran: 42s, 2m 59s or 1h 4m. */
export function formatAgentDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) {
    return `${s}s`
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }
  return `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`
}

const SUBAGENT_NOTICE_HEADS = new Set(['Background subagent', 'Message from subagent'])

/** Reads a "[Background subagent <id> (<desc>) completed]" header; null for
 *  any other notice, which keeps its full text. */
export function parseSubagentNotice(text: string): SubagentNotice | null {
  const trimmed = text.trim()
  const nl = trimmed.indexOf('\n')
  let head = nl === -1 ? trimmed : trimmed.slice(0, nl)
  let body = nl === -1 ? '' : trimmed.slice(nl + 1)
  if (!head.startsWith('[') || !head.endsWith(']')) {
    return null
  }
  head = head.slice(1, -1)
  if (head.startsWith('Monitor ')) {
    return parseMonitorNotice(head.slice('Monitor '.length), body)
  }
  let shell = false
  let kind: string
  let rest: string
  const sub = head.indexOf(' subagent ')
  if (sub !== -1 && SUBAGENT_NOTICE_HEADS.has(`${head.slice(0, sub)} subagent`)) {
    kind = head.slice(0, sub)
    rest = head.slice(sub + ' subagent '.length)
  } else {
    const cmd = head.indexOf(' command ')
    if (cmd === -1 || head.slice(0, cmd) !== 'Background') {
      return null
    }
    kind = 'Background'
    rest = head.slice(cmd + ' command '.length)
    shell = true
  }
  const open = rest.indexOf(' (')
  if (open === -1) {
    return null
  }
  const id = rest.slice(0, open)
  rest = rest.slice(open + 2)
  // A spawner-chosen description may hold its own parentheses, so the
  // header's closer is the last one, not the first.
  const end = rest.lastIndexOf(')')
  if (end === -1) {
    return null
  }
  const tail = rest.slice(end + 1).trim()
  const notice: SubagentNotice = {
    id,
    description: rest.slice(0, end).replaceAll('\\[', '[').replaceAll('\\]', ']'),
    interim: kind === 'Message from',
    silent: tail.includes('was interrupted') || tail.includes('was stopped by the user'),
    preview: '',
    body: '',
  }
  if (shell) {
    notice.shell = true
    notice.preview = tail
    if (notice.silent) {
      return notice
    }
    const code = /^exited with code (\d+)$/.exec(tail)
    if (!code) {
      return null
    }
    notice.exitCode = Number(code[1])
    return notice
  }
  const after = tail.indexOf(' after ')
  const verb = after === -1 ? tail : tail.slice(0, after)
  notice.failed = verb === 'failed'
  notice.elapsedMs = after === -1 ? 0 : parseGoDuration(tail.slice(after + ' after '.length))
  // The closing "(pass <id> as task_id …)" line is addressed to the model.
  const lines = body.split('\n')
  const last = lines[lines.length - 1] ?? ''
  if (lines.length > 0 && last.trim().startsWith('(pass ')) {
    body = lines.slice(0, -1).join('\n')
  }
  notice.body = body.trim()
  notice.preview = firstNonEmptyLine(body, 70)
  return notice
}

// A "[Monitor <id> (<desc>) event]" header over the lines a script printed, or
// one that says how the monitor ended; null for an ending this doesn't know,
// which keeps its full text.
function parseMonitorNotice(head: string, body: string): SubagentNotice | null {
  const open = head.indexOf(' (')
  if (open === -1) {
    return null
  }
  const rest = head.slice(open + 2)
  const end = rest.lastIndexOf(')')
  if (end === -1) {
    return null
  }
  const notice: SubagentNotice = {
    id: head.slice(0, open),
    description: rest.slice(0, end).replaceAll('\\[', '[').replaceAll('\\]', ']'),
    interim: false,
    silent: false,
    preview: '',
    body: '',
    monitor: true,
  }
  const tail = rest.slice(end + 1).trim()
  if (tail === 'event') {
    notice.body = sanitizePanelText(stripTerminalEscapes(body)).trim()
    notice.preview = firstNonEmptyLine(notice.body, 100)
    return notice
  }
  const exited = /^exited with code (-?\d+)$/.exec(tail)
  if (exited) {
    notice.ended = 'exited'
    notice.exitCode = Number(exited[1])
    return notice
  }
  const expired = /^expired after (\S+) with (no|\d+) events? delivered$/.exec(tail)
  if (expired) {
    notice.ended = 'expired'
    notice.elapsedMs = parseGoDuration(expired[1] ?? '')
    notice.events = expired[2] === 'no' ? 0 : Number(expired[2])
    return notice
  }
  const flooded = /^stopped after (\S+) of too much output$/.exec(tail)
  if (flooded) {
    notice.ended = 'flooded'
    notice.elapsedMs = parseGoDuration(flooded[1] ?? '')
    return notice
  }
  return null
}

function monitorLine(n: SubagentNotice, name: string, t: SubagentNoticeStrings): string {
  const english = defaultSubagentNoticeStrings
  const elapsed = formatAgentDuration(n.elapsedMs ?? 0)
  switch (n.ended) {
    case 'exited':
      return n.exitCode
        ? (t.monitorFailed ?? english.monitorFailed)(name, n.exitCode)
        : (t.monitorEnded ?? english.monitorEnded)(name)
    case 'expired':
      return (t.monitorExpired ?? english.monitorExpired)(name, elapsed, n.events ?? 0)
    case 'flooded':
      return (t.monitorFlooded ?? english.monitorFlooded)(name, elapsed)
    default:
      return (t.monitorEvent ?? english.monitorEvent)(name, n.preview)
  }
}

/** The line that marks a child's report, a background command's end or a
 *  monitor's event entering the main conversation; what was reported opens
 *  under it. */
export function subagentDeliveryLine(
  n: SubagentNotice,
  t: SubagentNoticeStrings = defaultSubagentNoticeStrings,
): string {
  const name = sanitizeLabel(n.description) || n.id
  if (n.monitor) {
    return monitorLine(n, name, t)
  }
  if (n.interim) {
    return t.messageFrom(name)
  }
  if (n.shell) {
    return n.exitCode ? t.commandFailed(name, n.exitCode) : t.commandCompleted(name)
  }
  const elapsed = n.elapsedMs ? formatAgentDuration(n.elapsedMs) : ''
  return n.failed ? t.agentFailed(name, elapsed) : t.agentFinished(name, elapsed)
}
