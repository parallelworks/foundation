import { type ComponentPropsWithRef, useId } from 'react'
import { Popover, useClosePopover } from '../../components/Popover'
import { Switch } from '../../components/Switch'
import { cx } from '../../cx'
import { AddIcon, AttachmentIcon, ConnectIcon } from '../../icons'
import type { ChatToolOption } from '../adapter/types'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'

const rowClassName =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-(--theme-hover) focus-visible:bg-(--theme-hover)'

function PlusButton({
  open,
  label,
  hint,
  className,
  ...props
}: ComponentPropsWithRef<'button'> & { open: boolean; label: string; hint?: string | undefined }) {
  const name = hint ? `${label} · ${hint}` : label
  return (
    <button
      type="button"
      {...props}
      aria-label={name}
      title={name}
      className={cx(
        'relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
        open ? 'theme-text chat-tint-strong' : 'theme-muted-text hover:theme-text hover:chat-tint',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    >
      <AddIcon className={cx('h-5 w-5 transition-transform duration-200', open && 'rotate-45')} />
      {hint && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 size-1.5 rounded-full bg-(--theme-accent)"
        />
      )}
    </button>
  )
}

function ToolRow({
  tool,
  enabled,
  onChange,
}: {
  tool: ChatToolOption
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const descriptionId = useId()
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-(--theme-hover)">
      <span className="min-w-0 flex-1">
        <span className="block truncate">{tool.label}</span>
        {tool.description && (
          <span id={descriptionId} className="block text-xs theme-muted-text">
            {tool.description}
          </span>
        )}
      </span>
      <Switch
        size="sm"
        checked={enabled}
        onCheckedChange={onChange}
        {...(tool.description ? { 'aria-describedby': descriptionId } : {})}
      />
    </label>
  )
}

function AddFilesItem({ onClick }: { onClick: () => void }) {
  const { strings } = useChatConfig()
  const close = useClosePopover()
  return (
    <button
      type="button"
      className={rowClassName}
      onClick={() => {
        close()
        onClick()
      }}
    >
      <AttachmentIcon className="h-4 w-4 shrink-0 theme-muted-text" />
      {strings.composerMenu.addFiles}
    </button>
  )
}

function ConnectToolsItem({ href }: { href: string }) {
  const { LinkComponent, strings } = useChatConfig()
  const close = useClosePopover()
  return (
    <LinkComponent
      target={{ kind: 'external', href }}
      onClick={close}
      className={cx(rowClassName, 'text-xs theme-muted-text hover:theme-text')}
    >
      <ConnectIcon className="h-3.5 w-3.5 shrink-0" />
      {strings.sidebar.connectTools}
    </LinkComponent>
  )
}

function Divider() {
  return <div className="-mx-1.5 my-1 h-px bg-(--theme-border)" />
}

/** The composer's + button. With only attachments it opens their panel, as it
 *  always has; once the adapter lists tools of its own it opens a menu: add
 *  files, a switch for each tool, and where to connect more. A dot on it says
 *  some tools are off. */
export default function ComposerAddMenu({
  attachmentsOpen,
  onToggleAttachments,
  disabled,
  withTools,
}: {
  attachmentsOpen: boolean
  /** Absent when the composer takes no files. */
  onToggleAttachments?: (() => void) | undefined
  disabled: boolean
  /** Offer the provider's tools, for a turn the provider runs. */
  withTools: boolean
}) {
  const { tools, enabledToolIds, setToolEnabled } = useChat()
  const { extraLinks, strings } = useChatConfig()
  const t = strings.composerMenu
  const listed = withTools ? tools : []

  if (listed.length === 0) {
    if (!onToggleAttachments) {
      return null
    }
    return (
      <PlusButton
        open={attachmentsOpen}
        aria-expanded={attachmentsOpen}
        disabled={disabled}
        label={strings.input.attachFiles}
        onClick={onToggleAttachments}
      />
    )
  }

  const someOff = enabledToolIds.length < listed.length
  return (
    <Popover
      aria-label={onToggleAttachments ? t.label : t.tools}
      side="top"
      align="start"
      className="w-72 p-1.5"
      trigger={
        <PlusButton
          open={attachmentsOpen}
          disabled={disabled}
          label={onToggleAttachments ? t.label : t.tools}
          hint={someOff ? t.someToolsOff : undefined}
        />
      }
    >
      {onToggleAttachments && (
        <>
          <AddFilesItem onClick={onToggleAttachments} />
          <Divider />
        </>
      )}
      <div className="px-2 pt-1 pb-0.5 text-[11px] font-medium theme-muted-text">{t.tools}</div>
      {listed.map((tool) => (
        <ToolRow
          key={tool.id}
          tool={tool}
          enabled={enabledToolIds.includes(tool.id)}
          onChange={(enabled) => setToolEnabled(tool.id, enabled)}
        />
      ))}
      {extraLinks.connectTools && (
        <>
          <Divider />
          <ConnectToolsItem href={extraLinks.connectTools} />
        </>
      )}
    </Popover>
  )
}
