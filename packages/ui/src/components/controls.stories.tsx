import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { AddIcon } from '../icons'
import { Button, MethodButton } from './Button'
import { type ButtonSize, type ButtonVariant, buttonClasses } from './buttonClasses'
import { Card, CardHeader } from './Card'
import Filter from './Filter'
import { FilterPill } from './FilterPill'
import { IconButton } from './IconButton'
import { Input, Textarea } from './Input'
import { LetterBadge } from './LetterBadge'
import { Pagination } from './Pagination'
import { RadioGroup } from './Radio'
import { SettingModeOption } from './SettingModeOption'
import { SettingRow, SettingSection } from './SettingRow'
import SettingsCard from './SettingsCard'
import SettingsGroup from './SettingsGroup'
import Sort, { type TDirection } from './Sort'
import { Switch } from './Switch'

const meta: Meta = {
  title: 'UI/Controls',
}
export default meta

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'danger']
const SIZES: ButtonSize[] = ['xs', 'sm', 'md']

/** The one button look: each variant at each size, its icon-only square, and
 *  the states every button shares. */
export const Buttons: StoryObj = {
  render: () => {
    const Demo = () => {
      const [pressed, setPressed] = useState(true)
      return (
        <div className="flex flex-col gap-6 p-8 text-sm">
          <table className="border-separate border-spacing-x-4 border-spacing-y-2">
            <tbody>
              {VARIANTS.map((variant) => (
                <tr key={variant}>
                  <th scope="row" className="pr-2 text-left font-medium theme-muted-text">
                    {variant}
                  </th>
                  {SIZES.map((size) => (
                    <td key={size}>
                      <Button variant={variant} size={size} icon={<AddIcon />}>
                        Create
                      </Button>
                    </td>
                  ))}
                  {SIZES.map((size) => (
                    <td key={`${size}-icon`}>
                      <IconButton variant={variant} size={size} label="Add" icon={<AddIcon />} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              aria-pressed={pressed}
              onClick={() => setPressed((on) => !on)}
            >
              Show hidden
            </Button>
            <Button variant="primary" size="sm" loading>
              Saving
            </Button>
            <Button variant="primary" size="sm" disabled>
              Unavailable
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled
              focusableWhenDisabled
              aria-label="Delete, which needs write access"
            >
              Delete
            </Button>
            <a href="#docs" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
              Read the docs
            </a>
          </div>
          <div className="max-w-sm">
            <MethodButton
              label="Single sign-on"
              description="Use your organization identity provider"
              href="/sso"
            />
          </div>
        </div>
      )
    }
    return <Demo />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: 'Show hidden' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(canvas.getByRole('button', { name: 'Saving' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    await expect(canvas.getByRole('link', { name: 'Read the docs' })).toBeInTheDocument()
    await expect(canvas.getAllByRole('button', { name: 'Add' })).toHaveLength(15)
  },
}

export const Inputs: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-3 max-w-sm">
      <Input label="Cluster name" placeholder="gpu-cluster" />
      <Input
        label="Job name"
        labelHint={<code className="text-xs theme-muted-text">name</code>}
        description="Letters, numbers, dashes and underscores."
        defaultValue="build"
      />
      <Input type="password" placeholder="Password" />
      <Input error="Name is already taken" defaultValue="gpu" />
      <Textarea placeholder="Description" rows={3} />
      <Textarea label="Notes" description="Shown to everyone who runs the workflow." rows={3} />
    </div>
  ),
}

export const Cards: StoryObj = {
  render: () => (
    <Card className="max-w-md p-6">
      <CardHeader title="Connect a cluster" description="Bring an existing SLURM cluster online" />
      <p className="text-sm text-(--theme-muted-text-color)">
        Body content sits on the card surface.
      </p>
    </Card>
  ),
}

function FilterSortDemo() {
  const [filter, setFilter] = useState('')
  const [pill, setPill] = useState(false)
  const [sorted, setSorted] = useState<'name' | ''>('name')
  const [direction, setDirection] = useState<TDirection>('ascending')
  return (
    <div className="flex items-center gap-3">
      <Filter filter={filter} setFilter={setFilter} />
      <FilterPill active={pill} onClick={() => setPill((a) => !a)}>
        Running
      </FilterPill>
      <span className="text-sm">
        Name
        <Sort
          currentlySorted={sorted || null}
          name="name"
          currentDirection={direction}
          setCurrentDirection={setDirection}
          setCurrentlySorted={setSorted}
        />
      </span>
    </div>
  )
}

export const FilterAndSort: StoryObj = {
  render: () => <FilterSortDemo />,
}

export const PaginationRow: StoryObj = {
  render: () => (
    <Pagination
      name="workflow runs"
      startingNumber={1}
      endingNumber={25}
      prevDisabled
      nextDisabled={false}
      prevCallback={() => {}}
      nextCallback={() => {}}
    />
  ),
}

function SettingsDemo() {
  const [enabled, setEnabled] = useState(true)
  const [mode, setMode] = useState('auto')
  return (
    <SettingsGroup>
      <SettingsCard title="Notifications" description="How we reach you">
        <SettingSection title="Email" isFirst />
        <SettingRow label="Run completion" helpText="Email when a workflow run finishes" isFirst>
          <Switch aria-label="Run completion" checked={enabled} onCheckedChange={setEnabled} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard title="Digest">
        <RadioGroup aria-label="Digest cadence" value={mode} onValueChange={setMode}>
          <SettingModeOption
            value="auto"
            label="Automatic"
            description="Send a digest when enough has happened"
            isFirst
          />
          <SettingModeOption value="daily" label="Daily" description="One digest every morning" />
          <SettingModeOption
            value="off"
            label="Off"
            description="Only the run completion emails"
            disabled={!enabled}
          />
        </RadioGroup>
      </SettingsCard>
    </SettingsGroup>
  )
}

export const Settings: StoryObj = {
  render: () => <SettingsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('Daily'))
    await expect(canvas.getByRole('radio', { name: /Daily/ })).toBeChecked()
  },
}

export const BadgesAndIconButtons: StoryObj = {
  render: () => (
    <div className="flex items-center gap-3">
      <LetterBadge text="M" />
      <LetterBadge text="Q" />
      <IconButton label="Refresh" icon={<span>↻</span>} />
    </div>
  ),
}
