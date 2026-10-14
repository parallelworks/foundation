import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { AddIcon, TrashIcon } from '../icons'
import { BreadcrumbProvider } from './Breadcrumbs'
import {
  BreadcrumbsActionButton,
  HeaderActionMenu,
  HeaderAddButton,
  HeaderEditButton,
  PageHeader,
} from './PageHeader'

const meta: Meta<typeof PageHeader> = {
  title: 'UI/PageHeader',
  component: PageHeader,
  decorators: [
    (Story) => (
      <BreadcrumbProvider>
        <Story />
      </BreadcrumbProvider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof PageHeader>

export const Basic: Story = {
  args: {
    breadcrumbs: [{ label: 'Clusters', href: '/clusters' }],
    title: 'gpu-cluster',
  },
}

export const WithActions: Story = {
  render: (args) => (
    <PageHeader
      {...args}
      breadcrumbs={[
        { label: 'Storage', href: '/storage' },
        { label: 'Buckets', href: '/storage/buckets' },
      ]}
      title="training-data"
      actions={
        <>
          <HeaderEditButton href="/storage/buckets/training-data/edit" />
          <HeaderAddButton label="Add object" word="add" href="/upload" />
          <HeaderActionMenu
            items={[
              { label: 'Duplicate', onClick: () => {} },
              { label: 'Delete', onClick: () => {} },
            ]}
          />
        </>
      }
    />
  ),
}

export const WithToolbar: Story = {
  args: {
    breadcrumbs: [{ label: 'Runs', href: '/runs' }],
    title: 'All runs',
    toolbar: (
      <div className="flex items-center gap-2 py-1.5">
        <BreadcrumbsActionButton icon={AddIcon} label="New run" href="/runs/new" />
      </div>
    ),
  },
}

interface ActionButtonArgs {
  label: string
  destructive: boolean
  disabled: boolean
}

/** A breadcrumb action that removes or breaks something takes the error color, as a destructive
 *  menu entry does. */
export const DestructiveAction: StoryObj<ActionButtonArgs> = {
  args: { label: 'Remove', destructive: true, disabled: false },
  render: ({ label, destructive, disabled }) => (
    <PageHeader
      breadcrumbs={[{ label: 'Storage', href: '/storage' }]}
      title="training-data"
      toolbar={
        <div className="flex items-center gap-3 py-1.5">
          <BreadcrumbsActionButton icon={AddIcon} label="Add object" href="/upload" />
          <BreadcrumbsActionButton
            icon={TrashIcon}
            label={label}
            destructive={destructive}
            disabled={disabled}
            onClick={() => {}}
          />
        </div>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const remove = canvas.getByRole('button', { name: 'Remove' })
    const add = canvas.getByRole('link', { name: 'Add object' })
    await expect(getComputedStyle(remove).color).not.toBe(getComputedStyle(add).color)
  },
}

interface ActionLinkArgs {
  href: string
  reloadDocument: boolean
  disabled: boolean
}

/** Header actions that navigate are links: each opens in a new tab, shows its URL on hover and
 *  routes through the host's link on a plain click. Disabled, each stays a focusable link that
 *  goes nowhere. */
export const ActionLinks: StoryObj<ActionLinkArgs> = {
  args: {
    href: '/storage/buckets/training-data?tab=objects#upload',
    reloadDocument: false,
    disabled: false,
  },
  argTypes: {
    href: { control: 'text', description: 'Where every action goes, search and hash included.' },
    reloadDocument: {
      control: 'boolean',
      description: 'Loads the page instead of routing, for a path the router does not serve.',
    },
  },
  render: ({ href, reloadDocument, disabled }) => {
    const link = { href, reloadDocument, disabled }
    return (
      <PageHeader
        breadcrumbs={[{ label: 'Storage', href: '/storage' }]}
        title="training-data"
        actions={
          <>
            <HeaderEditButton {...link} />
            <HeaderAddButton label="Add object" {...link} disabledHint="Needs write access" />
          </>
        }
        toolbar={
          <div className="flex items-center gap-3 py-1.5">
            <BreadcrumbsActionButton icon={AddIcon} label="Upload" {...link} />
          </div>
        }
      />
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    for (const name of ['Edit', /Add object/, 'Upload']) {
      const link = canvas.getByRole('link', { name })
      if (args.disabled) {
        await expect(link).toHaveAttribute('aria-disabled', 'true')
        await expect(link).not.toHaveAttribute('href')
      } else {
        await expect(link).toHaveAttribute('href', args.href)
      }
    }
  },
}

/** The same actions, disabled: links that go nowhere, still reachable for the tooltip saying why. */
export const ActionLinksDisabled: StoryObj<ActionLinkArgs> = {
  ...ActionLinks,
  args: { ...ActionLinks.args, disabled: true },
}
