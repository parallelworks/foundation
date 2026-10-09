import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import type { SidebarState } from '../core/sidebarState'
import { makeStaticAdapter, makeSummaries, StoryChat } from '../stories/harness'
import ChatEmptyState from './ChatEmptyState'
import ChatLayout, { DRAWER_BELOW_PX, type SidebarMode } from './ChatLayout'

const meta: Meta = {
  title: 'Chat/Layout',
  component: ChatLayout,
  parameters: { layout: 'fullscreen' },
}

export default meta

function Frame({ width, children }: { width?: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        height: '100dvh',
        width: width ?? '100%',
        maxWidth: '100%',
        borderRight: width ? '1px solid var(--theme-border)' : undefined,
      }}
    >
      {children}
    </div>
  )
}

function useStoryAdapter() {
  return useMemo(() => makeStaticAdapter({ summaries: makeSummaries({ count: 12 }) }), [])
}

// The column beside the thread. 'reader' leaves the state to the reader's
// toggle; any other value is a host that owns it, and a host that hides the
// list brings it back from its own header.
export const Inline: StoryObj<{ sidebar: 'reader' | SidebarState }> = {
  args: { sidebar: 'reader' },
  argTypes: {
    sidebar: {
      control: 'select',
      options: ['reader', 'expanded', 'collapsed', 'hidden'],
      description: 'ChatProvider `sidebar`: who owns the state, and what the host set',
    },
  },
  render: (args) => {
    const Host = () => {
      const adapter = useStoryAdapter()
      const [sidebar, setSidebar] = useState<SidebarState>(
        args.sidebar === 'reader' ? 'expanded' : args.sidebar,
      )
      const control =
        args.sidebar === 'reader' ? undefined : { sidebar, onSidebarChange: setSidebar }
      return (
        <StoryChat adapter={adapter} conversationId="conv-1" sidebarControl={control}>
          <Frame>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {control && (
                <div className="flex items-center gap-2 border-b theme-border px-3 py-2 text-sm">
                  <span className="theme-muted-text">Host header</span>
                  {(['expanded', 'collapsed', 'hidden'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSidebar(s)}
                      className="rounded border theme-border px-2 py-0.5"
                      aria-pressed={sidebar === s}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0 }}>
                <ChatLayout>
                  <ChatEmptyState />
                </ChatLayout>
              </div>
            </div>
          </Frame>
        </StoryChat>
      )
    }
    return <Host key={args.sidebar} />
  },
}

// A phone: the thread takes the full width and the list opens over it from
// the toggle. A tap outside, Escape or picking a conversation closes it.
export const Drawer: StoryObj<{ drawerOpen: boolean; drawerToggle: boolean }> = {
  args: { drawerOpen: true, drawerToggle: true },
  argTypes: {
    drawerOpen: { control: 'boolean', description: 'Open on first render' },
    drawerToggle: {
      control: 'boolean',
      description: 'ChatLayout `drawerToggle`: false when the host header opens the drawer',
    },
  },
  render: (args) => {
    const Phone = () => {
      const adapter = useStoryAdapter()
      const [drawerOpen, setDrawerOpen] = useState(args.drawerOpen)
      return (
        <StoryChat
          adapter={adapter}
          conversationId="conv-1"
          sidebarControl={{ drawerOpen, onDrawerOpenChange: setDrawerOpen }}
        >
          <Frame width={390}>
            <ChatLayout sidebarMode="drawer" drawerToggle={args.drawerToggle}>
              <ChatEmptyState />
            </ChatLayout>
          </Frame>
        </StoryChat>
      )
    }
    return <Phone key={`${args.drawerOpen}-${args.drawerToggle}`} />
  },
}

// 'auto' follows the width the chat is given, not the window's: narrow the
// frame past drawerBelowPx and the column becomes a drawer.
export const Auto: StoryObj<{ width: number; drawerBelowPx: number; sidebarMode: SidebarMode }> = {
  args: { width: 600, drawerBelowPx: DRAWER_BELOW_PX, sidebarMode: 'auto' },
  argTypes: {
    width: { control: { type: 'range', min: 320, max: 1440, step: 10 } },
    drawerBelowPx: { control: { type: 'range', min: 400, max: 1200, step: 10 } },
    sidebarMode: { control: 'inline-radio', options: ['inline', 'drawer', 'auto'] },
  },
  render: (args) => {
    const Sized = () => {
      const adapter = useStoryAdapter()
      return (
        <StoryChat adapter={adapter} conversationId="conv-1">
          <Frame width={args.width}>
            <ChatLayout sidebarMode={args.sidebarMode} drawerBelowPx={args.drawerBelowPx}>
              <ChatEmptyState />
            </ChatLayout>
          </Frame>
        </StoryChat>
      )
    }
    return <Sized />
  },
}
