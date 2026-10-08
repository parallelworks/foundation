import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Drawer } from './Drawer'
import { ghostButtonClasses, primaryButtonClasses } from './ghostButton'

interface HarnessArgs {
  width: number
  withToolbar: boolean
  withFooter: boolean
  preventClose: boolean
  rows: number
}

function Harness({ width, withToolbar, withFooter, preventClose, rows }: HarnessArgs) {
  const [open, setOpen] = useState(true)
  return (
    <div className="p-6">
      <button type="button" className={primaryButtonClasses} onClick={() => setOpen(true)}>
        Open drawer
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Details"
        description="Supporting text under the title."
        width={width}
        preventClose={preventClose}
        toolbar={
          withToolbar ? (
            <input
              type="search"
              aria-label="Filter"
              placeholder="Filter"
              className="h-9 w-full rounded-md border border-(--theme-border) bg-(--theme-input-bg) px-3 text-sm"
            />
          ) : undefined
        }
        footer={
          withFooter ? (
            <div className="flex justify-end gap-2">
              <button type="button" className={ghostButtonClasses} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className={primaryButtonClasses}>
                Apply
              </button>
            </div>
          ) : undefined
        }
      >
        <ul>
          {Array.from({ length: rows }, (_, i) => `Row ${i + 1}`).map((label) => (
            <li key={label} className="border-b border-(--theme-border) px-6 py-3 text-sm">
              {label}
            </li>
          ))}
        </ul>
      </Drawer>
    </div>
  )
}

const meta: Meta<typeof Harness> = {
  title: 'UI/Drawer',
  component: Harness,
  args: { width: 640, withToolbar: true, withFooter: true, preventClose: false, rows: 40 },
  argTypes: { width: { control: { type: 'range', min: 320, max: 1200, step: 20 } } },
}
export default meta

type Story = StoryObj<typeof Harness>

export const Default: Story = {}

export const Plain: Story = { args: { withToolbar: false, withFooter: false, rows: 6 } }

export const PreventClose: Story = { args: { preventClose: true } }
