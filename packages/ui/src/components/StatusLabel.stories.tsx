import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties } from 'react'
import { expect, within } from 'storybook/test'
import { RunStatusIcon } from './RunStatusIcon'
import type { BadgeVariant } from './StatusBadge'
import { RunStatusLabel, StatusLabel } from './StatusLabel'

/** `StatusLabel` is a status: what state something is in, as a lamp or icon and the state's
 *  name in muted text, with no fill. `RunStatusLabel` is a run's, with the run status icon. Not a
 *  flag, which is a `StatusBadge`, and never a tinted pill. See
 *  [Which one](?path=/story/ui-badges--which-one). */
const meta: Meta = {
  title: 'UI/Badges/Status',
  tags: ['autodocs'],
}
export default meta

const column: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }

const TONES: { variant: BadgeVariant; name: string }[] = [
  { variant: 'success', name: 'Running' },
  { variant: 'info', name: 'Provisioning' },
  { variant: 'warning', name: 'Starting' },
  { variant: 'error', name: 'Error' },
  { variant: 'muted', name: 'Stopped' },
]

/** A status as a lamp and the state's name: lit in its tone, unlit with `off` for something off
 *  or not known, pinging with `pulse` for something under way, or an icon in place of the lamp.
 *  The lamp or icon is hidden from assistive technology, so the status is read once. See
 *  [Which one](?path=/story/ui-badges--which-one). */
export const Statuses: StoryObj = {
  render: () => (
    <div style={{ ...column, padding: 16 }}>
      {TONES.map(({ variant, name }) => (
        <StatusLabel key={name} variant={variant}>
          {name}
        </StatusLabel>
      ))}
      <StatusLabel off>Offline</StatusLabel>
      <StatusLabel variant="info" pulse>
        Syncing
      </StatusLabel>
      <StatusLabel icon={<RunStatusIcon status="warning" label="" />}>Degraded</StatusLabel>
      <div
        className="border border-(--theme-border)"
        style={{ width: 120, padding: 8, borderRadius: 8, display: 'flex' }}
      >
        <StatusLabel variant="warning">Waiting for capacity</StatusLabel>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Offline')).toBeVisible()
    await expect(canvas.queryByRole('img')).toBeNull()
  },
}

const RUN_STATUSES = [
  'running',
  'canceling',
  'completed',
  'failed',
  'error',
  'faulted',
  'canceled',
  'pending',
  'skipped',
]

/** A run's status: the run status icon and the runs module's name for it, from
 *  `strings.runStatus`. An error, a fault and a failure all read as Failed; a status with no name
 *  reads as `fallback` says, or as the server sent it. See
 *  [Which one](?path=/story/ui-badges--which-one). */
export const RunStatuses: StoryObj = {
  render: () => (
    <div style={{ ...column, padding: 16 }}>
      {RUN_STATUSES.map((status) => (
        <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <code className="text-(--theme-muted-text-color)" style={{ width: 80, fontSize: 12 }}>
            {status}
          </code>
          <RunStatusLabel
            status={status}
            fallback={(s) => (s === 'pending' ? 'Queued' : s === 'skipped' ? 'Skipped' : (s ?? ''))}
          />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Failed')).toHaveLength(3)
    await expect(canvas.getByText('Queued')).toBeVisible()
  },
}
