import type { Allocation, ChatModel, ProviderIssue } from '../types'
import { defaultAllocation, defaultModel, isOrgModel, providerIssueFor } from './models'

function model(overrides: Partial<ChatModel>): ChatModel {
  return {
    id: 'org:acme/model-a',
    object: 'model',
    created: 0,
    owned_by: 'acme',
    tool_calling_mode: 'native',
    ...overrides,
  }
}

const orgIssue: ProviderIssue = {
  provider: 'Acme',
  provider_name: 'acme',
  status: 'unauthorized',
}

const userIssue: ProviderIssue = {
  provider: 'Mine',
  provider_name: 'mine',
  provider_owner: 'tester',
  status: 'unreachable',
}

describe('providerIssueFor', () => {
  it('matches an organization connection by name with an empty owner', () => {
    expect(providerIssueFor([orgIssue, userIssue], model({ provider_name: 'acme' }))).toBe(orgIssue)
  })

  it('matches a user connection by name and owner', () => {
    expect(
      providerIssueFor(
        [orgIssue, userIssue],
        model({ provider_name: 'mine', provider_owner: 'tester' }),
      ),
    ).toBe(userIssue)
  })

  it('does not match the same name under a different owner', () => {
    expect(
      providerIssueFor(
        [userIssue],
        model({ provider_name: 'mine', provider_owner: 'someone-else' }),
      ),
    ).toBeUndefined()
  })

  it('ignores models without a provider name, like session models', () => {
    expect(providerIssueFor([orgIssue], model({}))).toBeUndefined()
    expect(providerIssueFor([orgIssue], undefined)).toBeUndefined()
  })
})

describe('isOrgModel', () => {
  it('is an organization model by its id', () => {
    expect(isOrgModel('org:acme/model-a')).toBe(true)
    expect(isOrgModel('user:tester/model-b')).toBe(false)
    expect(isOrgModel(null)).toBe(false)
    expect(isOrgModel(undefined)).toBe(false)
  })
})

describe('defaultModel', () => {
  const broken = model({ id: 'org:acme/broken', provider_name: 'acme' })
  const working = model({ id: 'org:other/working', provider_name: 'other' })
  const models = [broken, working]

  it('keeps the current model while the list offers it, broken or not', () => {
    expect(
      defaultModel({ models, providerIssues: [orgIssue], current: broken.id, stored: working.id }),
    ).toBe(broken.id)
  })

  it('returns to the model last chosen while the list offers it', () => {
    expect(
      defaultModel({ models, providerIssues: [orgIssue], current: 'gone', stored: broken.id }),
    ).toBe(broken.id)
  })

  it('starts on the first model whose provider has no issue', () => {
    expect(
      defaultModel({ models, providerIssues: [orgIssue], current: null, stored: 'gone' }),
    ).toBe(working.id)
  })

  it('starts on the first model when every provider has an issue', () => {
    expect(
      defaultModel({ models: [broken], providerIssues: [orgIssue], current: null, stored: null }),
    ).toBe(broken.id)
    expect(
      defaultModel({ models: [], providerIssues: [], current: 'gone', stored: null }),
    ).toBeNull()
  })
})

describe('defaultAllocation', () => {
  const allocations: Allocation[] = [
    { name: 'spent', total: 10, used: 10, disabled: true },
    { name: 'open', total: 10 },
    { name: 'other', total: 10 },
  ]

  it('starts an organization model on the first allocation it can charge', () => {
    expect(defaultAllocation({ model: 'org:acme/model-a', allocations, current: null })).toBe(
      'open',
    )
  })

  it('keeps the allocation chosen', () => {
    expect(defaultAllocation({ model: 'org:acme/model-a', allocations, current: 'other' })).toBe(
      'other',
    )
  })

  it('waits for the allocations to load', () => {
    expect(
      defaultAllocation({ model: 'org:acme/model-a', allocations: undefined, current: null }),
    ).toBeNull()
  })

  it('bills no allocation for any other model', () => {
    expect(defaultAllocation({ model: 'user:tester/model-b', allocations, current: 'open' })).toBe(
      null,
    )
  })
})
