import { useMemo, useState } from 'react'
import { ListboxOption, ListboxPanel, useListboxNavigation } from '../../components/Listbox'
import { type EmojiShortcode, emojiMatches, insertEmoji, typingShortcode } from './emojiShortcode'

/** The emoji for the `:shortcode` typed before the caret, and their keys; the caller owns the
 *  input and spreads `inputProps` on it while the menu is open. `caret` is null while text is
 *  selected. */
export function useEmojiMenu(
  input: string,
  caret: number | null,
  enabled: boolean,
  insert: (text: string, caret: number) => void,
) {
  const [dismissed, setDismissed] = useState(false)
  const typing = enabled && caret !== null ? typingShortcode(input, caret) : null
  const query = typing?.query ?? null
  const matches = useMemo(() => (query ? emojiMatches(query) : []), [query])
  const open = matches.length > 0 && !dismissed

  const list = useListboxNavigation({
    items: matches,
    open,
    onChoose: (shortcode: EmojiShortcode) => {
      if (typing && caret !== null) {
        const next = insertEmoji(input, typing.start, caret, shortcode.emoji)
        insert(next.text, next.caret)
      }
    },
    onDismiss: () => setDismissed(true),
  })

  // A new query starts from the top, and typing reopens a dismissed menu.
  const [shownQuery, setShownQuery] = useState(query)
  if (query !== shownQuery) {
    setShownQuery(query)
    list.setActive(0)
    setDismissed(false)
  }

  return {
    open,
    matches,
    list,
    /** True when the key belonged to the menu. */
    handleKey: list.handleKey,
    inputProps: open ? list.hostProps : {},
  }
}

export function EmojiMenu({
  label,
  menu,
}: {
  label: string
  menu: ReturnType<typeof useEmojiMenu>
}) {
  return (
    <div data-testid="emoji-menu" className="absolute bottom-full left-0 right-0 z-20 mb-2">
      <ListboxPanel listProps={menu.list.listProps} aria-label={label}>
        {menu.matches.map((shortcode, i) => (
          <ListboxOption
            key={shortcode.name}
            option={menu.list.optionProps(i)}
            // The shortcode names the emoji for assistive tech, which would otherwise read both.
            icon={
              <span aria-hidden="true" className="w-5 text-center text-base leading-none">
                {shortcode.emoji}
              </span>
            }
            label={<span className="font-mono">:{shortcode.name}:</span>}
          />
        ))}
      </ListboxPanel>
    </div>
  )
}
