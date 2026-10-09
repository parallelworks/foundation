import cx from 'classnames'
import { DateTime } from 'luxon'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  DownloadIcon,
  EditIcon,
  ImageIcon,
  NewChatIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  SharingIcon,
  TrashIcon,
} from '../../icons'
import { type OpenMenu, type RowMenuItem, useRowMenu } from '../../list/index'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { FOCUS_SIDEBAR_SEARCH_EVENT } from '../core/events'
import { conversationToMarkdown, downloadText, exportFilename } from '../core/exportConversation'
import type { ConversationSummary } from '../types'
import { ConversationSidebar } from '../ui/ConversationSidebar'
import { SidebarDrawer, SidebarRow, useRowDialogs } from '../ui/sidebar'
import ShareDialog from './ShareDialog'

const SIDEBAR_WIDTH_STORAGE_KEY = 'aiChatSidebarWidth'

type ConversationGroupKey =
  | 'groupToday'
  | 'groupYesterday'
  | 'groupThisWeek'
  | 'groupThisMonth'
  | 'groupOlder'

function groupByDate<T extends { id: string; title?: string | null; createdAt: string }>(
  conversations: T[],
): [ConversationGroupKey, T[]][] {
  const now = DateTime.now()
  const groups: Record<ConversationGroupKey, T[]> = {
    groupToday: [],
    groupYesterday: [],
    groupThisWeek: [],
    groupThisMonth: [],
    groupOlder: [],
  }

  for (const conv of conversations) {
    const dt = DateTime.fromISO(conv.createdAt)
    const diff = now.diff(dt, 'days').days

    if (diff < 1) {
      groups.groupToday.push(conv)
    } else if (diff < 2) {
      groups.groupYesterday.push(conv)
    } else if (diff < 7) {
      groups.groupThisWeek.push(conv)
    } else if (diff < 30) {
      groups.groupThisMonth.push(conv)
    } else {
      groups.groupOlder.push(conv)
    }
  }

  return (Object.entries(groups) as [ConversationGroupKey, T[]][]).filter(
    ([, items]) => items.length > 0,
  )
}

function ConversationRow({
  conv,
  isCurrent,
  sharingAvailable,
  openMenu,
  onRename,
  onShare,
  onDelete,
  onExport,
  onOpen,
}: {
  conv: ConversationSummary
  isCurrent: boolean
  sharingAvailable: boolean
  openMenu: OpenMenu
  onRename: (conv: ConversationSummary) => void
  onShare: (id: string) => void
  onDelete: (conv: ConversationSummary) => void
  onExport: (id: string) => void
  onOpen: () => void
}) {
  const { LinkComponent, strings } = useChatConfig()
  const t = strings.sidebar
  const menuItems: RowMenuItem[] = [
    {
      kind: 'action',
      label: t.rename,
      icon: <EditIcon />,
      onSelect: () => onRename(conv),
    },
    ...(sharingAvailable
      ? [
          {
            kind: 'action',
            label: t.share,
            icon: <ShareIcon />,
            onSelect: () => onShare(conv.id),
          } satisfies RowMenuItem,
        ]
      : []),
    {
      kind: 'action',
      label: strings.chrome.download,
      icon: <DownloadIcon />,
      onSelect: () => onExport(conv.id),
    },
    {
      kind: 'action',
      label: t.delete,
      icon: <TrashIcon />,
      destructive: true,
      onSelect: () => onDelete(conv),
    },
  ]

  return (
    <SidebarRow selected={isCurrent} menuItems={menuItems} openMenu={openMenu}>
      <LinkComponent
        target={{ kind: 'conversation', id: conv.id }}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        onClick={onOpen}
      >
        {conv.isOwner === false && (
          <SharingIcon className="h-3 w-3 shrink-0 theme-muted-text" title={t.sharedWithYou} />
        )}
        <span className="min-w-0 flex-1 truncate text-sm theme-text">
          {conv.title || t.untitled}
        </span>
      </LinkComponent>
    </SidebarRow>
  )
}

