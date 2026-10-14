import type { ReactNode } from 'react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '../../cx'
import { AddIcon, ChevronRightIcon, SearchIcon, TrashIcon, UsersIcon } from '../../icons'
import { Button } from '../Button'
import { ConfirmModal } from '../ConfirmModal'
import { Drawer } from '../Drawer'
import { EmptyState } from '../EmptyState'
import { Input } from '../Input'
import { positionKeys } from '../keys'
import { useStrings } from '../Provider'
import {
  type AccessGroup,
  type AccessPermission,
  type AccessSubject,
  type AccessValue,
  grant,
  type Holder,
  holdersByPermission,
  type ImpliedPermissions,
  normalize,
  revoke,
  ungranted,
} from './accessValue'
import { GrantAccessDrawer } from './GrantAccessDrawer'

export interface AccessDrawerProps {
  open: boolean
  onClose: () => void
  title?: string | undefined
  /** Names what is being shared, e.g. the resource's kind and name. */
  description?: ReactNode
  /** Give each a `category` (the type of resource) once there are more than a handful. */
  permissions: readonly AccessPermission[]
  implied?: ImpliedPermissions | undefined
  groups: readonly AccessGroup[]
  /** The current grants; `undefined` while they load. */
  value: AccessValue | undefined
  loading?: boolean | undefined
  /** Replaces the list, e.g. when the grants failed to load; the host renders its own message. */
  error?: ReactNode
  /** `false` leaves the organization out; a `disabledReason` keeps it from being granted. */
  organization?: false | { disabledReason?: ReactNode } | undefined
  readOnly?: boolean | undefined
  /** Host content above the list, such as a setting that isn't a group grant. */
  extra?: ReactNode
  /** Offered when no one has access yet, e.g. a link to create a group. */
  emptyAction?: ReactNode
  /** Asks before every save, for resources where a change takes effect on running work. */
  confirmSave?: { title: string; description?: ReactNode } | undefined
  defaultQuery?: string | undefined
  /**
   * Each grant, removal and undo saves straight away with the full replacement value.
   * Reject to leave the shown grants as they were; report the error yourself.
   */
  onSave: (next: AccessValue) => Promise<void>
  width?: number | undefined
}

const NO_IMPLIED: ImpliedPermissions = {}
const EMPTY: AccessValue = { organization: {}, groups: {} }
const ORGANIZATION: { disabledReason?: ReactNode } = {}

function shown(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false
}

/**
 * Runs on the grants as they are when the save starts, not when it was asked for, so a
 * refetch that lands while a confirmation is open isn't overwritten. `undo` reverses just
 * this change, keeping edits others made since.
 */
type Change = (value: AccessValue) => { next: AccessValue; undo?: Change }

interface PendingSave {
  change: Change
  notice: string
  onDone?: () => void
}

