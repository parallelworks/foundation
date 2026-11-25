import { type ReactNode, useState } from 'react'
import { cx } from '../cx'
import { TrashIcon } from '../icons'
import { useStrings } from './Provider'

export interface EditableIconProps {
  /** The image's URL. Without one, or when it fails to load, `fallbackIcon` shows. */
  icon?: string | undefined
  /** What shows without an image, such as a default icon or a letter. */
  fallbackIcon?: ReactNode
  /** Shown instead of the image, such as an image element of the app's own. */
  renderImage?: ReactNode
  /** Hovering or focusing the icon offers to edit it; without this there is no overlay. */
  onEdit?: (() => void) | undefined
  /** Removes the image, from a button on the icon's corner shown while it is hovered or
   *  focused; without this, or without an image, there is none. */
  onRemove?: (() => void | Promise<void>) | undefined
  /** Off shows the icon alone, as someone who can't change it sees it. */
  editable?: boolean | undefined
  /** Names the edit button for assistive technology; the overlay's text by default. */
  label?: string | undefined
  /** The overlay's text and the remove button's name; the shared strings by default. */
  editText?: string | undefined
  removeLabel?: string | undefined
  /** A circle or a rounded square. */
  shape?: 'circle' | 'square' | undefined
  border?: boolean | undefined
  bgColor?: string | undefined
  /** Sizes the icon, such as `size-24`. */
  className?: string | undefined
  /** Classes for the image itself, such as padding around a default icon. */
  imageClassName?: string | undefined
}

/** An icon someone can change: hovering or focusing it dims it and offers to edit it, and a
 *  button on its corner removes the image. Enter opens the editor. */
export function EditableIcon({
  icon,
  fallbackIcon,
  renderImage,
  onEdit,
  onRemove,
  editable = true,
  label,
  editText,
  removeLabel,
  shape = 'circle',
  border = false,
  bgColor,
  className = 'size-24',
  imageClassName,
}: EditableIconProps) {
  const { imageUpload: t } = useStrings()
  // The image that failed to load, so a new one is tried again.
  const [broken, setBroken] = useState<string>()
  const shown = !!renderImage || (!!icon && icon !== broken)
  const round = shape === 'circle' ? 'rounded-full' : 'rounded-lg'
  const edit = editText ?? t.edit
  const remove = removeLabel ?? t.remove
  const image = renderImage ?? (
    <img
      src={icon}
      alt=""
      onError={() => setBroken(icon)}
      className={cx('size-full object-cover', imageClassName)}
    />
  )
  return (
    <div className={cx('group/icon relative shrink-0', className)}>
      <div
        style={bgColor ? { backgroundColor: bgColor } : undefined}
        className={cx(
          'flex size-full items-center justify-center overflow-hidden',
          round,
          border && 'border theme-border',
        )}
      >
        {shown ? image : fallbackIcon}
        {editable && onEdit && (
          <button
            type="button"
            aria-label={label ?? edit}
            onClick={onEdit}
            className={cx(
              'absolute inset-0 flex cursor-pointer items-center justify-center bg-black/75 p-1 text-center text-xs font-medium text-white opacity-0 transition-opacity select-none group-hover/icon:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-accent)',
              round,
            )}
          >
            <span aria-hidden>{edit}</span>
          </button>
        )}
      </div>
      {editable && onRemove && shown && (
        <button
          type="button"
          aria-label={remove}
          title={remove}
          onClick={() => void onRemove()}
          className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border theme-border bg-(--theme-panel-bg) text-(--theme-muted-text-color) opacity-0 shadow-sm transition-opacity group-focus-within/icon:opacity-100 group-hover/icon:opacity-100 hover:text-(--theme-error) focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-(--theme-accent)"
        >
          <TrashIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}
