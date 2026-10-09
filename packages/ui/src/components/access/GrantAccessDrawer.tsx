import cx from 'classnames'
import type { ReactNode, Ref } from 'react'
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { SearchIcon, XIcon } from '../../icons'
import { Drawer } from '../Drawer'
import { ghostButtonClasses, primaryButtonClasses } from '../ghostButton'
import { useStrings } from '../Provider'
import {
  type AccessGroup,
  type AccessPermission,
  type AccessSubject,
  type AccessValue,
  alreadyGranted,
} from './accessValue'

export interface GrantAccessDrawerProps {
  open: boolean
  onClose: () => void
  description?: ReactNode
  permissions: readonly AccessPermission[]
  groups: readonly AccessGroup[]
  organization: false | { disabledReason?: ReactNode }
  value: AccessValue
  saving: boolean
  /** Holds the drawer open while a confirmation sits on top of it. */
  preventClose: boolean
  onGrant: (subjects: AccessSubject[], keys: string[]) => void
  width?: number | undefined
}

const ALL = '\u0000all'

const checkboxClasses = 'h-[15px] w-[15px] shrink-0 [accent-color:var(--theme-element)]'
const boxClasses =
  'overflow-hidden rounded-lg border border-(--theme-border) bg-(--theme-muted-panel-bg)'
const optionClasses =
  'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-(--theme-hover) has-[:disabled]:cursor-not-allowed'

function toggled<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

