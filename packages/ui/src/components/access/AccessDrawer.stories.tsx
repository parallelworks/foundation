import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useMemo, useState } from 'react'
import { expect, screen, userEvent } from 'storybook/test'
import {
  type Catalog,
  description,
  FEW_IMPLIED,
  makeGroups,
  makeValue,
  PERMISSIONS,
} from '../../test/access'
import { primaryButtonClasses } from '../ghostButton'
import { AccessDrawer } from './AccessDrawer'

interface HarnessArgs {
  catalog: Catalog
  groupCount: number
  title: string
  width: number
  empty: boolean
  organizationGranted: boolean
  loading: boolean
  loadError: boolean
  readOnly: boolean
  organization: 'enabled' | 'disabled' | 'hidden'
  confirmSave: boolean
  failSave: boolean
  withExtra: boolean
  defaultQuery: string
}

function Harness(args: HarnessArgs) {
  const [open, setOpen] = useState(true)
  const groups = useMemo(() => makeGroups(args.groupCount), [args.groupCount])
  const initial = useMemo(
    () => makeValue(args.catalog, args.empty, args.organizationGranted),
    [args.catalog, args.empty, args.organizationGranted],
  )
  const [value, setValue] = useState(initial)
  useEffect(() => setValue(initial), [initial])
  return (
    <div className="p-6">
      <button type="button" className={primaryButtonClasses} onClick={() => setOpen(true)}>
        Manage access
      </button>
      <AccessDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={args.title || undefined}
        width={args.width}
        description={description}
        permissions={PERMISSIONS[args.catalog]}
        implied={args.catalog === 'few' ? FEW_IMPLIED : undefined}
        groups={groups}
        value={args.loading ? undefined : value}
        loading={args.loading}
        error={
          args.loadError ? (
            <p className="text-sm text-(--theme-error)">Couldn’t load who has access.</p>
          ) : undefined
        }
        organization={
          args.organization === 'hidden'
            ? false
            : args.organization === 'disabled'
              ? { disabledReason: 'An organization policy turns off sharing with everyone.' }
              : {}
        }
        readOnly={args.readOnly}
        extra={
          args.withExtra ? (
            <div className="rounded-md border border-(--theme-border) px-3 py-2 text-sm">
              Anyone with the link can view. <span className="font-medium">Public</span>
            </div>
          ) : undefined
        }
        emptyAction={
          <button type="button" className={primaryButtonClasses}>
            Create a group
          </button>
        }
        confirmSave={
          args.confirmSave
            ? {
                title: 'Save access?',
                description: 'Running work picks up the change right away.',
              }
            : undefined
        }
        defaultQuery={args.defaultQuery}
        onSave={async (next) => {
          await new Promise((resolve) => setTimeout(resolve, 500))
          if (args.failSave) {
            throw new Error('save failed')
          }
          setValue(next)
        }}
      />
    </div>
  )
}

const meta: Meta<typeof Harness> = {
  title: 'UI/Access drawer',
  component: Harness,
  args: {
    catalog: 'many',
    groupCount: 240,
    title: '',
    width: 640,
    empty: false,
    organizationGranted: false,
    loading: false,
    loadError: false,
    readOnly: false,
    organization: 'enabled',
    confirmSave: false,
    failSave: false,
    withExtra: false,
    defaultQuery: '',
  },
  argTypes: {
    catalog: { control: 'inline-radio', options: ['many', 'few', 'one'] },
    organization: { control: 'inline-radio', options: ['enabled', 'disabled', 'hidden'] },
    groupCount: { control: { type: 'range', min: 0, max: 1000, step: 10 } },
    width: { control: { type: 'range', min: 320, max: 1200, step: 20 } },
  },
}
export default meta

type Story = StoryObj<typeof Harness>

export const Default: Story = {}

export const FewPermissions: Story = { args: { catalog: 'few' } }

export const SinglePermission: Story = { args: { catalog: 'one' } }

export const OrganizationGranted: Story = { args: { organizationGranted: true } }

export const FilteredByGroup: Story = { args: { defaultQuery: 'bio-admins' } }

export const NoMatches: Story = { args: { defaultQuery: 'nothing-like-this' } }

export const NoGrants: Story = { args: { empty: true } }

export const ThousandGroups: Story = { args: { groupCount: 1000 } }

export const Loading: Story = { args: { loading: true } }

export const LoadError: Story = { args: { loadError: true } }

export const ReadOnly: Story = { args: { readOnly: true, catalog: 'few' } }

export const WithExtraSetting: Story = { args: { withExtra: true, catalog: 'one' } }

export const ConfirmBeforeSaving: Story = { args: { confirmSave: true } }

export const SaveFails: Story = { args: { failSave: true } }

/** Remove asks inline before it saves. */
export const ConfirmingRemoval: Story = {
  args: { catalog: 'few' },
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: /^Admin \(/ }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove analytics-admins from Admin' }),
    )
    await expect(screen.getByText('Remove access?')).toBeVisible()
  },
}

/** A saved change leaves a notice with Undo. */
export const AfterRemoval: Story = {
  args: { catalog: 'few' },
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: /^Admin \(/ }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove analytics-admins from Admin' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await expect(await screen.findByRole('button', { name: 'Undo' })).toBeVisible()
  },
}
