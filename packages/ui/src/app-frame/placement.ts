import { createContext, use } from 'react'

/** What a page's content learns from being in the frame's navigation. */
export interface AppFrameNavigationPlacement {
  /** The navigation is the rail, so the content shows as icons. */
  collapsed: boolean
  /** Brings the content into view: back from the app's navigation, and out of the rail or the
   *  closed drawer it is in, such as before focusing its search. */
  reveal: () => void
  /** Closes the drawer the content is in on a narrow screen, as picking a navigation item does,
   *  for a pick that leaves the page where it is. */
  closeNavigation: () => void
}

export const PlacementContext = createContext<AppFrameNavigationPlacement | null>(null)

/** Set for what `AppFrameTakeoverContent` renders, so a list made to sit beside a page can take
 *  the navigation's rail and colors instead; null anywhere else. */
export function useAppFrameNavigationPlacement(): AppFrameNavigationPlacement | null {
  return use(PlacementContext)
}
