import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { keyedByContent } from '../../components/keys'
import { AddIcon, CloudIcon, TimesIcon, WarningTriangleIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { getGreeting } from '../core/greeting'
import useDragDrop from '../core/useDragDrop'
import type { AttachmentMeta } from '../types'
import BlockedGroupBanner from './BlockedGroupBanner'
import ChatInput, { type ChatInputHandle } from './ChatInput'
import { ComposerControls, ConnectToolsLink } from './ComposerChrome'
import DragOverlay from './DragOverlay'
import ProviderIssueBanner from './ProviderIssueBanner'

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

export default function ChatEmptyState({
  targetSession,
}: {
  targetSession?: string | null | undefined
}) {
  const { extraLinks, LinkComponent, slots, suggestedPrompts, strings } = useChatConfig()
  const t = strings.emptyState
  const tInput = strings.input
  const {
    adapter,
    currentUser,
    models,
    loadProviders,
    loadConversations,
    sendMessage,
    isLoading,
    isLoadingModels,
    hasLoadedModels,
    clearCurrentConversation,
    setSelectedProvider,
    refreshModels,
  } = useChat()

  const [builtinGreeting] = useState(() => getGreeting(currentUser))
  const greeting = t.greeting ?? builtinGreeting
  const [prompts] = useState(() => pickRandom(suggestedPrompts ?? [], 4))

  // Ref to ChatInput for handling file drops
  const inputRef = useRef<ChatInputHandle>(null)

  // Clear current conversation when landing on new chat page
  // This ensures we don't show streaming content from a previous conversation
  useEffect(() => {
    clearCurrentConversation()
  }, [clearCurrentConversation])

  useEffect(() => {
    loadProviders()
    loadConversations()
  }, [loadProviders, loadConversations])

  // Derive whether the requested session is unreachable
  const sessionUnreachable = useMemo(() => {
    if (!targetSession || !hasLoadedModels || isLoadingModels) {
      return false
    }
    if (models.length === 0) {
      return false // "no providers" CTA handles this
    }
    const prefix = `session:${targetSession}/`
    return !models.some((m) => m.id.startsWith(prefix))
  }, [targetSession, models, hasLoadedModels, isLoadingModels])

  const [sessionBannerDismissed, setSessionBannerDismissed] = useState(false)

  // Auto-select model matching the requested session
  useEffect(() => {
    if (!targetSession || !hasLoadedModels || isLoadingModels || models.length === 0) {
      return
    }
    const prefix = `session:${targetSession}/`
    const match = models.find((m) => m.id.startsWith(prefix))
    if (match) {
      setSelectedProvider(match.id)
    }
  }, [targetSession, models, hasLoadedModels, isLoadingModels, setSelectedProvider])

  const handleSendMessage = useCallback(
    async (content: string, attachmentIds?: string[], attachmentMeta?: AttachmentMeta) => {
      // sendMessage handles navigation internally when creating a new conversation
      await sendMessage(content, attachmentIds, undefined, attachmentMeta)
    },
    [sendMessage],
  )

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      handleSendMessage(prompt)
    },
    [handleSendMessage],
  )

  const handleFilesDropped = useCallback((files: FileList) => {
    inputRef.current?.addFiles(files)
  }, [])

  const { isDragging, dragHandlers } = useDragDrop({
    onFilesDropped: handleFilesDropped,
  })
  const attachmentsAvailable = !!adapter.attachments

  return (
    <div className="chat-empty flex h-full bg-(--theme-panel-bg)">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <BlockedGroupBanner />
        <ProviderIssueBanner />
        {/* Session unreachable banner */}
        {sessionUnreachable && !sessionBannerDismissed && (
          <div className="mx-4 mt-2 flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <WarningTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-700">
                {t.sessionUnreachableTitle(targetSession?.split(':').pop() ?? '')}
              </p>
              <p className="text-xs text-amber-600/80 mt-0.5">{t.sessionUnreachableBody}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => refreshModels()}
                className="text-xs font-medium text-amber-700 hover:text-amber-800 hover:bg-amber-500/10 px-2 py-1 rounded transition-colors cursor-pointer"
              >
                {t.retry}
              </button>
              <button
                type="button"
                onClick={() => setSessionBannerDismissed(true)}
                className="text-amber-400 hover:text-amber-600 transition-colors cursor-pointer"
              >
                <TimesIcon className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
        <div
          className="flex-1 flex flex-col relative bg-(--theme-panel-bg)"
          {...(attachmentsAvailable ? dragHandlers : {})}
        >
          {/* Page-wide drag overlay */}
          {isDragging && attachmentsAvailable && <DragOverlay className="rounded-2xl m-4" />}

          {/* The new chat starts where the eye already is: the greeting and
              the composer together, a little above centre, with starters
              under the box as plain rows rather than cards to choose among. */}
          <div className="flex-1 flex flex-col items-center justify-center pt-8 pb-[12vh]">
            <div className="w-full">
              {/* Welcome message - hidden when no providers configured */}
              {!(hasLoadedModels && models.length === 0) && (
                <div className="mx-auto mb-6 max-w-[var(--chat-column,50rem)] px-8 text-center">
                  <h1 className="text-[1.75rem] leading-tight font-medium tracking-[-0.02em] text-balance text-(--theme-panel)">
                    {greeting}
                  </h1>
                  <p className="mt-2 text-sm theme-muted-text">{t.modernSubtitle}</p>
                </div>
              )}

              {hasLoadedModels && models.length === 0 && (
                <div className="mx-auto mb-6 flex max-w-md flex-col items-center gap-3 px-8 text-center">
                  <CloudIcon className="h-10 w-10 theme-muted-text opacity-60" />
                  <p className="text-lg font-medium theme-text">{t.noProvidersTitle}</p>
                  <p className="text-sm theme-muted-text">{t.noProvidersBody}</p>
                  {extraLinks.addProvider && (
                    <LinkComponent
                      target={{
                        kind: 'external',
                        href: extraLinks.addProvider,
                      }}
                      className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-full transition-opacity text-sm font-medium theme-element hover:opacity-90"
                    >
                      <AddIcon className="h-3 w-3" />
                      {t.addProvider}
                    </LinkComponent>
                  )}
                </div>
              )}

              <ChatInput
                ref={inputRef}
                onSend={handleSendMessage}
                disabled={isLoading || isLoadingModels || models.length === 0}
                placeholder={
                  isLoadingModels
                    ? tInput.placeholderLoading
                    : hasLoadedModels && models.length === 0
                      ? tInput.placeholderNoProviders
                      : tInput.placeholder
                }
                settingsLeft={<ConnectToolsLink />}
                settingsRight={
                  <>
                    {slots.composerUsage}
                    <ComposerControls targetSession={targetSession} />
                  </>
                }
              />

              {prompts.length > 0 && !(hasLoadedModels && models.length === 0) && (
                <ul className="mx-auto max-w-[var(--chat-column,50rem)] px-8">
                  {keyedByContent(prompts, (p) => p).map(({ key, item: prompt }) => (
                    <li key={key} className="border-b theme-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => handleSuggestedPrompt(prompt)}
                        disabled={isLoading || isLoadingModels || models.length === 0}
                        className="-mx-3 my-1 block w-[calc(100%+1.5rem)] text-pretty rounded-lg px-3 py-2 text-left text-sm theme-muted-text transition-colors hover:chat-tint hover:theme-text disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {prompt}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