export function AccessDrawer({
  open,
  onClose,
  title,
  description,
  permissions,
  implied = NO_IMPLIED,
  groups,
  value,
  loading = false,
  error,
  organization = ORGANIZATION,
  readOnly = false,
  extra,
  emptyAction,
  confirmSave,
  defaultQuery = '',
  onSave,
  width,
}: AccessDrawerProps) {
  const { access: strings, common } = useStrings()
  const [current, setCurrent] = useState(value)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ text: string; undo?: Change } | null>(null)
  const [query, setQuery] = useState(defaultQuery)
  const deferredQuery = useDeferredValue(query)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [removing, setRemoving] = useState<{ subject: AccessSubject; key: string } | null>(null)
  const [granting, setGranting] = useState(false)
  const [pending, setPending] = useState<PendingSave | null>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)
  const refetched = useRef<{ value: AccessValue | undefined } | null>(null)
  const refocusFilter = useRef(false)

  // A refetch that lands mid-save may predate it, so it waits: the saved grants replace it
  // when the save succeeds, and it shows when the save fails.
  useEffect(() => {
    if (savingRef.current) {
      refetched.current = { value }
    } else {
      setCurrent(value)
    }
  }, [value])

  useEffect(() => {
    if (open) {
      setNotice(null)
      setExpanded(new Set())
    } else {
      setGranting(false)
      setPending(null)
      setRemoving(null)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery(defaultQuery)
    }
  }, [open, defaultQuery])

  const ready = !loading && error === undefined && current !== undefined

  // An effect, not a ref callback: the modal records where focus returns in its own
  // effect, which runs first.
  useEffect(() => {
    if (open && ready) {
      filterRef.current?.focus()
    }
  }, [open, ready])

  const labelOf = (subject: AccessSubject) => subject ?? strings.organization
  const byKey = useMemo(() => new Map(permissions.map((p) => [p.key, p])), [permissions])
  const holders = useMemo(
    () => holdersByPermission(current ?? EMPTY, permissions, implied),
    [current, permissions, implied],
  )

  // A save can take away the row that had focus; keep focus in the drawer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: new rows are the trigger, not an input
  useEffect(() => {
    if (refocusFilter.current) {
      refocusFilter.current = false
      // The drawer's focus manager may already have caught the lost focus on its panel.
      const active = document.activeElement
      if (!active || active === document.body || active.getAttribute('role') === 'dialog') {
        filterRef.current?.focus()
      }
    }
  }, [holders])

  const sections = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    const result: {
      name: string | null
      granted: number
      rows: { permission: AccessPermission; holders: Holder[]; matchedHolder: boolean }[]
    }[] = []
    for (const permission of permissions) {
      const list = holders.get(permission.key)
      if (!list) {
        continue
      }
      const name = permission.category ?? null
      let section = result.find((s) => s.name === name)
      if (!section) {
        section = { name, granted: 0, rows: [] }
        result.push(section)
      }
      section.granted++
      const matchedPermission =
        permission.label.toLowerCase().includes(needle) ||
        permission.key.toLowerCase().includes(needle)
      const matchedHolder =
        needle !== '' &&
        list.some((h) => (h.subject ?? strings.organization).toLowerCase().includes(needle))
      if (!needle || matchedPermission || matchedHolder) {
        section.rows.push({ permission, holders: list, matchedHolder })
      }
    }
    return result.filter((s) => s.rows.length > 0)
  }, [permissions, holders, deferredQuery, strings])

  const save = async ({ change, notice: text, onDone }: PendingSave) => {
    const { next, undo } = change(current ?? EMPTY)
    savingRef.current = true
    setSaving(true)
    try {
      await onSave(normalize(next))
      setCurrent(next)
      setNotice(undo ? { text, undo } : { text })
      refocusFilter.current = true
      onDone?.()
    } catch {
      // The host reports the failure; the shown grants stay as they were.
      if (refetched.current) {
        setCurrent(refetched.current.value)
      }
    } finally {
      refetched.current = null
      savingRef.current = false
      setSaving(false)
    }
  }

  const request = (change: PendingSave) => {
    setRemoving(null)
    if (confirmSave) {
      setPending(change)
    } else {
      void save(change)
    }
  }

  // Undo grants again, so it isn't offered where a grant to the organization isn't allowed.
  const canGrantOrganization = organization !== false && !organization.disabledReason

  const removeHolder = (subject: AccessSubject, permission: AccessPermission) =>
    request({
      change: (base) => {
        const next = revoke(base, subject, permission.key)
        if (subject === null && !canGrantOrganization) {
          return { next }
        }
        return { next, undo: (v) => ({ next: grant(v, [subject], [permission.key]) }) }
      },
      notice: strings.removed(labelOf(subject), permission.label),
    })

  const toolbar = (
    <div className="flex flex-col gap-3">
      {extra}
      {ready && (
        <div className="flex flex-wrap items-center gap-2.5">
          {!readOnly && (
            <Button
              variant="primary"
              icon={<AddIcon aria-hidden="true" />}
              onClick={() => setGranting(true)}
              disabled={saving}
            >
              {strings.grantAccess}
            </Button>
          )}
          <div className="relative flex min-w-48 flex-1 items-center">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute start-2.5 z-[1] h-3.5 w-3.5 text-(--theme-muted-text-color)"
            />
            <Input
              ref={filterRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={strings.filter}
              aria-label={strings.filter}
              className="ps-8"
            />
          </div>
          <span className="shrink-0 text-[13px] text-(--theme-muted-text-color)">
            {strings.grantedSummary(holders.size, permissions.length)}
          </span>
          {/* Mounted before any notice: screen readers skip a live region added with its text. */}
          <p role="status" className="sr-only">
            {notice?.text}
          </p>
        </div>
      )}
    </div>
  )

  const footer = notice ? (
    <div className="flex w-full items-center gap-2">
      <p className="min-w-0 flex-1 text-[13px]">{notice.text}</p>
      {notice.undo && !readOnly && (
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => notice.undo && request({ change: notice.undo, notice: strings.undone })}
          className="text-(--theme-link)"
        >
          {common.undo}
        </Button>
      )}
      <Button variant="ghost" onClick={() => setNotice(null)}>
        {common.dismiss}
      </Button>
    </div>
  ) : undefined

  const grantedNothing = holders.size === 0
  const blocked = granting || saving || pending !== null

  return (
    <>
      <Drawer
        open={open}
        // The header's close button ignores `dismissible`, so the drawer holds itself open too.
        onClose={() => {
          if (!blocked) {
            onClose()
          }
        }}
        title={title ?? strings.title}
        description={description}
        footer={footer}
        dismissible={!blocked}
        padded={false}
        width={width ?? 640}
      >
        {(shown(extra) || ready) && (
          <div className="shrink-0 border-b border-(--theme-border) px-4 py-3">{toolbar}</div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading || (error === undefined && current === undefined) ? (
            <RowsSkeleton />
          ) : error !== undefined ? (
            <div className="px-4 py-5">{error}</div>
          ) : grantedNothing ? (
            <div className="p-4">
              <EmptyState
                variant="bare"
                title={strings.noGrants}
                {...(readOnly ? {} : { description: strings.noGrantsHint })}
                action={emptyAction}
              />
            </div>
          ) : sections.length === 0 ? (
            <EmptyState
              variant="bare"
              title={strings.noMatches(deferredQuery.trim())}
              description={strings.noMatchesHint}
              action={
                <Button variant="outline" onClick={() => setQuery('')}>
                  {strings.clearFilter}
                </Button>
              }
            />
          ) : (
            sections.map((section) => (
              <section key={section.name ?? ''} aria-label={section.name ?? strings.title}>
                {section.name !== null && (
                  <h3 className="sticky top-0 z-[1] flex gap-2 border-b border-(--theme-border) bg-(--theme-muted-panel-bg) px-4 py-2 text-[13px] font-semibold">
                    <span className="flex-1">{section.name}</span>
                    <span className="font-medium text-(--theme-muted-text-color)">
                      {strings.categoryGranted(section.granted)}
                    </span>
                  </h3>
                )}
                <ul>
                  {section.rows.map(({ permission, holders: list, matchedHolder }) => (
                    <PermissionRow
                      key={permission.key}
                      permission={permission}
                      holders={list}
                      expanded={expanded.has(permission.key) || matchedHolder}
                      onToggle={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev)
                          if (next.has(permission.key)) {
                            next.delete(permission.key)
                          } else {
                            next.add(permission.key)
                          }
                          return next
                        })
                      }
                      labelOf={labelOf}
                      labelOfPermission={(key) => byKey.get(key)?.label ?? key}
                      readOnly={readOnly}
                      saving={saving}
                      removing={removing?.key === permission.key ? removing.subject : undefined}
                      onAskRemove={(subject) =>
                        confirmSave
                          ? removeHolder(subject, permission)
                          : setRemoving({ subject, key: permission.key })
                      }
                      onCancelRemove={() => setRemoving(null)}
                      onRemove={(subject) => removeHolder(subject, permission)}
                      focusFilter={() => filterRef.current?.focus()}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </Drawer>
      {granting && current !== undefined && (
        <GrantAccessDrawer
          open={open}
          onClose={() => setGranting(false)}
          description={description}
          permissions={permissions}
          groups={groups}
          organization={organization}
          value={current}
          saving={saving}
          preventClose={pending !== null}
          width={width ?? 640}
          onGrant={(subjects, keys) =>
            request({
              change: (base) => {
                const added = ungranted(base, subjects, keys)
                return {
                  next: grant(base, subjects, keys),
                  undo: (v) => ({
                    next: added.reduce((acc, [subject, key]) => revoke(acc, subject, key), v),
                  }),
                }
              },
              notice: strings.granted(
                keys.length,
                subjects.length === 1 && subjects[0] !== undefined
                  ? labelOf(subjects[0])
                  : strings.groupCount(subjects.length),
              ),
              onDone: () => {
                setGranting(false)
                setExpanded((prev) => new Set([...prev, ...keys]))
              },
            })
          }
        />
      )}
      {confirmSave && (
        <ConfirmModal
          open={open && pending !== null}
          onClose={() => setPending(null)}
          title={confirmSave.title}
          description={confirmSave.description}
          confirmLabel={common.save}
          onConfirm={async () => {
            if (pending) {
              await save(pending)
            }
          }}
        />
      )}
    </>
  )
}

function PermissionRow({
  permission,
  holders,
  expanded,
  onToggle,
  labelOf,
  labelOfPermission,
  readOnly,
  saving,
  removing,
  onAskRemove,
  onCancelRemove,
  onRemove,
  focusFilter,
}: {
  permission: AccessPermission
  holders: readonly Holder[]
  expanded: boolean
  onToggle: () => void
  labelOf: (subject: AccessSubject) => string
  labelOfPermission: (key: string) => string
  readOnly: boolean
  saving: boolean
  /** The holder whose removal is being confirmed, if it's in this row. */
  removing: AccessSubject | undefined
  onAskRemove: (subject: AccessSubject) => void
  onCancelRemove: () => void
  onRemove: (subject: AccessSubject) => void
  /** Moves focus somewhere that outlives this row. */
  focusFilter: () => void
}) {
  const { access: strings, common } = useStrings()
  const toggleRef = useRef<HTMLButtonElement>(null)
  // The holder whose Remove button takes focus back from a cancelled confirmation.
  const refocus = useRef<AccessSubject | undefined>(undefined)
  const names = holders.map((h) => (h.subject === null ? strings.everyone : h.subject))
  const preview =
    names.slice(0, 2).join(', ') + (names.length > 2 ? ` ${strings.more(names.length - 2)}` : '')
  return (
    <li className="border-b border-(--theme-border)">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-h-13 w-full cursor-pointer items-center gap-2.5 px-4 py-1.5 text-start hover:bg-(--theme-hover)"
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cx(
            'h-3.5 w-3.5 shrink-0 text-(--theme-muted-text-color) transition-transform duration-150 ease-out motion-reduce:transition-none',
            expanded && 'rotate-90',
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm">
            <span className="font-medium">{permission.label}</span>{' '}
            <span className="text-(--theme-muted-text-color)">
              {strings.holderCount(holders.length)}
            </span>
          </span>
          <span className="truncate font-mono text-[11px] text-(--theme-muted-text-color)">
            {permission.key}
          </span>
        </span>
        <span className="hidden max-w-52 shrink truncate text-xs text-(--theme-muted-text-color) sm:block">
          {preview}
        </span>
      </button>
      {expanded && (
        <ul aria-label={strings.holdersOf(permission.label)} className="pb-2">
          {holders.map((holder) => {
            const name = labelOf(holder.subject)
            const confirming = removing !== undefined && removing === holder.subject
            return (
              <li
                key={holder.subject ?? ''}
                className="flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1 py-1 ps-10 pe-4"
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--theme-muted-panel-bg) text-[11px] font-semibold text-(--theme-muted-text-color)"
                >
                  {holder.subject === null ? (
                    <UsersIcon className="h-3 w-3" />
                  ) : (
                    holder.subject.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="flex min-w-40 flex-1 flex-col">
                  <span
                    className={cx(
                      'truncate text-[13px]',
                      holder.subject === null ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {name}
                  </span>
                  <span className="text-xs text-(--theme-muted-text-color)">
                    {holder.via !== null
                      ? strings.includedBy(labelOfPermission(holder.via))
                      : holder.subject === null
                        ? strings.organizationMeta
                        : null}
                  </span>
                </span>
                {!readOnly && holder.via === null && confirming && (
                  <ConfirmRemove
                    saving={saving}
                    onCancel={() => {
                      refocus.current = holder.subject
                      onCancelRemove()
                    }}
                    onRemove={() => {
                      // Focus moves before the save so it never sits on a node about to unmount:
                      // removing the only holder takes the whole row away.
                      if (holders.length === 1) {
                        focusFilter()
                      } else {
                        toggleRef.current?.focus()
                      }
                      onRemove(holder.subject)
                    }}
                  />
                )}
                {!readOnly && holder.via === null && !confirming && (
                  <Button
                    ref={(button: HTMLButtonElement | null) => {
                      if (button && refocus.current === holder.subject) {
                        refocus.current = undefined
                        button.focus()
                      }
                    }}
                    variant="ghost"
                    size="sm"
                    icon={<TrashIcon aria-hidden="true" />}
                    onClick={() => onAskRemove(holder.subject)}
                    disabled={saving}
                    aria-label={strings.removeFrom(name, permission.label)}
                  >
                    {common.remove}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

function ConfirmRemove({
  saving,
  onCancel,
  onRemove,
}: {
  saving: boolean
  onCancel: () => void
  onRemove: () => void
}) {
  const { access: strings, common } = useStrings()
  const cancelRef = useRef<HTMLButtonElement>(null)
  // It replaces the focused Remove button, so focus would otherwise fall out of the drawer.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs text-(--theme-muted-text-color)">{strings.confirmRemove}</span>
      <Button ref={cancelRef} variant="ghost" size="sm" onClick={onCancel}>
        {common.cancel}
      </Button>
      <Button variant="danger" size="sm" onClick={onRemove} disabled={saving}>
        {common.remove}
      </Button>
    </span>
  )
}

function RowsSkeleton() {
  const { loading } = useStrings().common
  return (
    <div role="status" aria-label={loading}>
      {positionKeys(6, 'access-skeleton').map((key) => (
        <div
          key={key}
          aria-hidden="true"
          className="flex items-center gap-3 border-b border-(--theme-border) px-4 py-3.5 motion-safe:animate-pulse"
        >
          <div className="h-3.5 w-3.5 rounded bg-(--theme-muted-panel-bg)" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-44 rounded bg-(--theme-muted-panel-bg)" />
            <div className="h-2.5 w-28 rounded bg-(--theme-muted-panel-bg)" />
          </div>
          <div className="h-3 w-32 rounded bg-(--theme-muted-panel-bg)" />
        </div>
      ))}
      <span className="sr-only">{loading}</span>
    </div>
  )
}
