import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { LogViewer } from './LogViewer'

const meta: Meta<typeof LogViewer> = {
  title: 'UI/LogViewer',
  component: LogViewer,
}
export default meta

const ANSI_LOG = [
  'Provisioning cluster nodes...',
  '[32m✓[0m controller booted in 41s',
  '[33mwarning:[0m spot capacity is limited in us-east-1a',
  '[31merror:[0m node-3 failed preflight, retrying',
  '[36mnode-3[0m rejoining with [35mbackoff=2s[0m',
  'Done. [1m4/4 nodes ready[0m',
].join('\n')

const COMMAND_LOG = [
  '::group::Install dependencies',
  'pnpm install --frozen-lockfile',
  'Done in 12.4s',
  '::endgroup::',
  '::warning::lockfile is 3 days old',
  'Running test suite',
  '::error::2 tests failed in api/routes.test.ts',
  '::notice::coverage uploaded',
  '::debug::worker pool drained in 80ms',
].join('\n')

export const AnsiColors: StoryObj<typeof LogViewer> = {
  args: {
    log: ANSI_LOG,
    width: 720,
    height: 320,
  },
}

export const WorkflowCommands: StoryObj<typeof LogViewer> = {
  args: {
    log: COMMAND_LOG,
    width: 720,
    height: 320,
    enableWorkflowCommands: true,
  },
}

/** The time range filter: days from a calendar, times beside them. */
export const TimeRange: StoryObj<typeof LogViewer> = {
  args: {
    log: ANSI_LOG,
    width: 720,
    height: 320,
    enableTimeRangeFilter: true,
    initialTimeRangeFrom: '2026-03-14T09:00',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Time range/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'From' }))
    const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(
      new Date(2026, 2, 15),
    )
    await userEvent.click(
      within(await screen.findByRole('grid')).getByRole('button', { name: day }),
    )
    // Picking a day closes the calendar, not the range panel under it.
    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument())
    await expect(screen.getByRole('button', { name: 'Apply' })).toBeVisible()
  },
}

export const Inline: StoryObj<typeof LogViewer> = {
  args: {
    log: ANSI_LOG,
    width: '100%',
    height: 'unset',
    inline: true,
    enableWorkflowCommands: false,
  },
}
