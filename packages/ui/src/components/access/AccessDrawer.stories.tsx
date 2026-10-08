import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import { primaryButtonClasses } from '../ghostButton'
import { AccessDrawer } from './AccessDrawer'
import type { AccessGroup, AccessPermission, AccessValue, ImpliedPermissions } from './accessDraft'

const AREAS = [
  'analytics',
  'bio',
  'climate',
  'data',
  'design',
  'energy',
  'finance',
  'genomics',
  'imaging',
  'materials',
  'ml',
  'ops',
  'platform',
  'quantum',
  'research',
  'security',
  'simulation',
  'support',
  'viz',
  'weather',
]
const TEAMS = [
  'admins',
  'dev',
  'interns',
  'lab',
  'leads',
  'oncall',
  'prod',
  'readers',
  'staff',
  'students',
  'reviewers',
  'users',
]

function makeGroups(count: number): AccessGroup[] {
  const groups: AccessGroup[] = []
  for (let i = 0; groups.length < count; i++) {
    const area = AREAS[i % AREAS.length]
    const team = TEAMS[Math.floor(i / AREAS.length) % TEAMS.length]
    const round = Math.floor(i / (AREAS.length * TEAMS.length))
    groups.push({
      name: `${area}-${team}${round ? `-${round + 1}` : ''}`,
      members: ((i * 37) % 140) + 1,
    })
  }
  return groups
}

const FOUR: AccessPermission[] = [
  { key: 'admin', label: 'Admin', description: 'Full control, including who has access.' },
  { key: 'writer', label: 'Writer', description: 'Change the definition.' },
  { key: 'sudo', label: 'Sudo', description: 'Run commands as root.' },
  { key: 'login', label: 'Login', description: 'Sign in and submit work.' },
]
const FOUR_IMPLIED: ImpliedPermissions = {
  writer: ['admin'],
  sudo: ['admin'],
  login: ['admin', 'writer', 'sudo'],
}
const ONE: AccessPermission[] = [{ key: 'use', label: 'Use', description: 'Use this resource.' }]

function makeValue(
  groups: AccessGroup[],
  granted: number,
  single: boolean,
  organizationGranted: boolean,
): AccessValue {
  const cycle = single ? ['use'] : ['admin', 'writer', 'sudo', 'login', 'login']
  const value: AccessValue = {
    organization: organizationGranted ? { [single ? 'use' : 'login']: true } : {},
    groups: {},
  }
  groups.slice(0, granted).forEach((group, index) => {
    value.groups[group.name] = { [cycle[index % cycle.length] ?? 'login']: true }
  })
  return value
}

interface HarnessArgs {
  title: string
  width: number
  groupCount: number
  granted: number
  singlePermission: boolean
  organizationGranted: boolean
  loading: boolean
  loadError: boolean
  readOnly: boolean
  hideOrganization: boolean
  organizationDisabled: boolean
  confirmSave: boolean
  failSave: boolean
  withExtra: boolean
  defaultQuery: string
}

// Keyed on the args that build the grants, so changing one of them rebuilds the value.
function Harness(args: HarnessArgs) {
  return (
    <SeededHarness
      key={`${args.groupCount}-${args.granted}-${args.singlePermission}-${args.organizationGranted}`}
      {...args}
    />
  )
}

function SeededHarness(args: HarnessArgs) {
  const [open, setOpen] = useState(true)
  const groups = useMemo(() => makeGroups(args.groupCount), [args.groupCount])
  const [value, setValue] = useState(() =>
    makeValue(groups, args.granted, args.singlePermission, args.organizationGranted),
  )
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
        description={
          <>
            Cluster <span className="font-mono text-(--theme-app)">gpu-west</span>
          </>
        }
        permissions={args.singlePermission ? ONE : FOUR}
        implied={args.singlePermission ? undefined : FOUR_IMPLIED}
        groups={groups}
        value={args.loading ? undefined : value}
        loading={args.loading}
        error={
          args.loadError ? (
            <p className="text-sm text-(--theme-error)">Couldn’t load who has access.</p>
          ) : undefined
        }
        organization={
          args.hideOrganization
            ? false
            : args.organizationDisabled
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
          await new Promise((resolve) => setTimeout(resolve, 600))
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
    title: '',
    width: 640,
    groupCount: 240,
    granted: 6,
    singlePermission: false,
    organizationGranted: false,
    loading: false,
    loadError: false,
    readOnly: false,
    hideOrganization: false,
    organizationDisabled: false,
    confirmSave: false,
    failSave: false,
    withExtra: false,
    defaultQuery: '',
  },
  argTypes: {
    width: { control: { type: 'range', min: 320, max: 1200, step: 20 } },
    groupCount: { control: { type: 'range', min: 0, max: 1000, step: 10 } },
    granted: { control: { type: 'range', min: 0, max: 60, step: 1 } },
  },
}
export default meta

type Story = StoryObj<typeof Harness>

export const Default: Story = {}

export const Searching: Story = { args: { defaultQuery: 'ml-' } }

export const NoMatches: Story = { args: { defaultQuery: 'nothing-like-this' } }

export const SinglePermission: Story = { args: { singlePermission: true } }

export const ThousandGroups: Story = { args: { groupCount: 1000, granted: 40 } }

export const NoGroups: Story = { args: { groupCount: 0, granted: 0 } }

export const Loading: Story = { args: { loading: true } }

export const LoadError: Story = { args: { loadError: true } }

export const ReadOnly: Story = { args: { readOnly: true } }

export const OrganizationGranted: Story = { args: { organizationGranted: true } }

export const OrganizationDisabled: Story = { args: { organizationDisabled: true } }

export const WithoutOrganization: Story = { args: { hideOrganization: true } }

export const WithExtraSetting: Story = { args: { withExtra: true, singlePermission: true } }

export const ConfirmBeforeSaving: Story = { args: { confirmSave: true } }

export const SaveFails: Story = { args: { failSave: true } }
