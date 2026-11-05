import { type KeyboardEvent, useEffect, useState } from 'react'
import { IconButton } from '../../components/IconButton'
import { Modal } from '../../components/Modal'
import { useStrings } from '../../components/Provider'
import { useClosingValue } from '../../components/useClosingValue'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DownloadIcon } from '../../icons'
import { useChatConfig } from '../core/config'
import type { AttachmentRef } from '../types'

/** An image a message carries, as the viewer shows it. */
export interface ViewableImage {
  attachment: AttachmentRef
  name: string
  /** What the thumbnail shows: the preview, or the file itself. */
  src: string
  /** The file itself, loaded in place of the preview once it arrives. */
  fullUrl?: string | undefined
  /** The file as a link, only when following it cannot run script. */
  href?: string | undefined
}

/** The full image once it has loaded, and the preview until then or if it fails,
 *  so the viewer never shows a broken picture over one it already had. */
function useLoadedImage(preview: string, full: string | undefined): string {
  const [loaded, setLoaded] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!full || full === preview) {
      return
    }
    let current = true
    const image = new Image()
    image.onload = () => {
      if (current) {
        setLoaded(full)
      }
    }
    image.src = full
    return () => {
      current = false
      image.onload = null
    }
  }, [preview, full])
  return full && loaded === full ? full : preview
}

/** A message's images, one at a time, at their own size or smaller to fit the window. */
export default function AttachmentImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
  returnFocusTo,
}: {
  images: ViewableImage[]
  /** The image shown, or null while the viewer is closed. */
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
  /** The thumbnail focus goes back to on close. */
  returnFocusTo: (index: number) => HTMLElement | null | undefined
}) {
  const shown = useClosingValue(index)
  const image = shown === undefined ? undefined : images[shown]
  const t = useChatConfig().strings.attachmentManager
  const { common } = useStrings()
  const src = useLoadedImage(image?.src ?? '', image?.fullUrl)
  const several = images.length > 1
  const step = (by: number) => {
    if (shown !== undefined && several) {
      onIndexChange((shown + by + images.length) % images.length)
    }
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      step(-1)
    } else if (event.key === 'ArrowRight') {
      step(1)
    }
  }
  return (
    <Modal
      open={index !== null}
      onClose={onClose}
      align="center"
      panel={false}
      aria-label={image?.name}
      backdropClassName="bg-[rgba(1,4,9,.94)]"
      finalFocus={() => (shown === undefined ? true : (returnFocusTo(shown) ?? true))}
      onKeyDown={onKeyDown}
      className="flex h-full w-full min-w-0 flex-col gap-2"
    >
      {image && (
        <>
          <div className="mx-auto flex w-full max-w-xl min-w-0 shrink-0 items-center gap-1 rounded-lg border border-(--theme-border) bg-(--theme-panel-bg) p-1 text-(--theme-app) shadow-lg">
            <span className="min-w-0 flex-1 truncate px-2 text-sm">{image.name}</span>
            {several && (
              <>
                <IconButton
                  icon={<ChevronLeftIcon />}
                  label={t.previousImage}
                  onClick={() => step(-1)}
                />
                <span className="text-xs tabular-nums text-(--theme-muted-text-color)">
                  {t.imagePosition((shown ?? 0) + 1, images.length)}
                </span>
                <IconButton
                  icon={<ChevronRightIcon />}
                  label={t.nextImage}
                  onClick={() => step(1)}
                />
              </>
            )}
            {image.href && (
              <IconButton
                href={image.href}
                reloadDocument
                download={image.attachment.filename || true}
                icon={<DownloadIcon />}
                label={t.download(image.name)}
              />
            )}
            <IconButton icon={<CloseIcon />} label={common.close} onClick={onClose} />
          </div>
          {/* Keyed by image, so stepping never shows the last one's picture under the next one's name. */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: a click around the picture is the backdrop's, which Escape stands in for */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the stage only forwards a backdrop click */}
          <div
            className="flex min-h-0 w-full flex-1 items-center justify-center"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                onClose()
              }
            }}
          >
            <img
              key={shown}
              src={src}
              alt={image.name}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </>
      )}
    </Modal>
  )
}
