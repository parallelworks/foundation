// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ActionToolbar } from './ActionToolbar'

// jsdom measures nothing, so two or more items on the right all move into the `…` menu.

const Icon = () => null

describe('ActionToolbar toggles', () => {
  it('say whether they are pressed, disabled ones and ones moved into the menu too', () => {
    render(
      <ActionToolbar
        groups={[
          [
            { key: 'refresh', label: 'Auto refresh', icon: Icon, onClick: () => {}, pressed: true },
            {
              key: 'follow',
              label: 'Follow',
              icon: Icon,
              onClick: () => {},
              pressed: false,
              disabled: true,
            },
          ],
        ]}
        right={[
          { key: 'graph', label: 'Graph', icon: Icon, onClick: () => {}, pressed: true },
          { key: 'editor', label: 'Editor', icon: Icon, onClick: () => {}, pressed: false },
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
