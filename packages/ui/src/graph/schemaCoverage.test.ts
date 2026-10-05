import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  JOB_FIELDS,
  RETRY_FIELDS,
  RUNS_ON_FIELDS,
  SSH_KEYS,
  STEP_FIELDS,
  STRATEGY_FIELDS,
} from './GraphEditorDialogs'
import { inputTypes, offeredInputKeys } from './InputDialog'
import { ACTION_INPUTS, withFields } from './stepWith'
import {
  INPUT_FORM_FIELDS,
  LINK_FIELDS,
  NEEDS_FIELDS,
  SESSION_FIELDS,
  WORKFLOW_FIELDS,
} from './WorkflowSettingsDialog'

type Json = Record<string, unknown>

const schema = JSON.parse(
  readFileSync(
    new URL(
      '../../../../cmd/ingress/internal/handlers/workflows/workflowschema/workflow.schema.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Json

function at(value: unknown, ...keys: string[]): Json {
  let current = value
  for (const key of keys) {
    current = (current as Json)[key]
  }
  return current as Json
}

const inputBranches = (
  at(schema, '$defs', 'inputs', 'patternProperties', '^[a-zA-Z0-9_-]+$')['oneOf'] as Json[]
).flatMap((branch) => {
  const type = at(branch, 'properties', 'type')
  const names = (type['const'] !== undefined ? [type['const']] : type['enum']) as string[]
  return names.map((name) => ({
    name,
    keys: Object.keys(at(branch, 'properties')),
    required: (branch['required'] as string[] | undefined) ?? [],
  }))
})

describe('the inputs editor against the workflow schema', () => {
  it('offers exactly the input types the schema defines', () => {
    expect([...inputTypes()].sort()).toEqual(
      [...new Set(inputBranches.map((branch) => branch.name))].sort(),
    )
  })

  it.each(inputTypes())('offers only schema keys for %s', (type) => {
    const branches = inputBranches.filter((branch) => branch.name === type)
    const allowed = new Set(branches.flatMap((branch) => branch.keys))
    expect(offeredInputKeys(type).filter((key) => !allowed.has(key))).toEqual([])
    // Every key some variant of the type requires can be set.
    const required = branches.flatMap((branch) => branch.required)
    expect(required.filter((key) => !offeredInputKeys(type).includes(key))).toEqual([])
  })
})

describe('step inputs against the workflow schema', () => {
  const rules = at(
    schema,
    'properties',
    'jobs',
    'patternProperties',
    '^[a-z0-9_-]{1,255}$',
    'properties',
    'steps',
    'items',
  )['allOf'] as Json[]

  it.each(Object.keys(ACTION_INPUTS))('offers the with keys %s takes', (action) => {
    const rule = rules.find(
      (candidate) => at(candidate, 'if', 'properties', 'uses')['const'] === action,
    )
    const withSchema = at(rule, 'then', 'properties', 'with')
    const specs = ACTION_INPUTS[action] ?? []
    expect(specs.map((spec) => spec.key).sort()).toEqual(
      Object.keys(at(withSchema, 'properties')).sort(),
    )
    expect(
      specs
        .filter((spec) => spec.required)
        .map((spec) => spec.key)
        .sort(),
    ).toEqual([...((withSchema['required'] as string[]) ?? [])].sort())
  })
})

// Every workflow key the editors write, as paths: <*> is any name, [] any list item.
const EDITED = new Set([
  'on.execute.inputs',
  ...INPUT_FORM_FIELDS.map((key) => `on.execute.inputs.$meta.${key}`),
  ...WORKFLOW_FIELDS,
  ...SESSION_FIELDS.map((key) => `sessions.<*>.${key}`),
  ...LINK_FIELDS.map((key) => `links.<*>.${key}`),
  ...NEEDS_FIELDS.map((key) => `needs.${key}`),
  // The graph adds, removes and orders steps; the step dialog edits each one.
  'jobs.<*>.steps',
  ...JOB_FIELDS.map((key) => `jobs.<*>.${key}`),
  ...SSH_KEYS.map((key) => `jobs.<*>.ssh.${key}`),
  ...RUNS_ON_FIELDS.map((key) => `jobs.<*>.runs-on.${key}`),
  ...STRATEGY_FIELDS.map((key) => `jobs.<*>.strategy.${key}`),
  ...STEP_FIELDS.map((key) => `jobs.<*>.steps[].${key}`),
  ...SSH_KEYS.map((key) => `jobs.<*>.steps[].ssh.${key}`),
  ...RETRY_FIELDS.map((key) => `jobs.<*>.steps[].retry.${key}`),
  ...withFields().map((key) => `jobs.<*>.steps[].with.${key}`),
])

// Keys the editors leave alone on purpose, and why.
const NOT_EDITED: Record<string, string> = {
  configurations: 'Saved inputs are named and filled in on the run form.',
  'configurations.<*>.inputs': 'Saved inputs are named and filled in on the run form.',
}

/** Every property path under `node`; input definitions are covered per type above. */
function schemaPaths(node: unknown, path: string, out: Set<string>): Set<string> {
  if (typeof node !== 'object' || node === null) {
    return out
  }
  const record = node as Json
  const child = (name: string) => (path ? `${path}.${name}` : name)
  for (const [name, sub] of Object.entries(asJson(record['properties']))) {
    out.add(child(name))
    schemaPaths(sub, child(name), out)
  }
  for (const sub of Object.values(asJson(record['patternProperties']))) {
    schemaPaths(sub, child('<*>'), out)
  }
  if (typeof record['additionalProperties'] === 'object') {
    schemaPaths(record['additionalProperties'], child('<*>'), out)
  }
  if (typeof record['items'] === 'object') {
    schemaPaths(record['items'], `${path}[]`, out)
  }
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    for (const branch of (record[key] as unknown[] | undefined) ?? []) {
      schemaPaths(branch, path, out)
    }
  }
  if (record['then']) {
    schemaPaths(record['then'], path, out)
  }
  return out
}

function asJson(value: unknown): Json {
  return typeof value === 'object' && value !== null ? (value as Json) : {}
}

describe('the build page editors against every workflow schema key', () => {
  const paths = schemaPaths({ properties: schema['properties'] }, '', new Set())
  schemaPaths(
    at(schema, '$defs', 'inputs', 'properties', '$meta'),
    'on.execute.inputs.$meta',
    paths,
  )
  const containers = new Set(
    [...EDITED].flatMap((path) =>
      path
        .split('.')
        .map((_, i, parts) => parts.slice(0, i).join('.'))
        .filter(Boolean),
    ),
  )

  it('edits each key the schema has, or says why not', () => {
    const missing = [...paths].filter(
      (path) =>
        !EDITED.has(path) &&
        !containers.has(path) &&
        !Object.hasOwn(NOT_EDITED, path) &&
        !path.startsWith('on.execute.inputs.<*>'),
    )
    // A new schema key lands here: offer it in the editor, or add it to NOT_EDITED with the reason.
    expect(missing).toEqual([])
  })

  it('writes only keys the schema has', () => {
    expect([...EDITED].filter((path) => !paths.has(path))).toEqual([])
  })

  it.each(inputTypes())('offers every schema key for %s inputs', (type) => {
    const keys = new Set(
      inputBranches.filter((branch) => branch.name === type).flatMap((branch) => branch.keys),
    )
    const offered = new Set(offeredInputKeys(type))
    expect([...keys].filter((key) => !offered.has(key))).toEqual([])
  })
})
