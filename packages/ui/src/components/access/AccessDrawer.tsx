import cx from 'classnames'
import type { ReactNode } from 'react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { SearchIcon } from '../../icons'
import { ConfirmModal } from '../ConfirmModal'
import { Drawer } from '../Drawer'
import EmptyState from '../EmptyState'
import { ghostButtonClasses, primaryButtonClasses } from '../ghostButton'
import { positionKeys } from '../keys'
import { useStrings } from '../Provider'
import { truncationTooltipProps } from '../Tooltip'
import {
  type AccessGroup,
  type AccessPermission,
  type AccessSubject,
  type AccessValue,
  grants,
  hasAccess,
  type ImpliedPermissions,
  normalize,
  permissionState,
  sameGrants,
} from './accessDraft'
import { PermissionToggles } from './PermissionToggles'
import { type AccessDraft, useAccessDraft } from './useAccessDraft'

export interface AccessDrawerProps {
  open: boolean
  onClose: () => void
  title?: string | undefined
  /** Names what is being shared, e.g. the resource's kind and name. */
  description?: ReactNode
  permissions: readonly AccessPermission[]
  implied?: ImpliedPermissions | undefined
  groups: readonly AccessGroup[]
  /** The current grants; `undefined` while they load. */
  value: AccessValue | undefined
  loading?: boolean | undefined
  /** Replaces the list, e.g. when the grants failed to load; the host renders its own message. */
  error?: ReactNode
  /** `false` hides the organization row; a `disabledReason` keeps it visible but locked. */
  organization?: false | { disabledReason?: ReactNode } | undefined
  readOnly?: boolean | undefined
  /** Host content above the search field, such as a setting that isn't a group grant. */
  extra?: ReactNode
  /** Offered when there are no groups at all, e.g. a link to create one. */
  emptyAction?: ReactNode
  /** Asks before saving, for resources where a change takes effect on running work. */
  confirmSave?: { title: string; description?: ReactNode } | undefined
  defaultQuery?: string | undefined
  /** Receives the full replacement value. Reject to keep the unsaved changes; report the error yourself. */
  onSave: (next: AccessValue) => Promise<void>
  width?: number | undefined
}

