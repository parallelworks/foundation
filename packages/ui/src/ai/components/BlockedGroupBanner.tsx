import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { NoticeCard } from '../ui/Notice'
import { getProviderKeyFromModelId } from './ModelSelector'

export default function BlockedGroupBanner() {
  const { strings } = useChatConfig()
  const { providers, selectedProvider } = useChat()

  if (!selectedProvider) {
    return null
  }

  const providerKey = getProviderKeyFromModelId(selectedProvider)
  const provider = providers.find((p) => `${p.user}:${p.name}` === providerKey)
  if (!provider?.groupBlocked || !provider.group) {
    return null
  }

  return (
    <div className="mx-4 mt-2">
      <NoticeCard
        tone="warning"
        title={strings.blockedGroup.title.replace('{group}', provider.group)}
      >
        {strings.blockedGroup.message}
      </NoticeCard>
    </div>
  )
}
