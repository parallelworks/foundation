// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessDrawer, type AccessDrawerProps } from './AccessDrawer'
import type { AccessValue } from './accessDraft'

afterEach(cleanup)

const PERMISSIONS = [
  { key: 'admin', label: 'Admin' },
  { key: 'login', label: 'Login' },
]
const IMPLIED = { login: ['admin'] }
const GROUPS = [
  { name: 'zeta', members: 3 },
  { name: 'alpha', members: 1 },
  { name: 'beta', members: 8 },
  { name: 'gamma' },
]
const VALUE: AccessValue = { organization: {}, groups: { zeta: { admin: true } } }

function renderDrawer(props: Partial<AccessDrawerProps> = {}) {
  const onSave = vi.fn(async (_next: AccessValue) => {})
  const onClose = vi.fn()
  render(
    <AccessDrawer
      open
      onClose={onClose}
      permissions={PERMISSIONS}
      implied={IMPLIED}
      groups={GROUPS}
      value={VALUE}
      onSave={onSave}
      {...props}
    />,
  )
  return { onSave: (props.onSave as typeof onSave | undefined) ?? onSave, onClose }
}

function rowNames(section: string) {
  const region = screen.getByRole('region', { name: new RegExp(`^${section}`) })
  return within(region)
    .getAllByRole('listitem')
    .map((row) => row.querySelector('p')?.textContent)
}

function row(name: string) {
  const item = screen
    .getAllByRole('listitem')
    .find((li) => li.querySelector('p')?.textContent === name)
  if (!item) {
    throw new Error(`no row ${name}`)
  }
  return within(item)
}

describe('AccessDrawer', () => {
  it('lists groups with access first, then the rest A–Z', () => {
    renderDrawer()
    expect(rowNames('With access')).toEqual(['zeta'])
    expect(rowNames('All other groups')).toEqual(['alpha', 'beta', 'gamma'])
    expect(screen.getByText('4 groups')).toBeInTheDocument()
  })

  it('filters both sections by name and counts the matches', async () => {
    renderDrawer()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search groups' }), {
      target: { value: 'ta' },
    })
    await waitFor(() => expect(screen.getByText('2 of 4 groups')).toBeInTheDocument())
    expect(rowNames('With access')).toEqual(['zeta'])
    expect(rowNames('All other groups')).toEqual(['beta'])
  })

  it('shows a way out when nothing matches', async () => {
    renderDrawer({ defaultQuery: 'nope' })
    expect(await screen.findByText('No groups match “nope”')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    await waitFor(() => expect(rowNames('All other groups')).toHaveLength(3))
  })

  it('locks a permission a higher one includes', () => {
    renderDrawer()
    const login = row('zeta').getByRole('button', { name: 'Login' })
    expect(login).toHaveAttribute('aria-pressed', 'true')
    expect(login).toHaveAttribute('aria-disabled', 'true')
  })

  it('keeps an edited row in place and saves the full replacement value', async () => {
    const { onSave } = renderDrawer()
    fireEvent.click(row('alpha').getByRole('button', { name: 'Login' }))
    expect(rowNames('All other groups')).toEqual(['alpha', 'beta', 'gamma'])
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save access' }))
    await waitFor(() => expect(screen.getByText('Access saved')).toBeInTheDocument())
    expect(onSave).toHaveBeenCalledWith({
      organization: {},
      groups: { zeta: { admin: true }, alpha: { login: true } },
    })
    expect(rowNames('With access')).toEqual(['alpha', 'zeta'])
  })

  it('revokes every permission of a group and undoes it', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Revoke all permissions for zeta' }))
    expect(row('zeta').getByRole('button', { name: 'Admin' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(row('zeta').getByText('Access revoked, unsaved')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Undo changes for zeta' }))
    expect(row('zeta').getByRole('button', { name: 'Admin' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument()
  })

  it('calls it Revoke when there is only one permission', () => {
    renderDrawer({
      permissions: [{ key: 'admin', label: 'Admin' }],
      implied: undefined,
    })
    expect(screen.getByRole('button', { name: 'Revoke access for zeta' })).toHaveTextContent(
      'Revoke',
    )
  })

  it('keeps the changes when saving fails', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('nope')
    })
    renderDrawer({ onSave })
    fireEvent.click(row('beta').getByRole('button', { name: 'Admin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save access' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save access' })).toBeEnabled())
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
  })

  it('asks before closing over unsaved changes', async () => {
    const { onClose } = renderDrawer()
    fireEvent.click(row('beta').getByRole('button', { name: 'Admin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('closes straight away when nothing changed', () => {
    const { onClose } = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('locks the organization row with the reason shown', () => {
    renderDrawer({ organization: { disabledReason: 'Turned off by policy' } })
    const org = row('Everyone in the organization')
    expect(org.getByText('Turned off by policy')).toBeInTheDocument()
    expect(org.getByRole('button', { name: 'Admin' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('has no footer and no row actions when read-only', () => {
    renderDrawer({ readOnly: true })
    expect(screen.queryByRole('button', { name: 'Save access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Revoke all/ })).not.toBeInTheDocument()
  })
})
