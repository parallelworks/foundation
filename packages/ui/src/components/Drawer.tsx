import type { ReactNode } from 'react'
import { XIcon } from '../icons'
import { BareModal } from './BareModal'
import { useStrings } from './Provider'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  /** Stays put above the scrolling body, e.g. a search field. */
  toolbar?: ReactNode
  footer?: ReactNode
  /** Blocks Escape and backdrop clicks; the close button still calls `onClose`. */
  preventClose?: boolean
  /** Width in pixels; the panel never grows past the viewport, so phones get the full width. */
  width?: number | undefined
  children: ReactNode
}

function shown(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  toolbar,
  footer,
  preventClose = false,
  width = 640,
  children,
}: DrawerProps) {
  const strings = useStrings()
  return (
    <BareModal
      open={open}
      onClose={onClose}
      ariaLabel={title}
      align="end"
      preventClose={preventClose}
      className="flex h-full max-w-full"
    >
      <div
        style={{ width }}
        className="flex h-full max-w-full flex-col border-s border-(--theme-border) bg-(--theme-app-bg) text-(--theme-app) shadow-2xl"
      >
        <div className="flex items-start gap-4 border-b border-(--theme-border) px-6 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-balance">{title}</h2>
            {shown(description) && (
              <div className="mt-1 text-[13px] text-(--theme-muted-text-color)">{description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={strings.modal.close}
            className="-me-2 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app)"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        {shown(toolbar) && (
          <div className="border-b border-(--theme-border) px-6 py-3">{toolbar}</div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {shown(footer) && (
          <div className="border-t border-(--theme-border) px-6 py-3">{footer}</div>
        )}
      </div>
    </BareModal>
  )
}
