import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { DisplayIcon, FilterIcon, KeyboardIcon } from '../icons'
import { Button } from './Button'
import { Drawer, type DrawerProps } from './Drawer'
import { IconButton } from './IconButton'
import { Popover, type PopoverProps, useClosePopover } from './Popover'
import { Switch } from './Switch'

const meta: Meta = {
  title: 'UI/Overlays',
}
export default meta

type DrawerArgs = Pick<
  DrawerProps,
  'side' | 'resizable' | 'modal' | 'dismissible' | 'closeButton' | 'width'
> & { footer: boolean }

function DrawerDemo({ footer, ...props }: DrawerArgs) {
  const [open, setOpen] = useState(false)
  return (
    <div className="p-8">
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open drawer
      </Button>
      <Drawer
        {...props}
        open={open}
        onClose={() => setOpen(false)}
        title="Edit quota"
        description="Limits for every workload in the namespace."
        footer={
          footer && (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Save
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            Enforce limits
            <Switch defaultChecked />
          </label>
          <p className="text-(--theme-muted-text-color)">
            The body scrolls under the header and footer when its content runs long.
          </p>
        </div>
      </Drawer>
    </div>
  )
}

const openDrawer = async (canvasElement: HTMLElement) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Open drawer' }))
  const dialog = await screen.findByRole('dialog', { name: 'Edit quota' })
  await waitFor(() => expect(dialog).toBeVisible())
  return dialog
}

/** A side panel over the page: Escape, the backdrop or a swipe toward its edge close it. */
export const DrawerStory: StoryObj<DrawerArgs> = {
  name: 'Drawer',
  args: {
    side: 'right',
    width: 480,
    resizable: false,
    modal: true,
    dismissible: true,
    closeButton: true,
    footer: true,
  },
  argTypes: {
    side: { control: 'inline-radio', options: ['left', 'right'] },
    width: { control: 'text', description: 'Pixels, or a CSS length such as 100%.' },
    modal: { control: 'inline-radio', options: [true, 'trap-focus', false] },
    dismissible: { control: 'boolean', description: 'False ignores Escape and the backdrop.' },
  },
  render: (args) => <DrawerDemo {...args} />,
  play: async ({ canvasElement }) => {
    await openDrawer(canvasElement)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** A drag on the inner edge, or the arrow keys on it, set the width. */
export const DrawerResizable: StoryObj = {
  name: 'Drawer, resizable',
  render: () => <DrawerDemo resizable footer={false} />,
  play: async ({ canvasElement }) => {
    await openDrawer(canvasElement)
    const handle = screen.getByRole('separator', { name: 'Resize panel' })
    const before = Number(handle.getAttribute('aria-valuenow'))
    handle.focus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before + 16)
  },
}

/** Unsaved input: Escape and the backdrop leave it open; its footer closes it. */
export const DrawerNotDismissible: StoryObj = {
  name: 'Drawer, not dismissible',
  render: () => <DrawerDemo dismissible={false} closeButton={false} footer />,
  play: async ({ canvasElement }) => {
    const dialog = await openDrawer(canvasElement)
    await userEvent.keyboard('{Escape}')
    await expect(dialog).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Under a host's top bar: `--ds-drawer-top` keeps the bar uncovered. */
export const DrawerUnderTopBar: StoryObj = {
  name: 'Drawer, under a top bar',
  render: () => (
    <div style={{ ['--ds-drawer-top' as string]: '56px' }}>
      <div className="flex h-14 items-center border-b border-(--theme-border) px-4 text-sm font-semibold">
        Top bar
      </div>
      <DrawerDemo footer={false} />
    </div>
  ),
}

/** Inside an embedded panel: it covers the panel, not the window. */
export const DrawerContained: StoryObj = {
  name: 'Drawer, contained',
  render: () => {
    const Panel = () => {
      const [open, setOpen] = useState(true)
      return (
        <div
          style={{ position: 'relative', overflow: 'hidden', width: 390, height: 480 }}
          className="border border-(--theme-border)"
        >
          <div className="p-4">
            <Button variant="ghost" onClick={() => setOpen(true)}>
              Open list
            </Button>
          </div>
          <Drawer
            open={open}
            onClose={() => setOpen(false)}
            title="Conversations"
            side="left"
            width="min(20rem, 85%)"
            modal="trap-focus"
            contained
          >
            <p className="text-sm">Covers only the panel it sits in.</p>
          </Drawer>
        </div>
      )
    }
    return <Panel />
  },
}

type PopoverArgs = Pick<PopoverProps, 'side' | 'align' | 'openOnHover'>

/** A panel of controls under the button that opens it, named by its title. */
export const PopoverStory: StoryObj<PopoverArgs> = {
  name: 'Popover',
  args: { side: 'bottom', align: 'start', openOnHover: false },
  argTypes: {
    side: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
    align: { control: 'inline-radio', options: ['start', 'center', 'end'] },
    openOnHover: {
      control: 'boolean',
      description: 'Also opens on hover; a press still opens it.',
    },
  },
  render: (args) => (
    <div className="p-8">
      <Popover
        {...args}
        title="Widget options"
        className="w-72"
        trigger={<Button variant="ghost">Options</Button>}
      >
        <label className="flex items-center justify-between gap-3 text-sm">
          Show legend
          <Switch defaultChecked />
        </label>
      </Popover>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Options' }))
    const dialog = await screen.findByRole('dialog', { name: 'Widget options' })
    await waitFor(() => expect(dialog).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

function OrganizationLink({ name }: { name: string }) {
  const close = useClosePopover()
  return (
    <a
      href={`/organizations/${name.toLowerCase()}`}
      // As a router's link does: navigate in place, then close.
      onClick={(e) => {
        e.preventDefault()
        close()
      }}
      className="block rounded-md px-3 py-1.5 text-sm hover:bg-(--theme-hover)"
    >
      {name}
    </a>
  )
}

/** A list of links; following one closes the panel. */
export const PopoverOfLinks: StoryObj = {
  name: 'Popover of links',
  render: () => (
    <div className="p-8">
      <Popover
        aria-label="Organizations"
        className="w-64 p-1"
        trigger={<Button variant="ghost">Switch organization</Button>}
      >
        {['Research', 'Platform', 'Finance'].map((name) => (
          <OrganizationLink key={name} name={name} />
        ))}
      </Popover>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Switch organization' }),
    )
    await userEvent.click(await screen.findByRole('link', { name: 'Platform' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Outline icon buttons, as on a page header strip: one narrowing the page shows a
 *  dot, and a single-key shortcut presses it. Their tooltips hide while their popup is open. */
export const IconButtonTriggers: StoryObj<{ dot: boolean }> = {
  name: 'Icon button triggers',
  args: { dot: true },
  render: ({ dot }) => (
    <div className="flex items-center gap-2 p-8">
      <Popover
        title="Filter"
        align="end"
        className="w-56"
        trigger={
          <IconButton
            variant="outline"
            icon={<FilterIcon />}
            label="Filter"
            dot={dot}
            shortcut="f"
          />
        }
      >
        <p className="text-sm">Press F anywhere outside a text field to open this.</p>
      </Popover>
      <Popover
        aria-label="Display"
        align="end"
        className="w-56"
        trigger={<IconButton variant="outline" icon={<DisplayIcon />} label="Display" />}
      >
        <p className="text-sm">Display options</p>
      </Popover>
      <IconButton variant="ghost" size="sm" icon={<KeyboardIcon />} label="Shortcuts" />
    </div>
  ),
  play: async () => {
    await userEvent.keyboard('f')
    const dialog = await screen.findByRole('dialog', { name: 'Filter' })
    await waitFor(() => expect(dialog).toBeVisible())
  },
}
