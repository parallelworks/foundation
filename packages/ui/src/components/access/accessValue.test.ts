import { describe, expect, it } from 'vitest'
import {
  type AccessValue,
  alreadyGranted,
  grant,
  holdersByPermission,
  normalize,
  revoke,
} from './accessValue'

const PERMISSIONS = [{ key: 'admin' }, { key: 'sudo' }, { key: 'login' }].map((p) => ({
  ...p,
  label: p.key,
}))
const IMPLIED = { sudo: ['admin'], login: ['admin', 'sudo'] }

const value: AccessValue = {
  organization: { login: true },
  groups: { zeta: { admin: true }, alpha: { sudo: true }, empty: {} },
}

describe('holdersByPermission', () => {
  it('lists direct and implied holders, the organization first and groups A–Z', () => {
    const holders = holdersByPermission(value, PERMISSIONS, IMPLIED)
    expect(holders.get('admin')).toEqual([{ subject: 'zeta', via: null }])
    expect(holders.get('sudo')).toEqual([
      { subject: 'alpha', via: null },
      { subject: 'zeta', via: 'admin' },
    ])
    expect(holders.get('login')).toEqual([
      { subject: null, via: null },
      { subject: 'alpha', via: 'sudo' },
      { subject: 'zeta', via: 'admin' },
    ])
  })

  it('leaves out permissions nobody has', () => {
    const holders = holdersByPermission(
      { organization: {}, groups: { a: { sudo: true } } },
      PERMISSIONS,
      {},
    )
    expect([...holders.keys()]).toEqual(['sudo'])
  })
})

describe('grant and revoke', () => {
  it('adds every permission to every subject, including the organization', () => {
    const next = grant(value, [null, 'alpha', 'new'], ['admin', 'sudo'])
    expect(next.organization).toEqual({ login: true, admin: true, sudo: true })
    expect(next.groups['alpha']).toEqual({ sudo: true, admin: true })
    expect(next.groups['new']).toEqual({ admin: true, sudo: true })
    expect(next.groups['zeta']).toBe(value.groups['zeta'])
  })

  it('removes one permission from one subject', () => {
    expect(revoke(value, 'zeta', 'admin').groups['zeta']).toEqual({})
    expect(revoke(value, null, 'login').organization).toEqual({})
  })

  it('counts pairs that are already granted directly', () => {
    expect(alreadyGranted(value, [null, 'zeta'], ['login', 'admin'])).toBe(2)
  })
})

describe('normalize', () => {
  it('drops false flags and groups left with nothing', () => {
    expect(
      normalize({
        organization: { login: false },
        groups: { a: { sudo: true, login: false }, b: {} },
      }),
    ).toEqual({ organization: {}, groups: { a: { sudo: true } } })
  })
})
