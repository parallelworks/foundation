export interface AccessPermission {
  key: string
  label: string
  description?: string
}

export interface AccessGroup {
  name: string
  members?: number
}

/** Grants keyed by permission, for the organization as a whole and for each group by name. */
export interface AccessValue {
  organization: Record<string, boolean>
  groups: Record<string, Record<string, boolean>>
}

/** `implied[key]` lists the permissions that include `key`. */
export type ImpliedPermissions = Readonly<Record<string, readonly string[]>>

/** A group name, or `null` for the organization. */
export type AccessSubject = string | null

export interface PermissionState {
  pressed: boolean
  /** What grants the permission when the subject can't turn it off itself. */
  lockedBy: 'permission' | 'organization' | null
}

const NONE: Record<string, boolean> = {}

export function grants(value: AccessValue, subject: AccessSubject): Record<string, boolean> {
  return (subject === null ? value.organization : value.groups[subject]) ?? NONE
}

export function hasAccess(perms: Record<string, boolean>): boolean {
  return Object.values(perms).some(Boolean)
}

export function sameGrants(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (Boolean(a[key]) !== Boolean(b[key])) {
      return false
    }
  }
  return true
}

function isImplied(
  perms: Record<string, boolean>,
  key: string,
  implied: ImpliedPermissions,
): boolean {
  return (implied[key] ?? []).some((higher) => perms[higher])
}

export function permissionState(
  value: AccessValue,
  subject: AccessSubject,
  key: string,
  implied: ImpliedPermissions,
): PermissionState {
  const org = value.organization
  if (subject !== null && (org[key] || isImplied(org, key, implied))) {
    return { pressed: true, lockedBy: 'organization' }
  }
  const perms = grants(value, subject)
  if (isImplied(perms, key, implied)) {
    return { pressed: true, lockedBy: 'permission' }
  }
  return { pressed: Boolean(perms[key]), lockedBy: null }
}

function withGrants(
  value: AccessValue,
  subject: AccessSubject,
  perms: Record<string, boolean>,
): AccessValue {
  if (subject === null) {
    return { ...value, organization: perms }
  }
  return { ...value, groups: { ...value.groups, [subject]: perms } }
}

export function toggle(value: AccessValue, subject: AccessSubject, key: string): AccessValue {
  const perms = grants(value, subject)
  return withGrants(value, subject, { ...perms, [key]: !perms[key] })
}

export function revokeAll(value: AccessValue, subject: AccessSubject): AccessValue {
  return withGrants(value, subject, {})
}

export function restore(
  value: AccessValue,
  saved: AccessValue,
  subject: AccessSubject,
): AccessValue {
  return withGrants(value, subject, { ...grants(saved, subject) })
}

export function changedSubjects(draft: AccessValue, saved: AccessValue): AccessSubject[] {
  const changed: AccessSubject[] = []
  if (!sameGrants(draft.organization, saved.organization)) {
    changed.push(null)
  }
  const names = new Set([...Object.keys(draft.groups), ...Object.keys(saved.groups)])
  for (const name of names) {
    if (!sameGrants(grants(draft, name), grants(saved, name))) {
      changed.push(name)
    }
  }
  return changed
}

function granted(perms: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(perms).filter(([, on]) => on))
}

/** Drops false flags and groups left with nothing: the shape a full-replace save expects. */
export function normalize(value: AccessValue): AccessValue {
  return {
    organization: granted(value.organization),
    groups: Object.fromEntries(
      Object.entries(value.groups)
        .map(([name, perms]) => [name, granted(perms)] as const)
        .filter(([, perms]) => hasAccess(perms)),
    ),
  }
}
