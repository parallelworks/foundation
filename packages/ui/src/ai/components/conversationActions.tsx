import { DateTime } from 'luxon'
import { type ReactNode, useState } from 'react'
import { DownloadIcon, EditIcon, ShareIcon, TrashIcon } from '../../icons'
import { type OpenMenu, type RowMenuItem, useRowMenu } from '../../list/index'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { conversationToMarkdown, downloadText, exportFilename } from '../core/exportConversation'
import type { ConversationSummary } from '../types'
import { useRowDialogs } from '../ui/sidebar'
import ShareDialog from './ShareDialog'

export type ConversationGroupKey =
  | 'groupToday'
  | 'groupYesterday'
  | 'groupThisWeek'
  | 'groupThisMonth'
  | 'groupOlder'

/** Conversations by how long ago they started, newest group first, leaving
 *  out the groups with none. Each key names its label in the sidebar strings. */
export function groupConversationsByDate<T extends { createdAt: string }>(
  conversations: T[],
): { key: ConversationGroupKey; items: T[] }[] {
  const now = DateTime.now()
  const groups: Record<ConversationGroupKey, T[]> = {
    groupToday: [],
    groupYesterday: [],
    groupThisWeek: [],
    groupThisMonth: [],
    groupOlder: [],
  }
  for (const conv of conversations) {
    const days = now.diff(DateTime.fromISO(conv.createdAt), 'days').days
    const key: ConversationGroupKey =
      days < 1
        ? 'groupToday'
        : days < 2
          ? 'groupYesterday'
          : days < 7
            ? 'groupThisWeek'
            : days < 30
              ? 'groupThisMonth'
              : 'groupOlder'
    groups[key].push(conv)
  }
  return (Object.entries(groups) as [ConversationGroupKey, T[]][])
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => ({ key, items }))
}

/** What a conversation row offers behind its menu (rename, share, download,
 *  delete) and the menu and dialogs that carry them out, for any list of
 *  conversations. Render `overlays` once beside the list. */
export function useConversationActions({
  menuZClassName,
}: {
  /** The menu's stacking class, for a list inside a layer above the page. */
  menuZClassName?: string
} = {}): {
  menuItems: (conv: ConversationSummary) => RowMenuItem[]
  openMenu: OpenMenu
  overlays: ReactNode
} {
  const { strings } = useChatConfig()
  const t = strings.sidebar
  const { adapter, notify, deleteConversation, updateConversationTitle } = useChat()
  const { openMenu, contextMenu } = useRowMenu(menuZClassName)
  const [sharing, setSharing] = useState<string | null>(null)
  const { requestDelete, requestRename, dialogs } = useRowDialogs<ConversationSummary>({
    strings: {
      deleteTitle: t.deleteTitle,
      deleteBody: () => t.deleteBody,
      deleteAction: t.deleteAction,
      renameTitle: t.renameTitle,
      renameLabel: t.renameLabel,
      renamePlaceholder: t.renamePlaceholder,
      renameAction: t.renameAction,
    },
    nameOf: (conv) => conv.title || t.untitled,
    onDelete: (conv) => deleteConversation(conv.id),
    onRename: (conv, title) => updateConversationTitle(conv.id, title),
  })

  const download = async (id: string) => {
    try {
      const conversation = await adapter.conversations.get(id)
      downloadText(exportFilename(conversation.title), conversationToMarkdown(conversation))
    } catch {
      notify.error(strings.chrome.exportError)
    }
  }

  const menuItems = (conv: ConversationSummary): RowMenuItem[] => [
    {
      kind: 'action',
      label: t.rename,
      icon: <EditIcon />,
      onSelect: () => requestRename(conv),
    },
    // Only the owner can change who a conversation is shared with.
    ...(adapter.sharing && conv.isOwner !== false
      ? [
          {
            kind: 'action',
            label: t.share,
            icon: <ShareIcon />,
            onSelect: () => setSharing(conv.id),
          } satisfies RowMenuItem,
        ]
      : []),
    {
      kind: 'action',
      label: strings.chrome.download,
      icon: <DownloadIcon />,
      onSelect: () => void download(conv.id),
    },
    {
      kind: 'action',
      label: t.delete,
      icon: <TrashIcon />,
      destructive: true,
      onSelect: () => requestDelete(conv),
    },
  ]

  const overlays = (
    <>
      {contextMenu}
      {dialogs}
      {sharing && <ShareDialog conversationId={sharing} isOpen onClose={() => setSharing(null)} />}
    </>
  )

  return { menuItems, openMenu, overlays }
}
