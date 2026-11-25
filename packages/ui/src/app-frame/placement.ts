import { createContext, use } from 'react'

/** What a page's content learns from being in the frame's navigation. */
export interface AppFrameNavigationPlacement {
  /** The navigation is the rail, so the content shows as icons. */
  collapsed: boolean
}

export const PlacementContext = createContext<AppFrameNavigationPlacement | null>(null)

/** Set for what `AppFrameTakeoverContent` renders, so a list made to sit beside a page can take
 *  the navigation's rail and colors instead; null anywhere else. */
export function useAppFrameNavigationPlacement(): AppFrameNavigationPlacement | null {
  return use(PlacementContext)
}
