import { describe, expect, it } from 'vitest'
import {
  equalsExpression,
  flagExpression,
  inputRefs,
  readEqualsRef,
  readFlagRef,
  readRef,
  refExpression,
} from './inputRefs'

describe('inputRefs', () => {
  it('lists inputs where a run reads them', () => {
    const refs = inputRefs({
      cluster: { type: 'compute-clusters', label: 'Cluster' },
      title: { type: 'header', text: 'Settings' },
      settings: { type: 'group', items: { size: { type: 'number' } } },
      flat: {
        type: 'group',
        flatten: true,
        items: { depth: { type: 'number' } },
      },
      hosts: { type: 'list', template: { host: { type: 'string' } } },
    })
    expect(refs.map(ref => [ref.path, ref.type, ref.label])).toEqual([
      [['cluster'], 'compute-clusters', 'Cluster'],
      [['settings', 'size'], 'number', 'size'],
      [['depth'], 'number', 'depth'],
      [['hosts'], 'list', 'hosts'],
    ])
  })

  it('flattens wizard steps unless the wizard says not to', () => {
    const step = {
      type: 'step',
      title: 'One',
      options: { a: { type: 'string' } },
    }
    expect(inputRefs({ one: step }).map(ref => ref.path)).toEqual([['a']])
    expect(
      inputRefs({ $meta: { wizard: { flatten: false } }, one: step }).map(
        ref => ref.path
      )
    ).toEqual([['one', 'a']])
  })
})

describe('input expressions', () => {
  it('reads back the input an expression names', () => {
    expect(readRef(refExpression(['settings', 'size']))).toEqual([
      'settings',
      'size',
    ])
    expect(readRef(refExpression(['cluster'], 'ip'), 'ip')).toEqual(['cluster'])
    expect(readRef('${{ inputs.cluster.user }}', 'ip')).toBeNull()
    expect(readRef('${{ !inputs.on }}')).toBeNull()
    expect(readRef('${{ inputs.a || inputs.b }}')).toBeNull()
  })

  it('reads a switch and its negation', () => {
    expect(readFlagRef(flagExpression(['on'], true))).toEqual({
      path: ['on'],
      negated: true,
    })
    expect(readFlagRef('${{ inputs.on }}')).toEqual({
      path: ['on'],
      negated: false,
    })
  })

  it('compares an input to a value it offers', () => {
    const expression = equalsExpression(['mode'], "it's", true)
    expect(expression).toBe("${{ inputs.mode != 'its' }}")
    expect(readEqualsRef(expression)).toEqual({
      path: ['mode'],
      value: 'its',
      negated: true,
    })
    expect(readEqualsRef("${{ inputs.mode == 'fast' }}")).toEqual({
      path: ['mode'],
      value: 'fast',
      negated: false,
    })
  })
})
