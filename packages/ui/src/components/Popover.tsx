import { Popover as BasePopover } from '@base-ui/react/popover'
import { clsx as cx } from 'clsx'
import { type ReactElement, type ReactNode, useRef } from 'react'
import {
  panelClassName,
  portalContainer,
  positionerClassName,
  tipArrowClassName,
  tipClassName,
} from './floating'

/** Closes the popover it sits in when pressed. Render a link through it, as in
 *  `<PopoverClose render={<Link href="…" />}>`, for a link that closes its panel. */
export const PopoverClose = BasePopover.Close

export interface PopoverProps
  extends Omit<
    BasePopover.Popup.Props,
    'className' | 'children' | 'render' | 'title' | 'initialFocus'
  > {
  /** The button that opens it. It receives the trigger's props and ref, so it must pass them to its element. */
  trigger: ReactElement
  /** A heading at the top that names the popover. Without one, name it with `aria-label`. */
  title?: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  side?: BasePopover.Positioner.Props['side']
  align?: BasePopover.Positioner.Props['align']
  /** Also opens while the pointer rests on the trigger. A click or a tap still
   *  opens it, so touch and keyboard users reach it too. */
  openOnHover?: boolean
  /** Where focus goes on opening: the first control in it, or the panel itself,
   *  for a list read before one item in it is picked. */
  initialFocus?: 'first-control' | 'popup'
  /** `panel` holds controls or a list; `tip` is a tooltip-sized note with an arrow. */
  variant?: 'panel' | 'tip'
  /** On the popup: its width, padding or text size. */
  className?: string
  children: ReactNode
}

/** A panel anchored to its trigger, over the page so no container clips it. It
 *  flips and shifts to stay on screen, closes on Escape or a press outside, and
 *  returns focus to the trigger. Use a Menu for a list of actions, and a
 *  HoverCard for a preview a link already leads to. */
export function Popover({
  trigger,
  title,
  open,
  defaultOpen,
  onOpenChange,
  side = 'bottom',
  align = 'center',
  openOnHover = false,
  initialFocus = 'first-control',
  variant = 'panel',
  className,
  children,
  ...popupProps
}: PopoverProps) {
  const tip = variant === 'tip'
  const popup = useRef<HTMLDivElement>(null)
  return (
    <BasePopover.Root
      {...(open === undefined ? {} : { open })}
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
      {...(onOpenChange ? { onOpenChange: (next: boolean) => onOpenChange(next) } : {})}
    >
      <BasePopover.Trigger
        render={trigger}
        openOnHover={openOnHover}
        {...(openOnHover ? { delay: 300, closeDelay: 150 } : {})}
      />
      <BasePopover.Portal container={portalContainer()}>
        <BasePopover.Positioner
          side={side}
          align={align}
          sideOffset={tip ? 8 : 6}
          collisionPadding={8}
          className={positionerClassName}
        >
          <BasePopover.Popup
            {...popupProps}
            ref={popup}
            initialFocus={initialFocus === 'popup' ? popup : true}
            className={cx(
              tip
                ? cx('max-w-sm text-left', tipClassName)
                : cx(
                    panelClassName,
                    'max-h-(--available-height) max-w-[calc(100vw-16px)] overflow-y-auto p-3',
                  ),
              className,
            )}
          >
            {tip && <BasePopover.Arrow className={tipArrowClassName} />}
            {title && (
              <BasePopover.Title className="mb-2 text-sm font-semibold">{title}</BasePopover.Title>
            )}
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}
