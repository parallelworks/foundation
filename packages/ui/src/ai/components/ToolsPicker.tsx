import { useId } from 'react'
import { Popover, useClosePopover } from '../../components/Popover'
import { Switch } from '../../components/Switch'
import { ChevronDownIcon, ConnectIcon, ToolsIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { smallChipClassName } from '../ui/chip'
import { ConnectToolsLink } from './ComposerChrome'

function ToolRow({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string
  description: string | undefined
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const descriptionId = useId()
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-(--theme-hover)">
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {description && (
          <span id={descriptionId} className="block text-xs theme-muted-text">
            {description}
          </span>
        )}
      </span>
      <Switch
        size="sm"
        checked={enabled}
        onCheckedChange={onChange}
        {...(description ? { 'aria-describedby': descriptionId } : {})}
      />
    </label>
  )
}

function ConnectToolsItem({ href }: { href: string }) {
  const { LinkComponent, strings } = useChatConfig()
  const close = useClosePopover()
  return (
    <>
      <div className="-mx-1.5 my-1 h-px bg-(--theme-border)" />
      <LinkComponent
        target={{ kind: 'external', href }}
        onClick={close}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs theme-muted-text transition-colors hover:bg-(--theme-hover) hover:theme-text"
      >
        <ConnectIcon className="h-3.5 w-3.5 shrink-0" />
        {strings.sidebar.connectTools}
      </LinkComponent>
    </>
  )
}

/** Which of the host's own tools the assistant may use, as a chip under the
 *  composer. Without tools to choose from it is the connect-tools link alone. */
export default function ToolsPicker() {
  const { tools, enabledToolIds, setToolEnabled } = useChat()
  const { extraLinks, strings } = useChatConfig()
  const t = strings.toolsPicker

  if (tools.length === 0) {
    return <ConnectToolsLink />
  }

  return (
    <Popover
      title={<span className="block px-2 pt-1">{t.title}</span>}
      side="top"
      align="start"
      className="w-72 p-1.5"
      trigger={
        <button type="button" className={smallChipClassName}>
          <ToolsIcon className="h-3 w-3 shrink-0" />
          {t.count(enabledToolIds.length, tools.length)}
          <ChevronDownIcon className="h-3 w-3 shrink-0" />
        </button>
      }
    >
      <div className="flex flex-col">
        {tools.map((tool) => (
          <ToolRow
            key={tool.id}
            label={tool.label}
            description={tool.description}
            enabled={enabledToolIds.includes(tool.id)}
            onChange={(enabled) => setToolEnabled(tool.id, enabled)}
          />
        ))}
      </div>
      {extraLinks.connectTools && <ConnectToolsItem href={extraLinks.connectTools} />}
    </Popover>
  )
}