const NO_IMPLIED: ImpliedPermissions = {}

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
  const draft = useAccessDraft(value, open)
  const [query, setQuery] = useState(defaultQuery)
  const deferredQuery = useDeferredValue(query)
  const [confirming, setConfirming] = useState<'close' | 'save' | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery(defaultQuery)
      setJustSaved(false)
    } else {
      setConfirming(null)
    }
  }, [open, defaultQuery])

  const ready = !loading && error === undefined && value !== undefined
  const editable = ready && !readOnly

  // An effect, not a ref callback: the modal records where to return focus in its own
  // effect, which runs before this one, so focusing earlier would lose the trigger.
  useEffect(() => {
    if (open && ready) {
      searchRef.current?.focus()
    }
  }, [open, ready])

  const sorted = useMemo(() => [...groups].sort((a, b) => a.name.localeCompare(b.name)), [groups])

  // Sections come from the saved grants, not the draft, so a row never jumps away
  // from the pointer while it's being edited. They re-sort after a save.
  const sections = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    const withAccess: AccessGroup[] = []
    const others: AccessGroup[] = []
    for (const group of sorted) {
      if (needle && !group.name.toLowerCase().includes(needle)) {
        continue
      }
      if (hasAccess(grants(draft.saved, group.name))) {
        withAccess.push(group)
      } else {
        others.push(group)
      }
    }
    return { shown: withAccess.length + others.length, withAccess, others }
  }, [sorted, deferredQuery, draft.saved])

  const requestClose = () => {
    if (saving) {
      return
    }
    if (draft.dirty && !readOnly) {
      setConfirming('close')
    } else {
      onClose()
    }
  }

  const runSave = async () => {
    const submitted = draft.draft
    const next = normalize(submitted)
    setSaving(true)
    try {
      await onSave(next)
      draft.commit(next, submitted)
      setJustSaved(true)
    } catch {
      // The host reports the failure; keeping the draft lets the person retry.
    } finally {
      setSaving(false)
    }
  }

  const status = draft.dirty
    ? strings.unsavedChanges(draft.changes.length)
    : justSaved
      ? strings.saved
      : strings.noChanges

  const toolbar =
    extra !== undefined || ready ? (
      <div className="flex flex-col gap-3">
        {extra}
        {ready && (
          <div className="flex items-center gap-3">
            <label className="relative flex min-w-0 flex-1 items-center">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-(--theme-muted-text-color)"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={strings.search}
                aria-label={strings.search}
                className="h-9 w-full rounded-md border border-(--theme-border) bg-(--theme-input-bg) pr-3 pl-9 text-sm text-(--theme-input) placeholder:text-(--theme-muted-text-color) focus:border-(--theme-element) focus:outline-none"
              />
            </label>
            <span className="shrink-0 text-[13px] text-(--theme-muted-text-color)">
              {deferredQuery.trim()
                ? strings.matching(sections.shown, groups.length)
                : strings.total(groups.length)}
            </span>
          </div>
        )}
      </div>
    ) : undefined

  const footer = editable ? (
    <div className="flex items-center gap-2">
      <p aria-live="polite" className="min-w-0 flex-1 text-[13px] text-(--theme-muted-text-color)">
        {status}
      </p>
      <button
        type="button"
        onClick={draft.discard}
        disabled={!draft.dirty || saving}
        className={cx(ghostButtonClasses, 'disabled:cursor-not-allowed disabled:opacity-50')}
      >
        {strings.discard}
      </button>
      <button
        type="button"
        onClick={confirmSave ? () => setConfirming('save') : runSave}
        disabled={!draft.dirty || saving}
        className={cx(
          primaryButtonClasses,
          'h-8 px-3 disabled:cursor-not-allowed disabled:opacity-50',
          saving && 'cursor-wait',
        )}
      >
        {saving ? strings.saving : strings.save}
      </button>
    </div>
  ) : undefined

  const rowProps = { permissions, implied, draft, readOnly }

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        title={title ?? strings.title}
        description={description}
        toolbar={toolbar}
        footer={footer}
        preventClose={confirming !== null || saving}
        width={width}
      >
        {loading || (error === undefined && value === undefined) ? (
          <RowsSkeleton />
        ) : error !== undefined ? (
          <div className="px-6 py-5">{error}</div>
        ) : (
          <>
            {organization !== false && (
              <ul>
                <AccessRow
                  {...rowProps}
                  subject={null}
                  note={organization.disabledReason || strings.organizationMeta}
                  locked={Boolean(organization.disabledReason)}
                />
              </ul>
            )}
            {groups.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title={strings.noGroups}
                  description={strings.noGroupsHint}
                  action={emptyAction}
                />
              </div>
            ) : sections.shown === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <p className="font-medium">{strings.noMatches(deferredQuery.trim())}</p>
                <p className="text-[13px] text-(--theme-muted-text-color)">
                  {strings.noMatchesHint}
                </p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className={cx(ghostButtonClasses, 'mt-2 border border-(--theme-border)')}
                >
                  {strings.clearSearch}
                </button>
              </div>
            ) : (
              <>
                <GroupSection
                  heading={strings.withAccess(sections.withAccess.length)}
                  groups={sections.withAccess}
                  rowProps={rowProps}
                />
                <GroupSection
                  heading={strings.otherGroups(sections.others.length)}
                  groups={sections.others}
                  rowProps={rowProps}
                />
              </>
            )}
          </>
        )}
      </Drawer>
      <ConfirmModal
        open={open && confirming === 'close'}
        onClose={() => setConfirming(null)}
        title={strings.discardTitle}
        description={strings.discardDescription(draft.changes.length)}
        confirmLabel={strings.discardConfirm}
        cancelLabel={strings.keepEditing}
        destructive
        onConfirm={() => {
          draft.discard()
          onClose()
        }}
      />
      {confirmSave && (
        <ConfirmModal
          open={open && confirming === 'save'}
          onClose={() => setConfirming(null)}
          title={confirmSave.title}
          description={confirmSave.description}
          confirmLabel={strings.save}
          onConfirm={runSave}
        />
      )}
    </>
  )
}

interface RowProps {
  permissions: readonly AccessPermission[]
  implied: ImpliedPermissions
  draft: AccessDraft
  readOnly: boolean
}

