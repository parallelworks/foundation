import {
  callWhenParserInitialized,
  initializeParseStringsOfObj,
  lintReady,
  loadYaml,
  type WorkflowLintContext,
} from '@parallelworks/workflow-parser'
import { useEffect, useMemo, useState } from 'react'
import {
  useRepoSuggestions,
  useSecretVariablesResolver,
  useWorkflowJsonResolver,
} from '../components/Provider'
import { asRecord } from '../graph/editorFields'
import {
  DEFAULT_GITLAB_HOST,
  DEFAULT_REPO_YAML,
  loadUsesInputs,
  type UsesSources,
} from '../graph/usesInputs'

// Lint markers carry their own owner, so they can be told apart from the schema's.
export const LINT_OWNER = 'workflowlint'

export interface LintSources extends UsesSources {
  secrets?: (() => Promise<string[]>) | undefined
}

// Fetched once per page and kept, since the checks run on every edit; null marks a target
// that couldn't be read, which says nothing about the workflow reading it.
const targets = new Map<string, Record<string, unknown> | null>()
const pending = new Set<string>()
let secretNames: string[] | undefined
let secretsPending = false

const text = (value: unknown, fallback: string) =>
  typeof value === 'string' && value ? value : fallback

/**
 * What the linter can't read from `source`: the inputs of each workflow a step uses, and which
 * of the user's variables are secret, as far as they have arrived. `onMore` runs when more does.
 */
export function lintContext(
  source: string,
  sources: LintSources,
  onMore: () => void
): WorkflowLintContext {
  let doc: unknown
  try {
    doc = loadYaml(source)
  } catch {
    doc = undefined
  }
  // The linter keys targets by `uses` alone, so one two steps read from different files is skipped.
  const wanted = new Map<string, Set<string>>()
  for (const job of Object.values(asRecord(asRecord(doc)['jobs']))) {
    const steps = asRecord(job)['steps']
    for (const step of Array.isArray(steps) ? steps : []) {
      const uses = asRecord(step)['uses']
      if (
        typeof uses !== 'string' ||
        uses.includes('${{') ||
        uses.startsWith('parallelworks/')
      ) {
        continue
      }
      const withBlock = asRecord(asRecord(step)['with'])
      const key = [
        uses.trim(),
        text(withBlock['$yaml'], DEFAULT_REPO_YAML),
        text(withBlock['$host'], DEFAULT_GITLAB_HOST),
      ].join('\n')
      wanted.set(uses.trim(), (wanted.get(uses.trim()) ?? new Set()).add(key))
    }
  }
  const usesInputs: Record<string, unknown> = {}
  for (const [uses, keys] of wanted) {
    const key = keys.size === 1 ? [...keys][0] : undefined
    if (key === undefined || pending.has(key)) {
      continue
    }
    if (targets.has(key)) {
      const inputs = targets.get(key)
      if (inputs) {
        usesInputs[uses] = inputs
      }
      continue
    }
    pending.add(key)
    const [, yamlPath = DEFAULT_REPO_YAML, host = DEFAULT_GITLAB_HOST] =
      key.split('\n')
    loadUsesInputs(uses, { yamlPath, host }, sources)
      .then(inputs => {
        targets.set(key, inputs)
        onMore()
      })
      // Left unfetched, so a later check tries again.
      .catch(() => {})
      .finally(() => pending.delete(key))
  }
  if (!secretNames && !secretsPending && sources.secrets) {
    secretsPending = true
    sources
      .secrets()
      .then(names => {
        secretNames = names
        onMore()
      })
      .catch(() => {})
      .finally(() => {
        secretsPending = false
      })
  }
  return { usesInputs, ...(secretNames ? { secretVars: secretNames } : {}) }
}

export function useLintSources(): LintSources {
  const resolve = useWorkflowJsonResolver()
  const repos = useRepoSuggestions()
  const secrets = useSecretVariablesResolver()
  return useMemo(() => ({ resolve, repos, secrets }), [resolve, repos, secrets])
}

/** lintContext for a component, which renders again when more of it arrives. */
export function useLintContext(
  source: string | undefined
): WorkflowLintContext {
  const sources = useLintSources()
  const [arrivals, setArrivals] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: each arrival reads the context again.
  return useMemo(
    () =>
      source === undefined
        ? {}
        : lintContext(source, sources, () => setArrivals(n => n + 1)),
    [source, sources, arrivals]
  )
}

/** Whether the linter's wasm has loaded, rendering again once it has; `load` false never loads it. */
export function useLintReady(load = true): boolean {
  const [ready, setReady] = useState(lintReady)
  useEffect(() => {
    if (ready || !load) {
      return
    }
    initializeParseStringsOfObj().catch(() => {})
    return callWhenParserInitialized(loaded => {
      if (loaded) {
        setReady(true)
      }
    })
  }, [ready, load])
  return ready
}
