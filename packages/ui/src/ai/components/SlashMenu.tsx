import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { panelClassName } from '../../components/floating'
import { ListboxOption, ListboxPanel, useListboxNavigation } from '../../components/Listbox'
import { Loader } from '../../components/Loader'
import { cx } from '../../cx'
import { useChatConfig } from '../core/config'

export interface SlashCommandOption {
  name: string
  description?: string | undefined
  /** What the command takes after its name, such as `[condition|pause|resume]`: shown beside
   *  the name in the menu, and above the box while its arguments are typed. */
  argumentHint?: string | undefined
}

export interface SlashMenuConfig {
  commands: SlashCommandOption[]
  /** Names the listbox for assistive tech. */
  label: string
  /** Called when the input first reads as a command, so a host can load the list lazily. */
  onOpen?: (() => void) | undefined
  /** The host is still loading the list: the menu opens on the slash and says more are coming,
   *  rather than showing the commands it has so far as all there are. */
  loading?: boolean | undefined
}

const MAX_SHOWN = 8
// A name still being typed: the slash and nothing past the command name.
const TYPING_NAME = /^\/([\w:-]*)$/

export function slashMatches(input: string, commands: SlashCommandOption[]): SlashCommandOption[] {
  const typed = TYPING_NAME.exec(input)
  if (!typed) {
    return []
  }
  const query = (typed[1] ?? '').toLowerCase()
  return commands.filter((c) => c.name.toLowerCase().startsWith(query)).slice(0, MAX_SHOWN)
}

// A whole name, then its arguments on the same line.
const TYPING_ARGUMENTS = /^\/([\w:-]+)[ \t][^\n]*$/

/** The command whose arguments are being typed, when it says what it takes. */
function slashArgumentsFor(
  input: string,
  commands: SlashCommandOption[],
): SlashCommandOption | undefined {
  const name = TYPING_ARGUMENTS.exec(input)?.[1]
  return commands.find((c) => c.name === name && c.argumentHint)
}

/** The palette's open state and keys; the caller owns the input.
 *  Base UI's Autocomplete drives a single-line input, and its arrow keys would take the caret
 *  from a multi-line composer, so the textarea stays a textbox that points at the list:
 *  spread `inputProps` on it. */
export function useSlashMenu(
  input: string,
  config: SlashMenuConfig | undefined,
  setInput: (value: string) => void,
) {
  const [dismissed, setDismissed] = useState(false)
  const matches = config ? slashMatches(input, config.commands) : []
  const exact = matches.length === 1 && `/${matches[0]?.name}` === input
  const loading = !!config?.loading && TYPING_NAME.test(input)
  const open = (matches.length > 0 || loading) && !dismissed
  const startsCommand = input.startsWith('/')
  const onOpen = config?.onOpen

  useEffect(() => {
    if (startsCommand) {
      onOpen?.()
    }
  }, [startsCommand, onOpen])

  const choose = (name: string) => setInput(`/${name} `)
  const list = useListboxNavigation({
    items: matches,
    open,
    onChoose: (command) => choose(command.name),
    onDismiss: () => setDismissed(true),
  })

  // A new query starts from the top, and typing reopens a dismissed menu.
  const query = TYPING_NAME.exec(input)?.[1] ?? null
  const [shownQuery, setShownQuery] = useState(query)
  if (query !== shownQuery) {
    setShownQuery(query)
    list.setActive(0)
    setDismissed(false)
  }

  /** True when the key belonged to the menu. A whole name stays listed so its description can be
   *  read, but there is nothing left to complete, so Enter stays the host's and sends it. */
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) =>
    !(exact && e.key === 'Enter') && list.handleKey(e)

  const typing = config ? slashArgumentsFor(input, config.commands) : undefined
  const hintId = useId()

  return {
    open,
    matches,
    loading,
    active: list.active,
    choose,
    handleKey,
    listId: list.listId,
    inputProps: { ...list.hostProps, 'aria-describedby': typing ? hintId : undefined },
    list,
    /** The command whose arguments are being typed, and the id of its hint. */
    argumentHint: typing ? { command: typing, id: hintId } : undefined,
  }
}

function CommandLabel({ command }: { command: SlashCommandOption }) {
  return (
    <span className="font-mono">
      /{command.name}
      {command.argumentHint && (
        <span className="text-(--theme-muted-text-color)"> {command.argumentHint}</span>
      )}
    </span>
  )
}

export function SlashMenu({
  label,
  menu,
  onChoose,
}: {
  label: string
  menu: ReturnType<typeof useSlashMenu>
  onChoose: (name: string) => void
}) {
  const { loadingCommands } = useChatConfig().strings.input
  const loading = menu.loading && (
    <span role="status" className="flex items-center gap-2">
      <Loader inline decorative size={14} color="var(--theme-muted-text-color)" />
      {loadingCommands}
    </span>
  )
  return (
    <div data-testid="slash-menu" className="absolute bottom-full left-0 right-0 z-20 mb-2">
      <ListboxPanel
        listProps={menu.list.listProps}
        aria-label={label}
        footer={menu.matches.length > 0 && loading}
        empty={loading}
      >
        {menu.matches.map((c, i) => {
          const option = menu.list.optionProps(i)
          return (
            <ListboxOption
              key={c.name}
              option={{ ...option, onClick: () => onChoose(c.name) }}
              inline
              label={<CommandLabel command={c} />}
              description={c.description}
            />
          )
        })}
      </ListboxPanel>
    </div>
  )
}

/** What the command being typed takes, where its menu stood; the box keeps every key. */
export function SlashArgumentHint({ hint }: { hint: { command: SlashCommandOption; id: string } }) {
  return (
    <div
      data-testid="slash-argument-hint"
      id={hint.id}
      className="absolute bottom-full left-0 right-0 z-20 mb-2"
    >
      {/* A menu row's inset, so the hint takes the place of the row it follows. Unlike a row it
        wraps, since what the command takes is the point, and the description gives way first. */}
      <div
        className={cx(
          'flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5',
          panelClassName,
        )}
      >
        <span className="min-w-0 break-words">
          <CommandLabel command={hint.command} />
        </span>
        {hint.command.description && (
          <span className="min-w-0 truncate text-xs text-(--theme-muted-text-color)">
            {hint.command.description}
          </span>
        )}
      </div>
    </div>
  )
}