function GroupSection({
  heading,
  groups,
  rowProps,
}: {
  heading: string
  groups: readonly AccessGroup[]
  rowProps: RowProps
}) {
  const strings = useStrings().access
  if (groups.length === 0) {
    return null
  }
  return (
    <section aria-label={heading}>
      <h3 className="sticky top-0 z-[1] border-b border-(--theme-border) bg-(--theme-muted-panel-bg) px-6 py-2 text-[13px] font-medium text-(--theme-muted-text-color)">
        {heading}
      </h3>
      <ul>
        {groups.map((group) => (
          <AccessRow
            key={group.name}
            {...rowProps}
            subject={group.name}
            note={group.members === undefined ? undefined : strings.members(group.members)}
            locked={false}
          />
        ))}
      </ul>
    </section>
  )
}

function AccessRow({
  subject,
  note,
  locked,
  permissions,
  implied,
  draft,
  readOnly,
}: RowProps & { subject: AccessSubject; note: ReactNode; locked: boolean }) {
  const strings = useStrings().access
  const name = subject ?? strings.organization
  const current = grants(draft.draft, subject)
  const before = grants(draft.saved, subject)
  const changed = !sameGrants(current, before)
  const revoked = changed && hasAccess(before) && !hasAccess(current)
  const inert = readOnly || locked
  const single = permissions.length === 1
  return (
    // content-visibility lets a list of hundreds of groups skip laying out the rows
    // that are scrolled out of view.
    <li
      className={cx(
        'flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-(--theme-border) px-6 py-2.5 [contain-intrinsic-size:auto_52px] [content-visibility:auto]',
        changed && 'bg-[color-mix(in_srgb,var(--theme-element)_8%,transparent)]',
      )}
    >
      <div className="min-w-40 flex-1">
        <p
          {...truncationTooltipProps(name)}
          className={cx('truncate text-sm', subject === null ? 'font-semibold' : 'font-medium')}
        >
          {name}
        </p>
        <p
          className={cx(
            'text-xs text-(--theme-muted-text-color)',
            // The organization's note can be a host's reason it is locked: wrap rather than hide it.
            subject !== null && 'truncate',
          )}
        >
          {revoked ? strings.revoked : note}
          {changed && !revoked && (
            <span className="before:mx-1 before:content-['·']">{strings.unsaved}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <PermissionToggles
          label={strings.permissionsFor(name)}
          permissions={permissions}
          states={permissions.map((p) => permissionState(draft.draft, subject, p.key, implied))}
          disabled={inert}
          onToggle={(key) => draft.toggle(subject, key)}
        />
        {!readOnly && (
          <div className="flex w-24 justify-end">
            {!locked && revoked && (
              <button
                type="button"
                onClick={() => draft.undo(subject)}
                aria-label={strings.undoFor(name)}
                className="h-7 cursor-pointer rounded-md border border-(--theme-border) px-2.5 text-[12.5px] font-medium transition-colors hover:bg-(--theme-muted-panel-bg)"
              >
                {strings.undo}
              </button>
            )}
            {!locked && !revoked && hasAccess(current) && (
              <button
                type="button"
                onClick={() => draft.revokeAll(subject)}
                aria-label={single ? strings.revokeFor(name) : strings.revokeAllFor(name)}
                className={cx(ghostButtonClasses, 'h-7 px-2 text-[12.5px] whitespace-nowrap')}
              >
                {single ? strings.revoke : strings.revokeAll}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function RowsSkeleton() {
  const { loading } = useStrings()
  return (
    <div role="status" aria-label={loading}>
      {positionKeys(8, 'access-skeleton').map((key) => (
        <div
          key={key}
          aria-hidden="true"
          className="flex items-center gap-3 border-b border-(--theme-border) px-6 py-3 motion-safe:animate-pulse"
        >
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 rounded bg-(--theme-muted-panel-bg)" />
            <div className="h-2.5 w-24 rounded bg-(--theme-muted-panel-bg)" />
          </div>
          <div className="h-7 w-48 rounded bg-(--theme-muted-panel-bg)" />
        </div>
      ))}
      <span className="sr-only">{loading}</span>
    </div>
  )
}
