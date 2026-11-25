import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { EditableIcon } from './EditableIcon'

const meta: Meta = {
  title: 'UI/Editable icon',
}
export default meta

// A mark drawn as SVG, so the stories need no image files.
const mark = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#3b82f6"/><circle cx="32" cy="32" r="16" fill="#facc15"/></svg>',
)}`

const fallback = (
  <span className="text-3xl font-semibold text-(--theme-muted-text-color)" aria-hidden>
    P
  </span>
)

interface IconArgs {
  withImage: boolean
  removable: boolean
  editable: boolean
  shape: 'circle' | 'square'
  border: boolean
}

/** Hover or focus the icon: it dims and offers to edit it, and the button on its corner
 *  removes the image. Editing here only counts the clicks, as a host opens its picker. */
export const Icon: StoryObj<IconArgs> = {
  args: { withImage: true, removable: true, editable: true, shape: 'circle', border: false },
  argTypes: {
    withImage: { control: 'boolean', description: 'Starts with an image.' },
    removable: {
      control: 'boolean',
      description: 'Passes onRemove, which adds the remove button.',
    },
    editable: { control: 'boolean', description: 'Off shows the icon alone.' },
    shape: { control: 'inline-radio', options: ['circle', 'square'] },
    border: { control: 'boolean' },
  },
  render: function Render({ withImage, removable, editable, shape, border }) {
    const [icon, setIcon] = useState<string | undefined>(withImage ? mark : undefined)
    const [edits, setEdits] = useState(0)
    return (
      <div className="flex items-center gap-6 p-8 text-sm text-(--theme-app)">
        <EditableIcon
          icon={icon}
          fallbackIcon={fallback}
          shape={shape}
          border={border}
          editable={editable}
          className="size-24 bg-(--theme-muted-panel-bg) rounded-full"
          onEdit={() => setEdits((n) => n + 1)}
          onRemove={removable ? () => setIcon(undefined) : undefined}
        />
        <span>Edits opened: {edits}</span>
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit image' }))
    await expect(canvas.getByText('Edits opened: 1')).toBeInTheDocument()
  },
}

/** Without an image the fallback shows, and there is nothing to remove; a small icon is
 *  compact, its text and corner button smaller. */
export const Fallback: StoryObj = {
  render: () => (
    <div className="flex gap-6 p-8">
      <EditableIcon
        fallbackIcon={fallback}
        className="size-24 rounded-full bg-(--theme-muted-panel-bg)"
        onEdit={() => {}}
        onRemove={() => {}}
      />
      <EditableIcon
        fallbackIcon={fallback}
        shape="square"
        border
        className="size-16"
        onEdit={() => {}}
      />
      <EditableIcon
        icon={mark}
        shape="square"
        border
        compact
        className="size-10"
        onEdit={() => {}}
        onRemove={() => {}}
      />
    </div>
  ),
}