export function GrantAccessDrawer({
  open,
  onClose,
  description,
  permissions,
  groups,
  organization,
  value,
  saving,
  preventClose,
  onGrant,
  width,
}: GrantAccessDrawerProps) {
  const strings = useStrings().access
  const [subjects, setSubjects] = useState<AccessSubject[]>([])
  const [keys, setKeys] = useState<string[]>([])
  const [groupQuery, setGroupQuery] = useState('')
  const [permissionQuery, setPermissionQuery] = useState('')
  const [tab, setTab] = useState(ALL)
  const groupSearch = useRef<HTMLInputElement>(null)
  const id = useId()
  const deferredGroupQuery = useDeferredValue(groupQuery)
  const deferredPermissionQuery = useDeferredValue(permissionQuery)

  useEffect(() => {
    if (open) {
      setSubjects([])
      setKeys([])
      setGroupQuery('')
      setPermissionQuery('')
      setTab(ALL)
    }
  }, [open])

  // An effect, not a ref callback: the modal records where focus returns in its own
  // effect, which runs first.
  useEffect(() => {
    if (open) {
      groupSearch.current?.focus()
    }
  }, [open])

  const label = (subject: AccessSubject) => subject ?? strings.organization
  const byKey = useMemo(() => new Map(permissions.map((p) => [p.key, p])), [permissions])
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups],
  )
  const groupOptions = useMemo(() => {
    const needle = deferredGroupQuery.trim().toLowerCase()
    const options: { subject: AccessSubject; meta: ReactNode; disabledReason?: ReactNode }[] = []
    if (organization !== false && strings.organization.toLowerCase().includes(needle)) {
      options.push({
        subject: null,
        meta: organization.disabledReason || strings.organizationMeta,
        ...(organization.disabledReason ? { disabledReason: organization.disabledReason } : {}),
      })
    }
    for (const group of sortedGroups) {
      if (!needle || group.name.toLowerCase().includes(needle)) {
        options.push({
          subject: group.name,
          meta: group.members === undefined ? null : strings.members(group.members),
        })
      }
    }
    return options
  }, [deferredGroupQuery, organization, sortedGroups, strings])

  const categories = useMemo(() => {
    const names: string[] = []
    for (const p of permissions) {
      const name = p.category ?? strings.otherType
      if (!names.includes(name)) {
        names.push(name)
      }
    }
    return permissions.some((p) => p.category !== undefined) ? names : []
  }, [permissions, strings])

  const needle = deferredPermissionQuery.trim().toLowerCase()
  const permissionOptions = permissions.filter((p) => {
    if (needle) {
      return p.label.toLowerCase().includes(needle) || p.key.toLowerCase().includes(needle)
    }
    return tab === ALL || (p.category ?? strings.otherType) === tab
  })
  const showCategory = categories.length > 0 && (needle !== '' || tab === ALL)

  const already = alreadyGranted(value, subjects, keys)
  const summary =
    subjects.length && keys.length
      ? strings.grantSummary(keys.length, subjects.length, already)
      : subjects.length
        ? strings.pickPermissions(subjects.length)
        : keys.length
          ? strings.pickGroups(keys.length)
          : strings.pickBoth

  const footer = (
    <div className="flex items-center gap-2">
      <p aria-live="polite" className="min-w-0 flex-1 text-[13px] text-(--theme-muted-text-color)">
        {summary}
      </p>
      <button type="button" onClick={onClose} disabled={saving} className={ghostButtonClasses}>
        {strings.cancel}
      </button>
      <button
        type="button"
        onClick={() => onGrant(subjects, keys)}
        disabled={saving || !subjects.length || !keys.length}
        className={cx(
          primaryButtonClasses,
          'h-8 px-3 disabled:cursor-not-allowed disabled:opacity-50',
          saving && 'cursor-wait',
        )}
      >
        {saving ? strings.saving : strings.save}
      </button>
    </div>
  )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={strings.grantAccess}
      description={description}
      footer={footer}
      preventClose={preventClose || saving}
      width={width}
    >
      <div className="flex flex-col gap-6 px-6 py-5">
        <section aria-labelledby={`${id}-groups`} className="flex flex-col gap-2">
          <div>
            <h3 id={`${id}-groups`} className="text-sm font-semibold">
              {strings.groupsLabel}
            </h3>
            <p className="text-[13px] text-(--theme-muted-text-color)">{strings.groupsHint}</p>
          </div>
          <Chips
            label={strings.selectedGroups}
            items={subjects.map((s) => ({
              id: s ?? '',
              label: label(s),
              onRemove: () => setSubjects(toggled(subjects, s)),
            }))}
          />
          <div className={boxClasses}>
            <SearchField
              inputRef={groupSearch}
              value={groupQuery}
              onChange={setGroupQuery}
              placeholder={strings.searchGroups(groups.length)}
            />
            <ul className="max-h-44 overflow-y-auto py-1">
              {groupOptions.map((option) => (
                <li key={option.subject ?? ''}>
                  <label className={optionClasses}>
                    <input
                      type="checkbox"
                      className={checkboxClasses}
                      checked={subjects.includes(option.subject)}
                      disabled={Boolean(option.disabledReason)}
                      onChange={() => setSubjects(toggled(subjects, option.subject))}
                    />
                    {option.subject === null ? (
                      // The organization's note can be long (a host's reason), so it goes under the name.
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[13px] font-semibold">{label(option.subject)}</span>
                        <span className="text-xs text-(--theme-muted-text-color)">
                          {option.meta}
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {label(option.subject)}
                        </span>
                        <span className="shrink-0 text-xs text-(--theme-muted-text-color)">
                          {option.meta}
                        </span>
                      </>
                    )}
                  </label>
                </li>
              ))}
            </ul>
            {groupOptions.length === 0 && (
              <p className="px-3 py-3 text-[13px] text-(--theme-muted-text-color)">
                {groups.length === 0
                  ? strings.noGroups
                  : strings.noGroupsMatch(deferredGroupQuery.trim())}
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby={`${id}-permissions`} className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <h3 id={`${id}-permissions`} className="text-sm font-semibold">
                {strings.permissionsLabel}
              </h3>
              <p className="text-[13px] text-(--theme-muted-text-color)">
                {strings.permissionsHint}
              </p>
            </div>
            {keys.length > 0 && (
              <span className="text-xs text-(--theme-muted-text-color)">
                {strings.selectedCount(keys.length)}
              </span>
            )}
          </div>
          <Chips
            label={strings.selectedPermissions}
            items={keys.map((key) => ({
              id: key,
              label: byKey.get(key)?.label ?? key,
              onRemove: () => setKeys(toggled(keys, key)),
            }))}
          />
          <div className={boxClasses}>
            <SearchField
              value={permissionQuery}
              onChange={setPermissionQuery}
              placeholder={strings.searchPermissions(permissions.length)}
            />
            <div className="flex flex-col sm:h-72 sm:flex-row">
              {categories.length > 0 && (
                <nav
                  aria-label={strings.resourceTypes}
                  className="flex shrink-0 gap-1 overflow-x-auto border-b border-(--theme-border) bg-(--theme-app-bg) p-1 sm:w-44 sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0"
                >
                  {[ALL, ...categories].map((name) => {
                    const inTab = permissions.filter(
                      (p) => name === ALL || (p.category ?? strings.otherType) === name,
                    )
                    const picked = inTab.filter((p) => keys.includes(p.key)).length
                    const current = !needle && tab === name
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-current={current || undefined}
                        onClick={() => {
                          setTab(name)
                          setPermissionQuery('')
                        }}
                        className={cx(
                          'flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[13px] whitespace-nowrap',
                          current
                            ? 'bg-[color-mix(in_srgb,var(--theme-element)_14%,transparent)] font-semibold'
                            : 'hover:bg-(--theme-hover)',
                        )}
                      >
                        <span className="flex-1">{name === ALL ? strings.allTypes : name}</span>
                        <span
                          className={cx(
                            'text-[11px]',
                            picked
                              ? 'rounded-full bg-[color-mix(in_srgb,var(--theme-element)_14%,transparent)] px-1.5 font-semibold'
                              : 'text-(--theme-muted-text-color)',
                          )}
                        >
                          {picked ? `${picked}/${inTab.length}` : inTab.length}
                        </span>
                      </button>
                    )
                  })}
                </nav>
              )}
              <ul className="max-h-72 min-w-0 flex-1 overflow-y-auto py-1 sm:max-h-none">
                {permissionOptions.map((p) => (
                  <li key={p.key}>
                    <label className={optionClasses} title={p.description}>
                      <input
                        type="checkbox"
                        className={checkboxClasses}
                        checked={keys.includes(p.key)}
                        onChange={() => setKeys(toggled(keys, p.key))}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[13px]">{p.label}</span>
                        <span className="truncate font-mono text-[11px] text-(--theme-muted-text-color)">
                          {p.key}
                        </span>
                      </span>
                      {showCategory && p.category !== undefined && (
                        <span className="shrink-0 text-[11px] text-(--theme-muted-text-color)">
                          {p.category}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
                {permissionOptions.length === 0 && (
                  <li className="px-3 py-3 text-[13px] text-(--theme-muted-text-color)">
                    {strings.noPermissionsMatch(deferredPermissionQuery.trim())}
                  </li>
                )}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </Drawer>
  )
}

function SearchField({
  value,
  onChange,
  placeholder,
  inputRef,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  inputRef?: Ref<HTMLInputElement>
}) {
  return (
    <label className="relative flex items-center border-b border-(--theme-border)">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3 h-3 w-3 text-(--theme-muted-text-color)"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full bg-transparent pr-3 pl-8 text-[13px] text-(--theme-input) placeholder:text-(--theme-muted-text-color) focus:outline-none"
      />
    </label>
  )
}

export function Chips({
  label,
  items,
}: {
  label: string
  items: readonly { id: string; label: string; onRemove?: () => void }[]
}) {
  const strings = useStrings().access
  if (items.length === 0) {
    return null
  }
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex h-[26px] items-center gap-1 rounded-full border border-(--theme-element) bg-[color-mix(in_srgb,var(--theme-element)_14%,transparent)] pr-1.5 pl-2.5 text-xs font-medium"
        >
          <span>{item.label}</span>
          {item.onRemove && (
            <button
              type="button"
              onClick={item.onRemove}
              aria-label={strings.removeChip(item.label)}
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-(--theme-muted-text-color) hover:bg-(--theme-hover) hover:text-(--theme-app)"
            >
              <XIcon className="h-2.5 w-2.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
