import cx from 'classnames'
import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { KeyboardShortcutsProvider } from '../core/KeyboardShortcutsProvider'
import { type SidebarPresentation, useReportSidebarPresentation } from '../core/sidebarState'
import { SidebarToggle } from '../ui/sidebar'
import ChatSidebar from './ChatSidebar'

/** Where the conversation list goes: beside the thread, in a drawer over it,
 *  or whichever fits the width the chat is given. */
export type SidebarMode = 'inline' | 'drawer' | 'auto'

export const DRAWER_BELOW_PX = 768

// Measured on the chat's own box rather than the window, because a chat
// embedded in a panel can be narrow on a wide screen.
function useSidebarPresentation(
  ref: RefObject<HTMLElement | null>,
  mode: SidebarMode,
  drawerBelowPx: number,
): SidebarPresentation {
  const [narrow, setNarrow] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (mode !== 'auto' || !el) {
      return
    }
    const measure = () => setNarrow(el.clientWidth < drawerBelowPx)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, mode, drawerBelowPx])

  const presentation = mode === 'drawer' || (mode === 'auto' && narrow) ? 'drawer' : 'inline'
  const report = useReportSidebarPresentation()
  useLayoutEffect(() => {
    report(presentation)
  }, [report, presentation])
  useLayoutEffect(() => () => report('inline'), [report])
  return presentation
}

// Sidebar plus main area; render the active page (empty state, thread, or
// attachments) as children. Must be mounted inside a ChatProvider.
export default function ChatLayout({
  children,
  sidebarActions = true,
  sidebarMode = 'inline',
  drawerBelowPx = DRAWER_BELOW_PX,
  drawerToggle = true,
}: {
  children: ReactNode
  sidebarActions?: boolean
  sidebarMode?: SidebarMode
  /** The chat's width under which 'auto' shows the drawer. */
  drawerBelowPx?: number
  /** False when the host's own header opens the drawer. */
  drawerToggle?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drawer = useSidebarPresentation(ref, sidebarMode, drawerBelowPx) === 'drawer'
  const { drawerOpen, toggleSidebar } = useChat()
  const { strings } = useChatConfig()

  return (
    <KeyboardShortcutsProvider>
      <div ref={ref} className={cx('flex h-full', drawer && 'relative overflow-hidden')}>
        <ChatSidebar actions={sidebarActions} />
        <main inert={drawer && drawerOpen} className="flex-1 flex flex-col min-w-0">
          {drawer && drawerToggle && (
            <div className="flex shrink-0 items-center bg-(--theme-panel-bg) px-2 pt-2">
              <SidebarToggle
                collapsed={!drawerOpen}
                onToggle={toggleSidebar}
                openLabel={strings.sidebar.openSidebar}
                closeLabel={strings.sidebar.closeSidebar}
              />
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </main>
      </div>
    </KeyboardShortcutsProvider>
  )
}
