import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { GridIcon, ListViewIcon, SettingsIcon } from '../icons'
import { AppFrame, AppFrameNavItem, type AppFrameProps, AppFrameToggle, useAppFrame } from './index'

function Header() {
  const { isMobile } = useAppFrame()
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 48,
        padding: '0 16px',
        borderBottom: '1px solid var(--theme-border)',
      }}
    >
      {isMobile && <AppFrameToggle />}
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Projects</h1>
    </header>
  )
}
function Demo(args: AppFrameProps) {
  const [active, setActive] = useState('Projects')
  return (
    <AppFrame
      {...args}
      navigationKey={active}
      brand={({ expanded }) => (
        <strong
          style={{ display: 'block', padding: '6px 0', textAlign: expanded ? 'start' : 'center' }}
        >
          {expanded ? 'Workspace' : 'W'}
        </strong>
      )}
      navigation={
        <nav aria-label="Main navigation">
          {[
            { label: 'Overview', icon: GridIcon },
            { label: 'Projects', icon: ListViewIcon },
            { label: 'Settings', icon: SettingsIcon },
          ].map(({ label, icon: Icon }) => (
            <AppFrameNavItem
              key={label}
              label={label}
              icon={<Icon />}
              selected={active === label}
              onClick={() => setActive(label)}
            />
          ))}
        </nav>
      }
      footer={({ isMobile }) => !isMobile && <AppFrameToggle />}
      header={<Header />}
    >
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Shared projects</h2>
        <p style={{ color: 'var(--theme-muted-text-color)', marginBottom: 24 }}>
          Choose a project to view its resources and members.
        </p>
        {['Climate research', 'Materials lab', 'Team operations'].map((name, i) => (
          <div
            key={name}
            style={{
              display: 'flex',
              gap: 12,
              padding: '16px 0',
              borderTop: '1px solid var(--theme-border)',
            }}
          >
            <span style={{ flex: 1 }}>{name}</span>
            <span style={{ color: 'var(--theme-muted-text-color)' }}>{[8, 12, 4][i]} members</span>
          </div>
        ))}
      </div>
    </AppFrame>
  )
}
const meta = {
  title: 'UI/App frame',
  component: AppFrame,
  render: Demo,
  parameters: { layout: 'fullscreen' },
  args: {
    navigation: null,
    children: null,
    defaultExpanded: true,
    defaultWidth: 240,
    minWidth: 200,
    maxWidth: 400,
    railWidth: 64,
    resizable: true,
    mobileBreakpoint: 768,
    fullBleed: false,
    style: { height: 560 },
  },
  argTypes: {
    defaultExpanded: { control: 'boolean' },
    expanded: { control: 'boolean' },
    onExpandedChange: { action: 'expanded' },
    defaultWidth: { control: { type: 'range', min: 160, max: 400, step: 8 } },
    width: { control: 'number' },
    onWidthChange: { action: 'width' },
    minWidth: { control: 'number' },
    maxWidth: { control: 'number' },
    railWidth: { control: 'number' },
    resizable: { control: 'boolean' },
    mobileBreakpoint: { control: 'number' },
    navigationKey: { control: 'text' },
    fullBleed: { control: 'boolean' },
    labels: { control: 'object' },
    mainId: { control: 'text' },
    mainClassName: { control: 'text' },
    className: { control: 'text' },
    style: { control: 'object' },
    banner: { control: 'text' },
    brand: { control: false },
    navigation: { control: false },
    header: { control: false },
    footer: { control: false },
    children: { control: false },
  },
} satisfies Meta<typeof AppFrame>
export default meta
type Story = StoryObj<typeof meta>
export const Expanded: Story = {}
export const Collapsed: Story = { args: { defaultExpanded: false } }
export const Compact: Story = { args: { minWidth: 168, defaultWidth: 184 } }
export const FullBleed: Story = { args: { fullBleed: true } }
export const FixedWidth: Story = { args: { resizable: false } }
export const Banner: Story = {
  args: {
    banner: (
      <div
        style={{
          padding: '6px 16px',
          background: 'var(--theme-accent)',
          color: 'var(--theme-accent-text)',
        }}
      >
        Scheduled maintenance on Saturday, 09:00–10:00 UTC.
      </div>
    ),
  },
}
export const Dark: Story = { globals: { mode: 'dark' } }
export const Mobile: Story = {
  args: { mobileBreakpoint: 10000, style: { width: 390, maxWidth: '100%', height: 700 } },
}
export const MobileOpen: Story = {
  ...Mobile,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open navigation' }))
    await expect(canvas.getByRole('dialog', { name: 'Main navigation' })).toBeVisible()
  },
}
export const KeyboardResize: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const splitter = canvas.getByRole('separator')
    splitter.focus()
    await userEvent.keyboard('{End}')
    await expect(splitter).toHaveAttribute('aria-valuenow', '400')
    await userEvent.keyboard('{Home}{ArrowLeft}')
    await expect(splitter).toHaveAttribute('aria-valuenow', '64')
    await userEvent.keyboard('{ArrowRight}')
    await expect(splitter).toHaveAttribute('aria-valuenow', '200')
  },
}
