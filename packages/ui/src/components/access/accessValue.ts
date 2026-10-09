export interface AccessPermission {
  key: string
  label: string
  description?: string
  /** The type of resource it applies to; the grant picker groups permissions by it. */
  category?: string
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

export interface Holder {
  subject: AccessSubject
  /** The higher permission it comes with, when the subject wasn't granted it directly. */
  via: string | null
}

const NONE: Record<string, boolean> = {}

export function grants(value: AccessValue, subject: AccessSubject): Record<string, boolean> {
  return (subject === null ? value.organization : value.groups[subject]) ?? NONE
}

export function hasAccess(perms: Record<string, boolean>): boolean {
  return Object.values(perms).some(Boolean)
}

function viaHigher(
  perms: Record<string, boolean>,
  key: string,
  implied: ImpliedPermissions,
): string | null {
  return (implied[key] ?? []).find((higher) => perms[higher]) ?? null
}

/** Who has each permission, directly or through one that includes it: the organization first, then groups A–Z. */
export function holdersByPermission(
  value: AccessValue,
  permissions: readonly AccessPermission[],
  implied: ImpliedPermissions,
): Map<string, Holder[]> {
  const subjects: AccessSubject[] = [
    null,
    ...Object.keys(value.groups).sort((a, b) => a.localeCompare(b)),
  ]
  const result = new Map<string, Holder[]>()
  for (const { key } of permissions) {
    const holders: Holder[] = []
    for (const subject of subjects) {
      const perms = grants(value, subject)
      if (perms[key]) {
        holders.push({ subject, via: null })
        continue
      }
      const via = viaHigher(perms, key, implied)
      if (via !== null) {
        holders.push({ subject, via })
      }
    }
    if (holders.length > 0) {
      result.set(key, holders)
    }
  }
  return result
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

export function grant(
  value: AccessValue,
  subjects: readonly AccessSubject[],
  keys: readonly string[],
): AccessValue {
  let next = value
  for (const subject of subjects) {
    const perms = { ...grants(next, subject) }
    for (const key of keys) {
      perms[key] = true
    }
    next = withGrants(next, subject, perms)
  }
  return next
}

export function revoke(value: AccessValue, subject: AccessSubject, key: string): AccessValue {
  const { [key]: _removed, ...rest } = grants(value, subject)
  return withGrants(value, subject, rest)
}

/** How many of the subject/permission pairs are already granted directly. */
export function alreadyGranted(
  value: AccessValue,
  subjects: readonly AccessSubject[],
  keys: readonly string[],
): number {
  let count = 0
  for (const subject of subjects) {
    const perms = grants(value, subject)
    for (const key of keys) {
      if (perms[key]) {
        count++
      }
    }
  }
  return count
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
