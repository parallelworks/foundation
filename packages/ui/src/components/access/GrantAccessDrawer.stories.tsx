import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import { type Catalog, description, makeGroups, makeValue, PERMISSIONS } from '../../test/access'
import { primaryButtonClasses } from '../ghostButton'
import { GrantAccessDrawer } from './GrantAccessDrawer'

interface GrantArgs {
  catalog: Catalog
  groupCount: number
  organization: 'enabled' | 'disabled' | 'hidden'
  saving: boolean
}

function GrantHarness(args: GrantArgs) {
  const [open, setOpen] = useState(true)
  const groups = useMemo(() => makeGroups(args.groupCount), [args.groupCount])
  return (
    <div className="p-6">
      <button type="button" className={primaryButtonClasses} onClick={() => setOpen(true)}>
        Grant access
      </button>
      <GrantAccessDrawer
        open={open}
        onClose={() => setOpen(false)}
        description={description}
        permissions={PERMISSIONS[args.catalog]}
        groups={groups}
        organization={
          args.organization === 'hidden'
            ? false
            : args.organization === 'disabled'
              ? { disabledReason: 'Turned off by an organization policy' }
              : {}
        }
        value={makeValue(args.catalog, false, false)}
        saving={args.saving}
        preventClose={false}
        onGrant={() => setOpen(false)}
      />
    </div>
  )
}

const meta: Meta<typeof GrantHarness> = {
  title: 'UI/Access drawer/Grant access',
  component: GrantHarness,
  args: { catalog: 'many', groupCount: 240, organization: 'enabled', saving: false },
  argTypes: {
    catalog: { control: 'inline-radio', options: ['many', 'few', 'one'] },
    organization: { control: 'inline-radio', options: ['enabled', 'disabled', 'hidden'] },
  },
}

export default meta

type Story = StoryObj<typeof GrantHarness>

export const Default: Story = {}

export const FewPermissions: Story = { args: { catalog: 'few' } }

export const OrganizationDisabled: Story = { args: { organization: 'disabled' } }

export const Saving: Story = { args: { saving: true } }
