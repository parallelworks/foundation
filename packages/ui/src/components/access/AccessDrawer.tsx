import cx from 'classnames'
import type { ReactNode } from 'react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AddIcon, ChevronRightIcon, SearchIcon, TrashIcon, UsersIcon } from '../../icons'
import { ConfirmModal } from '../ConfirmModal'
import { Drawer } from '../Drawer'
import EmptyState from '../EmptyState'
import { dangerButtonClasses, ghostButtonClasses, primaryButtonClasses } from '../ghostButton'
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

interface PendingSave {
  next: AccessValue
  notice: string
  undoable: boolean
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
  organization = {},
  readOnly = false,
  extra,
  emptyAction,
  confirmSave,
  defaultQuery = '',
  onSave,
  width,
}: AccessDrawerProps) {
  const strings = useStrings().access
  const [current, setCurrent] = useState(value)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ text: string; previous?: AccessValue } | null>(null)
  const [query, setQuery] = useState(defaultQuery)
  const deferredQuery = useDeferredValue(query)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [removing, setRemoving] = useState<{ subject: AccessSubject; key: string } | null>(null)
  const [granting, setGranting] = useState(false)
  const [pending, setPending] = useState<PendingSave | null>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)

  // While a save is in flight the shown grants are the ones being saved; a refetch that
  // lands mid-save would briefly show the old grants again.
  useEffect(() => {
    if (!savingRef.current) {
      setCurrent(value)
    }
  }, [value])

  useEffect(() => {
    if (open) {
      setQuery(defaultQuery)
      setNotice(null)
      setExpanded(new Set())
    } else {
      setGranting(false)
      setPending(null)
      setRemoving(null)
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

  const save = async ({ next, notice: text, undoable, onDone }: PendingSave) => {
    const previous = current
    savingRef.current = true
    setSaving(true)
    try {
      await onSave(normalize(next))
      setCurrent(next)
      setNotice(undoable && previous ? { text, previous } : { text })
      onDone?.()
    } catch {
      // The host reports the failure; the shown grants stay as they were.
    } finally {
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

  const removeHolder = (subject: AccessSubject, permission: AccessPermission) =>
    request({
      next: revoke(current ?? EMPTY, subject, permission.key),
      notice: strings.removed(labelOf(subject), permission.label),
      undoable: true,
    })

  const toolbar = (
    <div className="flex flex-col gap-3">
      {extra}
      {ready && (
        <div className="flex flex-wrap items-center gap-2.5">
          {!readOnly && (
            <button
              type="button"
              onClick={() => setGranting(true)}
              disabled={saving}
              className={cx(
                primaryButtonClasses,
                'h-9 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <AddIcon aria-hidden="true" className="h-3 w-3" />
              {strings.grantAccess}
            </button>
          )}
          <label className="relative flex min-w-48 flex-1 items-center">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-(--theme-muted-text-color)"
            />
            <input
              ref={filterRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={strings.filter}
              aria-label={strings.filter}
              className="h-9 w-full rounded-md border border-(--theme-border) bg-(--theme-input-bg) pr-3 pl-9 text-sm text-(--theme-input) placeholder:text-(--theme-muted-text-color) focus:border-(--theme-element) focus:outline-none"
            />
          </label>
          <span className="shrink-0 text-[13px] text-(--theme-muted-text-color)">
            {strings.grantedSummary(holders.size, permissions.length)}
          </span>
        </div>
      )}
    </div>
  )

  const footer = notice ? (
    <div role="status" className="flex items-center gap-2">
      <p className="min-w-0 flex-1 text-[13px]">{notice.text}</p>
      {notice.previous && !readOnly && (
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            notice.previous &&
            request({ next: notice.previous, notice: strings.undone, undoable: false })
          }
          className={cx(ghostButtonClasses, 'font-medium text-(--theme-link)')}
        >
          {strings.undo}
        </button>
      )}
      <button type="button" onClick={() => setNotice(null)} className={ghostButtonClasses}>
        {strings.dismiss}
      </button>
    </div>
  ) : undefined

  const grantedNothing = holders.size === 0

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={title ?? strings.title}
        description={description}
        toolbar={extra !== undefined || ready ? toolbar : undefined}
        footer={footer}
        preventClose={granting || saving || pending !== null}
        width={width}
      >
        {loading || (error === undefined && current === undefined) ? (
          <RowsSkeleton />
        ) : error !== undefined ? (
          <div className="px-6 py-5">{error}</div>
        ) : grantedNothing ? (
          <div className="p-6">
            <EmptyState
              title={strings.noGrants}
              description={strings.noGrantsHint}
              action={emptyAction}
            />
          </div>
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="font-medium">{strings.noMatches(deferredQuery.trim())}</p>
            <p className="text-[13px] text-(--theme-muted-text-color)">{strings.noMatchesHint}</p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className={cx(ghostButtonClasses, 'mt-2 border border-(--theme-border)')}
            >
              {strings.clearFilter}
            </button>
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.name ?? ''} aria-label={section.name ?? strings.title}>
              {section.name !== null && (
                <h3 className="sticky top-0 z-[1] flex gap-2 border-b border-(--theme-border) bg-(--theme-muted-panel-bg) px-6 py-2 text-[13px] font-semibold">
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
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </Drawer>
      {current !== undefined && (
        <GrantAccessDrawer
          open={open && granting}
          onClose={() => setGranting(false)}
          description={description}
          permissions={permissions}
          groups={groups}
          organization={organization}
          value={current}
          saving={saving}
          preventClose={pending !== null}
          width={width}
          onGrant={(subjects, keys) =>
            request({
              next: grant(current, subjects, keys),
              notice: strings.granted(
                keys.length,
                subjects.length === 1 && subjects[0] !== undefined
                  ? labelOf(subjects[0])
                  : strings.groupCount(subjects.length),
              ),
              undoable: true,
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
          confirmLabel={strings.save}
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
}) {
  const strings = useStrings().access
  const names = holders.map((h) => (h.subject === null ? strings.everyone : h.subject))
  const preview =
    names.slice(0, 2).join(', ') + (names.length > 2 ? ` ${strings.more(names.length - 2)}` : '')
  return (
    <li className="border-b border-(--theme-border)">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-h-13 w-full cursor-pointer items-center gap-2.5 px-6 py-1.5 text-left hover:bg-(--theme-hover)"
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
                className="flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1 py-1 pr-6 pl-12"
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
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-(--theme-muted-text-color)">
                      {strings.confirmRemove}
                    </span>
                    <button
                      type="button"
                      onClick={onCancelRemove}
                      className={cx(ghostButtonClasses, 'h-7 px-2 text-xs')}
                    >
                      {strings.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(holder.subject)}
                      disabled={saving}
                      className={cx(dangerButtonClasses, 'disabled:opacity-50')}
                    >
                      {strings.remove}
                    </button>
                  </span>
                )}
                {!readOnly && holder.via === null && !confirming && (
                  <button
                    type="button"
                    onClick={() => onAskRemove(holder.subject)}
                    disabled={saving}
                    aria-label={strings.removeFrom(name, permission.label)}
                    className={cx(
                      ghostButtonClasses,
                      'h-7 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    <TrashIcon aria-hidden="true" className="h-3 w-3" />
                    {strings.remove}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

function RowsSkeleton() {
  const { loading } = useStrings()
  return (
    <div role="status" aria-label={loading}>
      {positionKeys(6, 'access-skeleton').map((key) => (
        <div
          key={key}
          aria-hidden="true"
          className="flex items-center gap-3 border-b border-(--theme-border) px-6 py-3.5 motion-safe:animate-pulse"
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
