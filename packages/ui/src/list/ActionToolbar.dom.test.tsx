// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ActionToolbar } from './ActionToolbar'

// jsdom measures nothing, so two or more items on the right all move into the `…` menu.

const icon = <svg />

describe('ActionToolbar toggles', () => {
  it('say whether they are pressed, disabled ones and ones moved into the menu too', () => {
    render(
      <ActionToolbar
        groups={[
          [
            { key: 'refresh', label: 'Auto refresh', icon, onClick: () => {}, checked: true },
            {
              key: 'follow',
              label: 'Follow',
              icon,
              onClick: () => {},
              checked: false,
              disabled: true,
            },
          ],
        ]}
        right={[
          { key: 'graph', label: 'Graph', icon, onClick: () => {}, checked: true },
          { key: 'editor', label: 'Editor', icon, onClick: () => {}, checked: false },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Auto refresh' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false')
    // The menu keeps its rows mounted while closed.
    expect(screen.getByRole('menuitemcheckbox', { name: 'Graph', hidden: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemcheckbox', { name: 'Editor', hidden: true })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
})

describe('ActionToolbar', () => {
  it('is one named toolbar whose disabled actions stay reachable and say why', () => {
    render(
      <ActionToolbar
        label="Cluster controls"
        groups={[
          [
            { key: 'open', label: 'Open', icon, href: '/open', primary: true },
            {
              key: 'delete',
              label: 'Delete',
              icon,
              onClick: () => {},
              destructive: true,
              disabled: true,
              disabledReason: 'Stop it first',
            },
          ],
        ]}
      />,
    )
    const toolbar = screen.getByRole('toolbar', { name: 'Cluster controls' })
    expect(toolbar).toContainElement(screen.getByRole('link', { name: 'Open' }))
    const remove = screen.getByRole('button', { name: 'Delete. Stop it first' })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(remove).not.toHaveAttribute('disabled')
  })

  it('warns once when more than one action is primary', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const groups = [
      [
        { key: 'a', label: 'Start', icon, onClick: () => {}, primary: true },
        { key: 'b', label: 'Stop', icon, onClick: () => {}, primary: true },
      ],
    ]
    const { rerender } = render(<ActionToolbar groups={groups} />)
    rerender(<ActionToolbar groups={groups} />)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Start", "Stop" are all primary'))
    warn.mockRestore()
  })
})
