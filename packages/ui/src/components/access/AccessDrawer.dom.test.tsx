// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessDrawer, type AccessDrawerProps } from './AccessDrawer'
import type { AccessValue } from './accessValue'

afterEach(cleanup)

const PERMISSIONS = [
  { key: 'admin', label: 'Admin', category: 'Compute' },
  { key: 'login', label: 'Login', category: 'Compute' },
  { key: 'read', label: 'Read buckets', category: 'Storage' },
]
const IMPLIED = { login: ['admin'] }
const GROUPS = [{ name: 'zeta', members: 3 }, { name: 'alpha', members: 1 }, { name: 'beta' }]
const VALUE: AccessValue = {
  organization: {},
  groups: { zeta: { admin: true }, beta: { read: true } },
}
const REFRESHED: AccessValue = {
  organization: {},
  groups: { zeta: { admin: true }, beta: { read: true }, alpha: { login: true } },
}

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

function permissionButton(label: string) {
  return screen.getByRole('button', { name: new RegExp(`^${label} \\(`) })
}

function holders(label: string) {
  return within(screen.getByRole('list', { name: `Who has ${label}` }))
}

describe('AccessDrawer', () => {
  it('lists only granted permissions with how many hold each, by resource type', () => {
    renderDrawer()
    const compute = within(screen.getByRole('region', { name: 'Compute' }))
    expect(compute.getByRole('button', { name: /^Admin \(1\)/ })).toBeInTheDocument()
    expect(compute.getByRole('button', { name: /^Login \(1\)/ })).toBeInTheDocument()
    const storage = within(screen.getByRole('region', { name: 'Storage' }))
    expect(storage.getByRole('button', { name: /^Read buckets \(1\)/ })).toBeInTheDocument()
    expect(screen.getByText('3 of 3 permissions granted')).toBeInTheDocument()
  })

  it('shows who holds a permission, marking ones that come with a higher permission', () => {
    renderDrawer()
    fireEvent.click(permissionButton('Login'))
    expect(holders('Login').getByText('zeta')).toBeInTheDocument()
    expect(holders('Login').getByText('Included by Admin')).toBeInTheDocument()
    expect(holders('Login').queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })

  it('filters by group name and opens the permissions that group holds', async () => {
    renderDrawer()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter by permission or group' }), {
      target: { value: 'beta' },
    })
    await waitFor(() => expect(holders('Read buckets').getByText('beta')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^Admin \(/ })).not.toBeInTheDocument()
  })

  it('offers to clear a filter that matches nothing', async () => {
    renderDrawer({ defaultQuery: 'nope' })
    expect(await screen.findByText('Nothing matches “nope”')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    await waitFor(() => expect(permissionButton('Admin')).toBeInTheDocument())
  })

  it('removes a holder after confirming, and undoes it', async () => {
    const { onSave } = renderDrawer()
    fireEvent.click(permissionButton('Admin'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove zeta from Admin' }))
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(holders('Admin').getByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Removed zeta from Admin'),
    )
    expect(onSave).toHaveBeenLastCalledWith({ organization: {}, groups: { beta: { read: true } } })
    expect(screen.queryByRole('button', { name: /^Admin \(/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Change undone'))
    expect(onSave).toHaveBeenLastCalledWith(VALUE)
    expect(permissionButton('Admin')).toBeInTheDocument()
  })

  it('keeps the shown grants when a save fails', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('nope')
    })
    renderDrawer({ onSave })
    fireEvent.click(permissionButton('Admin'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove zeta from Admin' }))
    fireEvent.click(holders('Admin').getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled())
    expect(holders('Admin').getByText('zeta')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('shows grants refreshed while a save that then fails was in flight', async () => {
    let fail: (error: Error) => void = () => {}
    const onSave = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)))
    const props = {
      open: true,
      onClose: () => {},
      permissions: PERMISSIONS,
      groups: GROUPS,
      onSave,
    }
    const { rerender } = render(<AccessDrawer {...props} value={VALUE} />)
    fireEvent.click(permissionButton('Admin'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove zeta from Admin' }))
    fireEvent.click(holders('Admin').getByRole('button', { name: 'Remove' }))
    rerender(<AccessDrawer {...props} value={REFRESHED} />)
    await act(async () => fail(new Error('nope')))
    expect(permissionButton('Login')).toBeInTheDocument()
  })

  it('saves a confirmed change on top of grants refreshed while confirming', async () => {
    const onSave = vi.fn(async (_next: AccessValue) => {})
    const props = {
      open: true,
      onClose: () => {},
      permissions: PERMISSIONS,
      groups: GROUPS,
      onSave,
      confirmSave: { title: 'Save access?' },
    }
    const { rerender } = render(<AccessDrawer {...props} value={VALUE} />)
    fireEvent.click(permissionButton('Admin'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove zeta from Admin' }))
    rerender(<AccessDrawer {...props} value={REFRESHED} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        organization: {},
        groups: { beta: { read: true }, alpha: { login: true } },
      }),
    )
  })

  it('undoes only its own change, keeping grants refreshed since', async () => {
    const onSave = vi.fn(async (_next: AccessValue) => {})
    const props = {
      open: true,
      onClose: () => {},
      permissions: PERMISSIONS,
      groups: GROUPS,
      onSave,
    }
    const { rerender } = render(<AccessDrawer {...props} value={VALUE} />)
    fireEvent.click(permissionButton('Admin'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove zeta from Admin' }))
    fireEvent.click(holders('Admin').getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Removed'))
    rerender(
      <AccessDrawer
        {...props}
        value={{ organization: {}, groups: { beta: { read: true }, alpha: { login: true } } }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(REFRESHED))
  })

  it("doesn't offer to undo removing the organization when it can't be granted", async () => {
    renderDrawer({
      value: { organization: { read: true }, groups: {} },
      organization: { disabledReason: 'Turned off by policy' },
    })
    fireEvent.click(permissionButton('Read buckets'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Everyone in the organization from Read buckets' }),
    )
    fireEvent.click(holders('Read buckets').getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Removed'))
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('keeps focus in the drawer while removing a holder', async () => {
    renderDrawer()
    fireEvent.click(permissionButton('Admin'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove zeta from Admin' }))
    expect(holders('Admin').getByRole('button', { name: 'Cancel' })).toHaveFocus()
    fireEvent.click(holders('Admin').getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Remove zeta from Admin' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Remove zeta from Admin' }))
    fireEvent.click(holders('Admin').getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(
        screen.getByRole('searchbox', { name: 'Filter by permission or group' }),
      ).toHaveFocus(),
    )
  })

  it('grants permissions to several groups from the grant drawer', async () => {
    const { onSave } = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }))
    const grantDialog = within(screen.getAllByRole('dialog').at(-1) as HTMLElement)
    const save = grantDialog.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    expect(grantDialog.getByText('Pick at least one group and one permission')).toBeInTheDocument()

    fireEvent.click(grantDialog.getByRole('checkbox', { name: /^alpha/ }))
    fireEvent.click(grantDialog.getByRole('checkbox', { name: /^Everyone in the organization/ }))
    fireEvent.click(grantDialog.getByRole('checkbox', { name: /^Read buckets/ }))
    expect(grantDialog.getByText('Grants 1 permission to 2 groups')).toBeInTheDocument()
    fireEvent.click(save)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Granted 1 permission to 2 groups'),
    )
    expect(onSave).toHaveBeenCalledWith({
      organization: { read: true },
      groups: { zeta: { admin: true }, beta: { read: true }, alpha: { read: true } },
    })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(holders('Read buckets').getByText('alpha')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Change undone'))
    expect(onSave).toHaveBeenLastCalledWith(VALUE)
  })

  it('keeps the grant drawer and its picks while a save is in flight', () => {
    renderDrawer({ onSave: vi.fn(() => new Promise<void>(() => {})) })
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }))
    const grantDialog = within(screen.getAllByRole('dialog').at(-1) as HTMLElement)
    fireEvent.click(grantDialog.getByRole('checkbox', { name: /^alpha/ }))
    fireEvent.click(grantDialog.getByRole('checkbox', { name: /^Read buckets/ }))
    fireEvent.click(grantDialog.getByRole('button', { name: 'Save' }))
    fireEvent.click(grantDialog.getByRole('button', { name: 'Close' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
  })

  it('narrows the permission picker to one resource type', () => {
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }))
    const grantDialog = within(screen.getAllByRole('dialog').at(-1) as HTMLElement)
    fireEvent.click(grantDialog.getByRole('button', { name: /^Storage/ }))
    expect(grantDialog.getByRole('checkbox', { name: /^Read buckets/ })).toBeInTheDocument()
    expect(grantDialog.queryByRole('checkbox', { name: /^Admin/ })).not.toBeInTheDocument()
  })

  it("won't grant to the organization when its reason says so", () => {
    renderDrawer({ organization: { disabledReason: 'Turned off by policy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }))
    const grantDialog = within(screen.getAllByRole('dialog').at(-1) as HTMLElement)
    expect(
      grantDialog.getByRole('checkbox', { name: /^Everyone in the organization/ }),
    ).toBeDisabled()
    expect(grantDialog.getByText('Turned off by policy')).toBeInTheDocument()
  })

  it('treats a falsy disabled reason as allowed', () => {
    renderDrawer({ organization: { disabledReason: false } })
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }))
    const grantDialog = within(screen.getAllByRole('dialog').at(-1) as HTMLElement)
    expect(
      grantDialog.getByRole('checkbox', { name: /^Everyone in the organization/ }),
    ).toBeEnabled()
  })

  it('asks before saving when the host wants a confirmation', async () => {
    const { onSave } = renderDrawer({ confirmSave: { title: 'Save access?' } })
    fireEvent.click(permissionButton('Admin'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove zeta from Admin' }))
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
  })

  it('closes only the grant drawer on Escape', () => {
    const { onClose } = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('has no grant or remove actions when read-only', () => {
    renderDrawer({ readOnly: true })
    fireEvent.click(permissionButton('Admin'))
    expect(screen.queryByRole('button', { name: 'Grant access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
  })

  it('explains the empty state when no one has access', () => {
    renderDrawer({ value: { organization: {}, groups: {} } })
    expect(screen.getByText('No one has access yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeInTheDocument()
  })

  it("doesn't point a read-only viewer at Grant access when no one has access", () => {
    renderDrawer({ value: { organization: {}, groups: {} }, readOnly: true })
    expect(screen.getByText('No one has access yet')).toBeInTheDocument()
    expect(screen.queryByText(/Use Grant access/)).not.toBeInTheDocument()
  })

  it('returns focus to the trigger and unlocks scrolling after both drawers close', async () => {
    function Host() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open access
          </button>
          <AccessDrawer
            open={open}
            onClose={() => setOpen(false)}
            permissions={PERMISSIONS}
            groups={GROUPS}
            value={VALUE}
            onSave={async () => {}}
          />
        </>
      )
    }
    render(<Host />)
    const trigger = screen.getByRole('button', { name: 'Open access' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }))
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.body.style.overflow).toBe('')
    expect(trigger).toHaveFocus()
  })
})