export default function ChatSidebar({
  actions = true,
  top,
}: {
  /** False when the host's page header carries new chat, attachments and search. */
  actions?: boolean
  /** The host's own content above the list, given whether it is the rail. */
  top?: ((state: { collapsed: boolean }) => ReactNode) | undefined
}) {
  const { extraLinks, LinkComponent, strings } = useChatConfig()
  const tSidebar = strings.sidebar
  const {
    adapter,
    navigation,
    notify,
    activeConversationId,
    conversations,
    sidebar,
    sidebarPresentation,
    drawerOpen,
    setSidebar,
    setDrawerOpen,
    toggleSidebar,
    isLoading,
    loadConversations,
    deleteConversation,
    updateConversationTitle,
    clearCurrentConversation,
  } = useChat()
  const sharingAvailable = !!adapter.sharing
  const attachmentsAvailable = !!adapter.attachments

  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [conversationToShare, setConversationToShare] = useState<string | null>(null)
  const { openMenu, contextMenu } = useRowMenu()
  const { requestDelete, requestRename, dialogs } = useRowDialogs<ConversationSummary>({
    strings: {
      deleteTitle: tSidebar.deleteTitle,
      deleteBody: () => tSidebar.deleteBody,
      deleteAction: tSidebar.deleteAction,
      renameTitle: tSidebar.renameTitle,
      renameLabel: tSidebar.renameLabel,
      renamePlaceholder: tSidebar.renamePlaceholder,
      renameAction: tSidebar.renameAction,
    },
    nameOf: (conv) => conv.title || tSidebar.untitled,
    onDelete: (conv) => deleteConversation(conv.id),
    onRename: (conv, title) => updateConversationTitle(conv.id, title),
  })

  const drawer = sidebarPresentation === 'drawer'
  // The drawer always opens to the full list; the rail is for a column.
  const sidebarCollapsed = !drawer && sidebar !== 'expanded'
  // Picking something in the drawer is done with it; with no drawer open
  // this does nothing.
  const closeDrawer = () => setDrawerOpen(false)

  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const revealRef = useRef(() => {})
  revealRef.current = () => {
    if (drawer) {
      setDrawerOpen(true)
    } else if (sidebar !== 'expanded') {
      setSidebar('expanded')
    }
  }

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!actions) {
      return
    }
    const focusSearch = () => {
      revealRef.current()
      // After expanding, the input mounts on the next frame.
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
    document.addEventListener(FOCUS_SIDEBAR_SEARCH_EVENT, focusSearch)
    return () => document.removeEventListener(FOCUS_SIDEBAR_SEARCH_EVENT, focusSearch)
  }, [actions])

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return conversations
    }
    return conversations.filter((conv) =>
      (conv.title || tSidebar.untitled).toLowerCase().includes(query),
    )
  }, [conversations, search, tSidebar.untitled])

  const groups = useMemo(
    () =>
      groupByDate(filteredConversations).map(([key, items]) => ({
        key,
        label: tSidebar[key],
        items,
      })),
    [filteredConversations, tSidebar],
  )

  const handleExport = async (id: string) => {
    try {
      const conversation = await adapter.conversations.get(id)
      downloadText(exportFilename(conversation.title), conversationToMarkdown(conversation))
    } catch {
      notify.error(strings.chrome.exportError)
    }
  }

  const handleShareClick = (id: string) => {
    setConversationToShare(id)
    setShareDialogOpen(true)
  }

  const handleNewChat = () => {
    closeDrawer()
    clearCurrentConversation()
    navigation.toNewChat()
  }

  const list = (
    <ConversationSidebar
      collapsed={sidebarCollapsed}
      fill={drawer}
      onToggle={toggleSidebar}
      toggleLabels={{ open: tSidebar.openSidebar, close: tSidebar.closeSidebar }}
      resize={{
        storageKey: SIDEBAR_WIDTH_STORAGE_KEY,
        label: tSidebar.resizeLabel,
        hint: tSidebar.resizeHint,
      }}
      groups={groups}
      getKey={(conv) => conv.id}
      renderRow={(conv) => (
        <ConversationRow
          conv={conv}
          isCurrent={activeConversationId === conv.id}
          sharingAvailable={sharingAvailable}
          openMenu={openMenu}
          onRename={requestRename}
          onShare={handleShareClick}
          onDelete={requestDelete}
          onExport={handleExport}
          onOpen={closeDrawer}
        />
      )}
      loading={isLoading}
      placeholder={
        conversations.length === 0 ? (
          <p className="theme-muted-text text-sm px-2 whitespace-nowrap">
            {tSidebar.noConversations}
          </p>
        ) : (
          <p className="theme-muted-text text-sm px-2">{strings.chrome.noMatches}</p>
        )
      }
      cycle={{
        current: filteredConversations.find((conv) => conv.id === activeConversationId),
        onSelect: (conv) => navigation.toConversation(conv.id),
      }}
      top={
        (top || actions) && (
          <>
            {top?.({ collapsed: sidebarCollapsed })}
            {actions && (
              <>
                <div className="flex flex-col gap-0.5 px-2 pt-2 pb-1">
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="flex items-center h-9 px-2 gap-3 rounded-lg font-medium transition-colors hover:chat-tint"
                    title={tSidebar.newChat}
                  >
                    <NewChatIcon className={cx('flex-shrink-0', 'w-4 h-4')} />
                    <span
                      className={cx(
                        'text-sm transition-opacity duration-200',
                        sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100',
                      )}
                    >
                      {tSidebar.newChat}
                    </span>
                  </button>

                  {attachmentsAvailable && (
                    <LinkComponent
                      target={{ kind: 'attachments' }}
                      className="flex items-center h-9 px-2 gap-3 rounded-lg transition-colors hover:chat-tint"
                      title={tSidebar.attachments}
                      onClick={closeDrawer}
                    >
                      <ImageIcon className="flex-shrink-0 w-4 h-4" />
                      <span
                        className={cx(
                          'text-sm transition-opacity duration-200',
                          sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100',
                        )}
                      >
                        {tSidebar.attachments}
                      </span>
                    </LinkComponent>
                  )}
                </div>

                {!sidebarCollapsed && conversations.length > 0 && (
                  <div className="px-2 pb-2">
                    <div className="relative">
                      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 theme-muted-text pointer-events-none" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape' && search) {
                            e.stopPropagation()
                            setSearch('')
                          }
                        }}
                        placeholder={strings.chrome.searchPlaceholder}
                        aria-label={strings.chrome.searchLabel}
                        className="w-full h-9 pl-8 pr-2 text-sm rounded-lg border border-transparent chat-tint theme-text placeholder:theme-muted-text transition-colors focus:outline-none focus:border-(--theme-border) focus:bg-(--theme-panel-bg)"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )
      }
      footer={
        extraLinks.manageProviders && (
          <LinkComponent
            target={{ kind: 'external', href: extraLinks.manageProviders }}
            className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs theme-muted-text transition-colors hover:chat-tint hover:theme-text"
            title={tSidebar.manageProviders}
          >
            <SettingsIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{tSidebar.manageProviders}</span>
          </LinkComponent>
        )
      }
    />
  )

  return (
    <>
      {drawer ? (
        <SidebarDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          label={tSidebar.drawerLabel}
          closeLabel={tSidebar.closeSidebar}
        >
          {list}
        </SidebarDrawer>
      ) : (
        sidebar !== 'hidden' && list
      )}

      {contextMenu}
      {dialogs}

      {conversationToShare && (
        <ShareDialog
          conversationId={conversationToShare}
          isOpen={shareDialogOpen}
          onClose={() => {
            setShareDialogOpen(false)
            setConversationToShare(null)
          }}
        />
      )}
    </>
  )
}
