import type { Allocation, ChatModel, ProviderIssue } from '../types'

export function providerIssueFor(
  issues: ProviderIssue[],
  model: Pick<ChatModel, 'provider_name' | 'provider_owner'> | undefined,
): ProviderIssue | undefined {
  if (!model?.provider_name) {
    return undefined
  }
  return issues.find(
    (issue) =>
      issue.provider_name === model.provider_name &&
      (issue.provider_owner ?? '') === (model.provider_owner ?? ''),
  )
}

/** Only org models bill to an allocation; any other model ignores it. */
export function isOrgModel(modelId: string | null | undefined): boolean {
  return modelId?.startsWith('org:') ?? false
}

/** The model the chat selects once its models load: the current one, else the one last chosen,
 *  while the list still offers it; else the first whose provider has no issue, else the first. */
export function defaultModel({
  models,
  providerIssues,
  current,
  stored,
}: {
  models: ChatModel[]
  providerIssues: ProviderIssue[]
  current: string | null
  stored: string | null
}): string | null {
  const offers = (id: string | null) => !!id && models.some((m) => m.id === id)
  // A remembered choice survives even when its provider is broken (the
  // banner explains); only the fresh default skips broken providers.
  const firstUsable = models.find((model) => !providerIssueFor(providerIssues, model)) ?? models[0]
  return offers(current) ? current : offers(stored) ? stored : (firstUsable?.id ?? null)
}

/** The allocation the chat bills a model to: none for a model that bills none, else the current
 *  one, else the first it can charge once the allocations load. */
export function defaultAllocation({
  model,
  allocations,
  current,
}: {
  model: string | null | undefined
  allocations: Allocation[] | undefined
  current: string | null
}): string | null {
  if (!isOrgModel(model)) {
    return null
  }
  return current || (allocations?.find((a) => !a.disabled)?.name ?? null)
}
