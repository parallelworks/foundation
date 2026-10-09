import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { StatusDot } from '../../components/StatusBadge'
import { useRowMenu } from '../../list/index'
import { StoryViewport } from '../stories/harness'
import { ConversationSidebar, type ConversationSidebarGroup } from './ConversationSidebar'
import { SidebarRailItem, SidebarRow } from './sidebar'

const meta: Meta = {
  title: 'Chat/Conversation sidebar',
  component: ConversationSidebar,
  parameters: { layout: 'fullscreen' },
}

export default meta

type State = 'waiting' | 'running' | 'idle'

interface Task {
  id: string
  title: string
  state: State
  age: string
}

const TASKS: Task[] = [
  { id: 't1', title: 'Approve the schema migration', state: 'waiting', age: '2m' },
  { id: 't2', title: 'Fix the flaky upload test', state: 'running', age: '4m' },
  { id: 't3', title: 'Bump the build image', state: 'running', age: '11m' },
  { id: 't4', title: 'Write release notes', state: 'idle', age: '1h' },
  { id: 't5', title: 'Profile the slow report query', state: 'idle', age: '3d' },
]

const VARIANT = { waiting: 'warning', running: 'success', idle: 'muted' } as const

function grouped(tasks: Task[]): ConversationSidebarGroup<Task>[] {
  return [
    {
      key: 'waiting',
      label: 'Needs you',
      tone: 'attention' as const,
      items: tasks.filter((t) => t.state === 'waiting'),
    },
    { key: 'running', label: 'Running', items: tasks.filter((t) => t.state === 'running') },
    { key: 'idle', label: 'Idle', items: tasks.filter((t) => t.state === 'idle') },
  ].filter((g) => g.items.length > 0)
}

function TaskSidebar({ tasks, startCollapsed }: { tasks: Task[]; startCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(startCollapsed)
  const [openId, setOpenId] = useState<string | undefined>('t2')
  const { openMenu, contextMenu } = useRowMenu()
  const open = tasks.find((t) => t.id === openId)
  return (
    <StoryViewport>
      <ConversationSidebar<Task>
        label="Tasks"
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        toggleLabels={{ open: 'Open sidebar', close: 'Close sidebar' }}
        resize={{
          storageKey: 'storyTaskSidebarWidth',
          label: 'Resize task list',
          hint: 'Drag to resize; double-click to reset',
        }}
        groups={grouped(tasks)}
        getKey={(t) => t.id}
        cycle={{ current: open, onSelect: (t) => setOpenId(t.id) }}
        placeholder={<p className="px-2 pt-2 text-sm theme-muted-text">No tasks yet</p>}
        renderRow={(t) => (
          <SidebarRow
            selected={t.id === openId}
            openMenu={openMenu}
            menuItems={[{ kind: 'action', label: 'Rename', onSelect: () => {} }]}
          >
            <button
              type="button"
              onClick={() => setOpenId(t.id)}
              className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
            >
              {t.state !== 'idle' && <StatusDot variant={VARIANT[t.state]} size={6} />}
              <span className="min-w-0 flex-1 truncate text-sm theme-text">{t.title}</span>
              <span className="shrink-0 text-[11px] tabular-nums theme-muted-text">{t.age}</span>
            </button>
          </SidebarRow>
        )}
        rail={tasks
          .filter((t) => t.state !== 'idle')
          .map((t) => (
            <SidebarRailItem
              key={t.id}
              label={t.title}
              selected={t.id === openId}
              onSelect={() => setOpenId(t.id)}
            >
              <StatusDot variant={VARIANT[t.state]} />
            </SidebarRailItem>
          ))}
      >
        {contextMenu}
      </ConversationSidebar>
    </StoryViewport>
  )
}

export const Grouped: StoryObj<{ collapsed: boolean }> = {
  args: { collapsed: false },
  argTypes: { collapsed: { control: 'boolean' } },
  render: (args) => (
    <TaskSidebar key={String(args.collapsed)} tasks={TASKS} startCollapsed={args.collapsed} />
  ),
}

export const Rail: StoryObj = {
  render: () => <TaskSidebar tasks={TASKS} startCollapsed />,
}

export const Empty: StoryObj = {
  render: () => <TaskSidebar tasks={[]} startCollapsed={false} />,
}
