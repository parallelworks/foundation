import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type JsonSchema, settingsSchemas } from './settingsYaml'

const workflow = JSON.parse(
  readFileSync(
    new URL(
      '../../../../cmd/ingress/internal/handlers/workflows/workflowschema/workflow.schema.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as JsonSchema

function refs(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      refs(item, out)
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key === '$ref' && typeof item === 'string') {
        out.push(item)
      } else {
        refs(item, out)
      }
    }
  }
  return out
}

function resolves(schema: JsonSchema, ref: string): boolean {
  if (!ref.startsWith('#/')) {
    return false
  }
  let current: unknown = schema
  for (const part of ref.slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~')
    current =
      typeof current === 'object' && current !== null ? (current as JsonSchema)[key] : undefined
  }
  return current !== undefined
}

describe('settingsSchemas', () => {
  const { job, step, input, settings } = settingsSchemas(workflow)

  it('takes the workflow’s own settings, without its jobs or trigger', () => {
    const keys = Object.keys(settings['properties'] as JsonSchema)
    expect(keys).toEqual(expect.arrayContaining(['env', 'sessions', 'timeout']))
    expect(keys).not.toContain('jobs')
    expect(keys).not.toContain('on')
    expect(settings['additionalProperties']).toBe(false)
  })

  it('takes the job and the step schema out of the workflow schema', () => {
    expect(Object.keys(job['properties'] as JsonSchema)).toEqual(
      expect.arrayContaining(['steps', 'needs', 'if', 'strategy']),
    )
    expect(job['additionalProperties']).toBe(false)
    expect(Object.keys(step['properties'] as JsonSchema)).toEqual(
      expect.arrayContaining(['run', 'uses', 'cleanup', 'if']),
    )
  })

  it("takes an input's schema, one of the input types, out of the inputs", () => {
    const types = (input['oneOf'] as JsonSchema[]).map(
      (variant) =>
        ((variant['properties'] as JsonSchema | undefined)?.['type'] as JsonSchema | undefined)?.[
          'const'
        ],
    )
    expect(types).toEqual(expect.arrayContaining(['string', 'group', 'list']))
  })

  it('keeps the schema draft and every definition the parts refer to', () => {
    for (const part of [job, step, input, settings]) {
      expect(part['$schema']).toBe(workflow['$schema'])
      expect(refs(part).length).toBeGreaterThan(0)
      expect(refs(part).filter((ref) => !resolves(part, ref))).toEqual([])
    }
  })
})
