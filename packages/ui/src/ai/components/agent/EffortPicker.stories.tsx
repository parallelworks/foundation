import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ChevronDownIcon } from '../../../icons'
import { EFFORT_LEVELS, type EffortLevel } from '../../agent/effort'
import { chipClassName } from '../../ui/chip'
import EffortPicker from './EffortPicker'

const meta: Meta = {
  title: 'Chat/Effort picker',
  component: EffortPicker,
  parameters: { layout: 'fullscreen' },
  // At the foot of the page, where a composer's toolbar puts it, so the panel opens above.
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--theme-panel-bg)',
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default meta

type PickerArgs = {
  effort: EffortLevel | ''
  disabled: boolean
  open: boolean
  className: string
}

// Picks stick, so the chip and the slider move together as a host would make them.
function Picker({ effort, disabled, className }: PickerArgs) {
  const [picked, setPicked] = useState<string>(effort)
  return (
    <EffortPicker
      effort={picked}
      onPick={setPicked}
      disabled={disabled}
      className={className || undefined}
    />
  )
}

export const Chip: StoryObj<PickerArgs> = {
  args: { effort: 'high', disabled: false, open: false, className: '' },
  argTypes: {
    effort: {
      control: 'select',
      options: ['', ...EFFORT_LEVELS],
      description: 'The level set; empty is the default level',
    },
    open: { control: 'boolean', description: 'Opens the slider' },
    className: {
      control: 'text',
      description:
        "The chip's classes, for a toolbar that draws its chips differently; empty keeps the composer's",
    },
  },
  // Keyed by the level, so a control that changes it starts the picker over.
  render: (args) => <Picker key={args.effort} {...args} />,
  play: async ({ canvasElement, args }) => {
    if (args.open) {
      canvasElement.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click()
    }
  },
}

export const Open: StoryObj<PickerArgs> = {
  ...Chip,
  args: { ...Chip.args, open: true },
}

// No level set, as before a session starts: the default level.
export const Unset: StoryObj<PickerArgs> = {
  ...Chip,
  args: { ...Chip.args, effort: '', open: true },
}

export const Low: StoryObj<PickerArgs> = {
  ...Chip,
  args: { ...Chip.args, effort: 'low', open: true },
}

export const Max: StoryObj<PickerArgs> = {
  ...Chip,
  args: { ...Chip.args, effort: 'max', open: true },
}

export const Disabled: StoryObj<PickerArgs> = {
  ...Chip,
  args: { ...Chip.args, disabled: true },
}

// Right-aligned beside another chip, as a composer's toolbar sets it: stepping the level leaves the other chip where it is.
export const InToolbar: StoryObj<PickerArgs> = {
  ...Chip,
  args: { ...Chip.args, effort: 'low', open: true },
  render: (args) => (
    <div className="flex w-[420px] items-center justify-end gap-1">
      <button type="button" className={chipClassName}>
        <span className="truncate">Model</span>
        <ChevronDownIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
      <Picker key={args.effort} {...args} />
    </div>
  ),
}
