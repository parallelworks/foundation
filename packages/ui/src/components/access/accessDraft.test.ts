import { describe, expect, it } from 'vitest'
import {
  type AccessValue,
  changedSubjects,
  normalize,
  permissionState,
  restore,
  revokeAll,
  toggle,
} from './accessDraft'

const IMPLIED = { writer: ['admin'], sudo: ['admin'], login: ['admin', 'writer', 'sudo'] }

const saved: AccessValue = {
  organization: {},
  groups: { admins: { admin: true }, users: { login: true } },
}

describe('permissionState', () => {
  it('locks permissions a higher one includes', () => {
    expect(permissionState(saved, 'admins', 'login', IMPLIED)).toEqual({
      pressed: true,
      lockedBy: 'permission',
    })
    expect(permissionState(saved, 'admins', 'admin', IMPLIED)).toEqual({
      pressed: true,
      lockedBy: null,
    })
  })

  it('locks a group permission the organization grants, directly or through an implication', () => {
    const value = toggle(saved, null, 'sudo')
    expect(permissionState(value, 'users', 'sudo', IMPLIED).lockedBy).toBe('organization')
    expect(permissionState(value, 'users', 'login', IMPLIED).lockedBy).toBe('organization')
    expect(permissionState(value, null, 'login', IMPLIED).lockedBy).toBe('permission')
  })

  it('reports an ungranted permission as off', () => {
    expect(permissionState(saved, 'nobody', 'login', IMPLIED)).toEqual({
      pressed: false,
      lockedBy: null,
    })
  })
})

describe('changedSubjects', () => {
  it('counts each changed group and the organization once', () => {
    let draft = toggle(saved, 'users', 'sudo')
    draft = toggle(draft, 'users', 'writer')
    draft = toggle(draft, 'new-group', 'login')
    draft = toggle(draft, null, 'login')
    expect(changedSubjects(draft, saved)).toEqual([null, 'users', 'new-group'])
  })

  it('treats a permission turned on and off again as unchanged', () => {
    const draft = toggle(toggle(saved, 'users', 'sudo'), 'users', 'sudo')
    expect(changedSubjects(draft, saved)).toEqual([])
  })
})

describe('revokeAll and restore', () => {
  it('clears every permission of one group and brings them back', () => {
    const revoked = revokeAll(saved, 'admins')
    expect(changedSubjects(revoked, saved)).toEqual(['admins'])
    expect(revoked.groups['users']).toEqual({ login: true })
    expect(changedSubjects(restore(revoked, saved, 'admins'), saved)).toEqual([])
  })

  it('works on the organization', () => {
    const granted: AccessValue = { ...saved, organization: { login: true } }
    expect(revokeAll(granted, null).organization).toEqual({})
    expect(restore(revokeAll(granted, null), granted, null).organization).toEqual({ login: true })
  })
})

describe('normalize', () => {
  it('drops false flags and groups left with nothing', () => {
    const draft = toggle(revokeAll(saved, 'admins'), 'users', 'sudo')
    expect(normalize(toggle(draft, null, 'login'))).toEqual({
      organization: { login: true },
      groups: { users: { login: true, sudo: true } },
    })
  })
})
