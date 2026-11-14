import { createContext, type ReactNode, useContext } from 'react'
import type { AccessText } from '../access/strings'
import type { FileExplorerText } from '../file-explorer/strings'
import type { GraphEditorText, InputsEditorText } from '../graph/editorStrings'
import type { FilterOperator } from '../list/filterModel'
import { useMerged } from './byValue'

export interface UIStrings {
  modal: {
    creating: string
    addDescription: string
    advanced: string
    favorite: string
    favorited: string
    favoriteHintOn: string
    favoriteHintOff: string
  }
  common: {
    /** Returns to the view a drawer or panel showed before. */
    back: string
    cancel: string
    close: string
    save: string
    clear: string
    delete: string
    download: string
    retry: string
    reset: string
    apply: string
    dismiss: string
    /** Names the region toasts appear in. */
    notifications: string
    rename: string
    share: string
    send: string
    filter: string
    /** A filter's choice that turns it off, showing everything. */
    all: string
    loading: string
    loadMore: string
    showMore: string
    showLess: string
    previous: string
    next: string
    zoomIn: string
    zoomOut: string
    expandAll: string
    collapseAll: string
    moveUp: string
    moveDown: string
    undo: string
    redo: string
    duplicate: string
    copied: string
    copyToClipboard: string
    /** The toast after a copy that names nothing. */
    copiedToClipboard: string
    copyFailed: string
    /** `label` names what is copied, such as "email address". */
    copyThing: (label: string) => string
    copiedThing: (label: string) => string
    copyThingFailed: (label: string) => string
    /** A count past a badge's cap, `max` already formatted, such as "99+". */
    countOverflow: (max: string) => string
    /** Read out where a value is missing, which shows as a dash. */
    noValue: string
    /** A name field's rule: the characters a key or identifier allows. */
    invalidName: string
    invalidNumber: string
    copy: string
    /** A masked value's eye toggle, for a password or a secret. */
    showValue: string
    hideValue: string
    expand: string
    collapse: string
    showHiddenFields: string
    showHiddenFieldsHint: string
    jsonHasErrors: string
    add: string
    create: string
    remove: string
    sort: string
    userAvatar: string
    /** A person's presence beside their avatar, read with their name. */
    presence: Record<'online' | 'offline' | 'busy' | 'away', string>
    /** An avatar's name with the person's presence, such as "Ada Lovelace, online". */
    withPresence: (name: string, presence: string) => string
    moreInfo: string
    /** The name of a menu of actions on a page or row. */
    actions: string
    edit: string
    submit: string
    search: string
    clearSearch: string
    filterPlaceholder: string
    breadcrumb: string
    /** Names the menu of the breadcrumbs a narrow trail folds away. */
    showFullPath: string
    yes: string
    no: string
    /** Read after a link that opens a new tab. */
    opensInNewTab: string
    /** Names a code editor that has no label of its own. */
    codeEditor: string
    /** Names a block of code that has no title of its own, by its language,
     *  such as "yaml code"; `language` is empty when it has none. */
    codeOf: (language: string) => string
    /** Shown when someone types in a read-only code editor. */
    readOnlyText: string
    /** Names the handle that resizes a panel. */
    resizePanel: string
    /** A resizable panel's width, read aloud. */
    panelWidth: (px: number) => string
    refresh: string
    refreshing: string
    /** A refresh button's label once it knows when the data was fetched. */
    updated: (ago: string) => string
    /** Read with a "+3" chip that stands for the items a list leaves out. */
    moreCount: (count: number) => string
    /** Names the button that copies the text selected in a block. */
    copySelection: string
    /** Read in place of a masked secret's dots. */
    hiddenValue: string
  }
  dropdown: {
    select: (type: string) => string
    noOptionsFound: string
    /** While a search for options is under way. */
    searching: string
    showOptions: string
    /** The row that adds typed text as a new value. */
    add: (text: string) => string
    /** The row that creates the thing typed text names, such as a new label. */
    create: (text: string) => string
    /** Heads the values offered under a tag field. */
    suggested: string
    /** In place of the placeholder once a field holds as many values as it takes. */
    limitReached: (max: number) => string
    /** Names the button on a chosen value's chip that takes it out. */
    removeValue: (label: string) => string
  }
  datePicker: {
    /** The button's text while no date is chosen. */
    pickDate: string
    /** Names the time beside the date. */
    time: string
    previousMonth: string
    nextMonth: string
    /** Names the box in the calendar's popup that takes a typed date. */
    typeDate: string
    /** Under the box while what is typed isn't a date that can be chosen. */
    invalidDate: string
  }
  colorInput: {
    /** Names the picker beside the hex field: the field's name, or none when it has no plain one. */
    pick: (name?: string) => string
    /** Under the hex field while what is typed isn't a color. */
    invalid: string
  }
  imageUpload: {
    /** Names the tile's menu: what the image stands for, such as a team's name. */
    change: (name: string) => string
    /** The menu trigger beside the tile. */
    edit: string
    upload: string
    replace: string
    remove: string
    cropTitle: (name: string) => string
    cropHint: string
    /** Names the square the image is moved in, for assistive technology. */
    cropArea: string
    zoom: string
    save: string
    /** When the browser can't read the chosen file as an image. */
    unreadable: string
    /** When saving fails without a message of its own. */
    failed: string
  }
  oneTimeCode: {
    /** Names each box after the first, which the field's label names. */
    character: (position: number, length: number) => string
  }
  theme: {
    /** Names the light, dark or system choice. */
    appearance: string
    light: string
    dark: string
    system: string
    /** Names the choice of which mode's colors the controls edit. */
    editing: string
    presets: string
    /** The background a theme is generated from. */
    base: string
    accent: string
    /** Exchanges the background and the accent. */
    swap: string
    contrast: string
    /** Under the contrast slider. */
    contrastHelp: string
    /** The switch that gives the sidebar its own colors. */
    customSidebar: string
    sidebarBase: string
    sidebarAccent: string
    code: string
    codeStyle: (style: 'balanced' | 'vivid' | 'muted' | 'mono') => string
    copy: string
    /** The thing a copy toast names. */
    copied: string
    import: string
    importLabel: string
    importPlaceholder: string
    apply: string
    reset: string
    /** Why a pasted theme was refused. */
    importError: (code: 'json' | 'version' | 'shape' | 'color' | 'range', path: string) => string
    preview: string
    previewNav: readonly string[]
    previewHeading: string
    previewBody: string
    previewMuted: string
    previewLink: string
    previewButton: string
    previewSearch: string
    previewPassed: string
    previewFailed: string
  }
  logviewer: {
    error: string
    warning: string
    notice: string
    top: string
    clearSelection: string
    copyLines: (count: number) => string
    copyAll: string
    hideDebug: string
    showDebug: string
    filterLogs: string
    beginningOfLog: string
    loadingOlderEntries: string
    loadOlderEntries: string
    timeRange: string
    timeRangeActive: string
    timeRangeOn: string
    filterByTimeRange: string
    timeRangeHelp: string
    timeRangeFrom: string
    timeRangeTo: string
    invalidStartTime: string
    invalidEndTime: string
    endBeforeStart: string
    endInFuture: string
    follow: string
    following: string
    /** A line number's name: it selects the line for copying. */
    selectLine: (line: number) => string
  }
  dag: {
    workflow: string
    run: string
    status: string
    runtime: string
    submitted: string
    resetView: string
    previousGraph: string
    nextGraph: string
    matrixOf: (name: string) => string
    jobCount: (count: number) => string
    loadingLogs: string
    noLogFound: string
    logLoadFailed: string
    loadingSummary: string
    hasSummary: string
    stepOf: (position: number, count: number) => string
    summaryLoadFailed: string
    summaryTab: string
    /** Names the cards under the graph, one for each step that wrote a summary. */
    stepSummaries: string
    logsTab: string
    scriptTab: string
    openSubworkflow: string
    statusLabel: (status: string) => string
    statusReason: (reason: string | undefined | null) => string | undefined
    /** A run's general log, beside its summary. */
    generalLog: string
    previousStep: string
    nextStep: string
    /** The view toggle: the graph, and the list of jobs and steps. */
    graphView: string
    treeView: string
    summary: string
    dependsOn: string
    subworkflow: string
    annotations: string
    annotationType: { error: string; warning: string; notice: string }
    /** Names the annotations' toggle for a screen reader, in place of its count badges, such as
     *  "Annotations: 2 errors, 1 warning". It starts with `annotations`, the toggle's visible text. */
    annotationsLabel: (counts: { error: number; warning: number; notice: number }) => string
    /** Where an annotation came from, under its message. */
    annotationSource: (job: string, step: string) => string
    /** A step without a name, numbered from 0 as the run reports it. */
    stepNumber: (index: number) => string
    /** How many warnings: the title of a run's list of warnings, and the name of the mark on a job
     *  or step they're about, such as "2 warnings". */
    warningCount: (count: number) => string
    /** The link from a warning to the page that explains it, when it has one. */
    warningAbout: string
  }
  jobActions: {
    openSubworkflowLogs: string
    openOriginalWorkflow: string
    openInNewGraph: string
  }
  /** The visual editor's text a host translates; the editor fills in the rest in English. */
  graphEditor: Partial<GraphEditorText>
  /** The access drawer's text, over its English defaults. */
  access: Partial<AccessText>
  inputsEditor: Partial<InputsEditorText>
  /** The file explorer's text a host translates; it fills in the rest in English. */
  fileExplorer: Overrides<FileExplorerText>
  form: {
    /** Under a field the form needs a value in. */
    required: string
    /** Under a field the server rejected without saying why. */
    checkValue: string
    invalidDuration: string
    durationOutOfRange: (min: string, max: string) => string
    durationBelowMin: (min: string) => string
    /** A repeated wizard page's copy, numbered from 1. */
    copyTitle: (title: string, number: number) => string
    addCopy: (title: string) => string
    removeCopy: (title: string) => string
    /** A wizard's steps: what its list of them is called. */
    steps: string
    /** Where a wizard is, numbered from 1. */
    stepOf: (number: number, total: number) => string
    /** The button that opens the list of a wizard's steps. */
    allSteps: string
    /** A step before the current one. */
    stepDone: string
    /** A step with a value to fix. */
    stepNeedsAttention: string
    /** A wizard's last button, unless its config names its own. */
    runWizard: string
    fixErrorsToContinue: string
    stepFailed: string
    /** A step's name in the list of steps, numbered from 1. */
    stepLabel: (number: number, title: string) => string
  }
  /** A compact relative time ("5m", "3h"), which reads as a date after a week. */
  time: {
    now: string
    minutes: (n: number) => string
    hours: (n: number) => string
    days: (n: number) => string
    /** @deprecated A compact time reads as a date once it is a week away, so no longer counts in years. */
    years: (n: number) => string
    /** A compact time still to come, such as "in 5m"; `label` is one of the counts above. */
    inFuture: (label: string) => string
    /** A compact time a week or more away, such as "Sep 4"; by default with the year only while
     *  it isn't this year. `locale` is UIProvider's, when the host gives one. */
    date: (date: Date, locale?: string) => string
  }
  /** Key names in a shortcut, as keycaps carry them off an Apple keyboard, such as
   *  "Strg" for Control in German. An Apple keyboard shows its symbols: ⌘ ⌥ ⇧ ⌃. */
  keys: {
    ctrl: string
    alt: string
    shift: string
    meta: string
    enter: string
    escape: string
    space: string
    tab: string
    backspace: string
    delete: string
  }
  /** A run's status in words, beside its icon: one ended in an error or a fault reads as
   *  failed, and one skipped after a failure as skipped. */
  runStatus: {
    queued: string
    running: string
    canceling: string
    completed: string
    warning: string
    failed: string
    canceled: string
    skipped: string
    notRun: string
  }
  chart: {
    /** The row under a chart's tooltip that sums its series. */
    total: string
    /** The series that sums a chart's series past the eighth. */
    other: string
  }
  list: {
    moreActions: string
    /** A toolbar toggle's name in the overflow menu, where a row can't be pressed. */
    labelName: string
    labelEmail: string
    labelUsername: string
    labelUid: string
    labelId: string
    labelUrl: string
    couldNotLoad: (noun: string) => string
    /** What `ListError` says under its heading when the host gives no message of its own. */
    couldNotLoadHint: string
    /** What `ListError` names when the host gives no noun. */
    data: string
    /** A list's size, as `ListCount` shows it; `count` is formatted and `noun` agrees with it. */
    count: (count: string, noun: string) => string
    /** How many rows a filter left, of how many. */
    matchCount: (matches: string, total: string, nounPlural: string) => string
    displayOptions: string
    /** Names the Display menu's switch between a list's layouts, such as rows and a board. */
    layout: string
    grouping: string
    /** The Display menu's line that collapses or expands every group the list shows. */
    groups: string
    ordering: string
    orderDefault: string
    orderFavorites: string
    ascending: string
    descending: string
    /** On a phone, where a list's other columns stack under its name, the header's control that
     *  shows and changes the order, as Display options' Ordering does. `order` is the order's
     *  label, such as a column's. It shows without `direction`, which its arrow shows; a screen
     *  reader hears it with one. */
    sortedBy: (order: string, direction?: 'ascending' | 'descending') => string
    /** `sortedBy` for the list's own default order, as one phrase, such as "Default order",
     *  rather than `orderDefault` set into `sortedBy` as if it were a column's name. */
    sortedByDefault: (direction?: 'ascending' | 'descending') => string
    columnHeaders: string
    showColumnHeaders: string
    /** The header checkbox that ticks every row, or clears them all. */
    selectAll: string
    showActions: string
    showRowActions: string
    alwaysShowActions: string
    alwaysShowRowActions: string
    displayProperties: string
    pinnedActions: string
    pinnedActionsHelp: string
    none: string
    searchOptions: string
    /** `atLeast`: `total` is a floor, because the count was capped and more rows follow. */
    pager: (start: number, end: number, total: number, atLeast: boolean) => string
    perPage: string
    paginationPrevious: string
    paginationNext: string
    pagination: string
    /** A numbered page's name in `Pagination`, counting from 1. */
    page: (page: number) => string
    /** Where the page sits, for `Pagination` too narrow for page numbers: it shows "5 / 12". */
    pageOfTotal: (page: number, total: number) => string
    removeSearchTerm: (term: string) => string
    /** The search button's name while a query it holds narrows the list, its field closed. */
    searchActive: (label: string) => string
  }
  /** The chip row of a list's active filters, its Filter menu and its pickers. Field and option
   *  labels come from the host's fields, already translated. */
  filters: {
    /** The button at the end of the chip row that adds one, and the Filter menu's heading. */
    addFilter: string
    /** Names the Filter menu's search over the fields. */
    searchFields: string
    /** Names the chip row. */
    activeFilters: string
    /** The toolbar's Filter button, saying how many filters are on, since its dot is only seen. */
    filterButton: (count: number) => string
    /** A required or pinned filter's value while it has none. */
    any: string
    /** The value part of a chip just added, until a value is chosen. */
    pending: string
    /** A condition, worded for how many values follow it: "is" / "is any of". */
    operator: (op: FilterOperator, count: number) => string
    /** After the first values shown in a chip: "+3". */
    more: (count: number) => string
    /** At phone width, the chip that opens every filter in a sheet: "+3 filters". */
    overflow: (count: number) => string
    /** The sheet's title. */
    sheetTitle: string
    /** Names a chip's remove button. */
    remove: (field: string) => string
    /** Names a chip, read as a sentence. */
    chip: (field: string, operator: string, values: string) => string
    /** Names a chip's field part, which picks another field. */
    changeField: (field: string) => string
    /** Names a chip's condition part. */
    changeOperator: (operator: string) => string
    /** Names a chip's value part. */
    changeValue: (values: string) => string
    /** Joins the values a chip lists. */
    list: (values: string[]) => string
    /** A relative date preset: `today`, `month` (so far), `year` (so far), `all` (every date),
     *  any `-Nd` (the last N days) or any `-Nh` (the last N hours). */
    datePreset: (preset: string) => string
    /** At phone width, the toggle that shows a quick filter's other options: "+3 more". */
    quickMore: (count: number) => string
    /** The date picker's entry that picks days on a calendar. */
    customDate: string
    /** Two days a filter spans. */
    between: (from: string, to: string) => string
    /** A day in a chip; by default without the year while it is this year. `locale` is
     *  UIProvider's, when the host gives one. */
    formatDate: (date: Date, locale?: string) => string
    /** The text picker's hint. */
    textPlaceholder: string
    /** A yes-or-no filter's values. */
    yes: string
    no: string
  }
  /** `ErrorPage`'s words: the way back, and a title and description for each kind of error. */
  errorPage: {
    /** Back through the browser's history. */
    back: string
    /** Back to the app's start, when there is no history to go back through. */
    home: string
    /** The title when nothing more is known about the error. */
    error: string
    /** The title for a status no kind covers, such as 418. */
    statusTitle: (status: string) => string
    titles: Record<ErrorPageKind, string>
    descriptions: Record<ErrorPageKind, string>
  }
}

/** What went wrong, which picks an `ErrorPage`'s words: `notFound` (404),
 *  `forbidden` (403), `unauthenticated` (401), `unavailable` (502, 503 and
 *  504), `server` (any other 5xx), and `network` for a request that never
 *  reached the server. */
export type ErrorPageKind =
  | 'notFound'
  | 'forbidden'
  | 'unauthenticated'
  | 'unavailable'
  | 'server'
  | 'network'

/** What a host passes to translate the strings: any group, any string in it, at any depth.
 *  A string it leaves out stays in English. */
const OPERATOR_WORDS: Record<FilterOperator, (count: number) => string> = {
  is: (n) => (n > 1 ? 'is any of' : 'is'),
  isNot: (n) => (n > 1 ? 'is none of' : 'is not'),
  includesAll: (n) => (n > 1 ? 'includes all of' : 'includes'),
  after: () => 'is after',
  before: () => 'is before',
  between: () => 'is between',
  contains: () => 'contains',
  notContains: () => 'does not contain',
  isSet: () => 'is set',
  isNotSet: () => 'is not set',
}
// Built once per locale; the browser's without one.
const dayFormats = new Map<
  string | undefined,
  { short: Intl.DateTimeFormat; medium: Intl.DateTimeFormat }
>()
function dayFormat(locale: string | undefined) {
  let formats = dayFormats.get(locale)
  if (!formats) {
    formats = {
      short: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }),
      medium: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
    }
    dayFormats.set(locale, formats)
  }
  return formats
}

export type UIStringOverrides = Overrides<UIStrings>

type Overrides<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown
    ? T[K]
    : T[K] extends readonly unknown[]
      ? T[K]
      : T[K] extends object
        ? Overrides<T[K]>
        : T[K]
}

const isGroup = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Overrides laid over the defaults group by group, so a host can translate one string of a
// nested group, such as the file explorer's preview, without restating the rest of it.
export function mergeStrings<T>(defaults: T, overrides: unknown): T {
  if (!isGroup(overrides) || !isGroup(defaults)) {
    return defaults
  }
  const merged: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      continue
    }
    merged[key] = isGroup(value) && isGroup(merged[key]) ? mergeStrings(merged[key], value) : value
  }
  return merged as T
}

const DEFAULT_STRINGS: UIStrings = {
  modal: {
    creating: 'Creating…',
    addDescription: 'Add description…',
    advanced: 'Advanced',
    favorite: 'Favorite',
    favorited: 'Favorited',
    favoriteHintOn: "Your item will be favorited when it's created",
    favoriteHintOff: "Favorite your item when it's created",
  },
  common: {
    back: 'Back',
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
    clear: 'Clear',
    delete: 'Delete',
    download: 'Download',
    retry: 'Retry',
    reset: 'Reset',
    apply: 'Apply',
    dismiss: 'Dismiss',
    notifications: 'Notifications',
    rename: 'Rename',
    share: 'Share',
    send: 'Send',
    filter: 'Filter',
    all: 'All',
    loading: 'Loading…',
    loadMore: 'Load more',
    showMore: 'Show more',
    showLess: 'Show less',
    previous: 'Previous',
    next: 'Next',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    moveUp: 'Move up',
    moveDown: 'Move down',
    undo: 'Undo',
    redo: 'Redo',
    duplicate: 'Duplicate',
    copied: 'Copied',
    copyToClipboard: 'Copy to clipboard',
    copiedToClipboard: 'Copied to clipboard',
    copyFailed: "Couldn't copy to the clipboard",
    copyThing: (label) => `Copy ${label}`,
    copiedThing: (label) => `Copied ${label}`,
    copyThingFailed: (label) => `Couldn't copy ${label}`,
    countOverflow: (max) => `${max}+`,
    noValue: 'None',
    invalidName: 'Use letters, numbers, dashes, and underscores.',
    invalidNumber: 'Use a number.',
    copy: 'Copy',
    showValue: 'Show value',
    hideValue: 'Hide value',
    expand: 'Expand',
    collapse: 'Collapse',
    showHiddenFields: 'Show hidden fields',
    add: 'Add',
    create: 'Create',
    showHiddenFieldsHint:
      "Includes fields hidden by default because they're specific to each resource, such as name and group.",
    jsonHasErrors: 'JSON has errors, please fix before saving',
    remove: 'Remove',
    sort: 'Sort',
    userAvatar: 'User avatar',
    presence: { online: 'online', offline: 'offline', busy: 'busy', away: 'away' },
    withPresence: (name, presence) => `${name}, ${presence}`,
    moreInfo: 'More information',
    actions: 'Actions',
    edit: 'Edit',
    submit: 'Submit',
    search: 'Search',
    clearSearch: 'Clear search',
    filterPlaceholder: 'Filter…',
    breadcrumb: 'Breadcrumb',
    showFullPath: 'Show full path',
    yes: 'Yes',
    no: 'No',
    opensInNewTab: '(opens in a new tab)',
    codeEditor: 'Code editor',
    codeOf: (language) => (language ? `${language} code` : 'Code'),
    readOnlyText: 'This text is read-only.',
    resizePanel: 'Resize panel',
    panelWidth: (px) => `${px} pixels wide`,
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    updated: (ago) => `Updated ${ago}`,
    moreCount: (count) => `${count} more`,
    copySelection: 'Copy selection',
    hiddenValue: 'Hidden value',
  },
  dropdown: {
    select: (type) => `Select ${type}`,
    noOptionsFound: 'No options found',
    searching: 'Searching…',
    showOptions: 'Show options',
    add: (text) => `Add “${text}”`,
    create: (text) => `Create “${text}”`,
    suggested: 'Suggested',
    limitReached: (max) => `Up to ${max}`,
    removeValue: (label) => `Remove ${label}`,
  },
  datePicker: {
    pickDate: 'Pick a date',
    time: 'Time',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    typeDate: 'Type a date',
    invalidDate: 'Not a date that can be chosen',
  },
  colorInput: {
    pick: (name) => (name ? `Pick ${name.toLowerCase()}` : 'Pick a color'),
    invalid: 'Enter a hex color, such as #1f6feb.',
  },
  imageUpload: {
    change: (name) => `Change the image for ${name}`,
    edit: 'Edit image',
    upload: 'Upload image',
    replace: 'Upload a new image',
    remove: 'Remove image',
    cropTitle: (name) => `Image for ${name}`,
    cropHint: 'Drag to move it, and zoom to fit.',
    cropArea: 'Image to crop. Use the arrow keys to move it, and plus or minus to zoom.',
    zoom: 'Zoom',
    save: 'Save image',
    unreadable: "This file couldn't be opened as an image.",
    failed: "The image couldn't be saved. Try again.",
  },
  oneTimeCode: {
    character: (position, length) => `Character ${position} of ${length}`,
  },
  theme: {
    appearance: 'Appearance',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    editing: 'Colors for',
    presets: 'Presets',
    base: 'Background',
    accent: 'Accent',
    swap: 'Swap background and accent',
    contrast: 'Contrast',
    contrastHelp: 'Separates surfaces and strengthens text. Text always meets WCAG AA.',
    customSidebar: 'Custom sidebar',
    sidebarBase: 'Sidebar background',
    sidebarAccent: 'Sidebar accent',
    code: 'Code',
    codeStyle: (style) =>
      ({ balanced: 'Balanced', vivid: 'Vivid', muted: 'Muted', mono: 'Monochrome' })[style],
    copy: 'Copy theme',
    copied: 'theme',
    import: 'Import theme',
    importLabel: 'Theme to import',
    importPlaceholder: 'Paste a copied theme',
    apply: 'Apply',
    reset: 'Reset',
    importError: (code, path) =>
      ({
        json: 'This isn’t a copied theme: it isn’t valid JSON.',
        version: 'This theme is from a version this app can’t read.',
        shape: `This theme is incomplete${path ? ` at ${path}` : ''}.`,
        color: `${path} isn’t a color.`,
        range: `${path} is out of range.`,
      })[code],
    preview: 'Preview',
    previewNav: ['Home', 'Runs', 'Settings'],
    previewHeading: 'Weekly report',
    previewBody: 'Twelve runs finished and two need attention.',
    previewMuted: 'Updated a minute ago',
    previewLink: 'View runs',
    previewButton: 'Run again',
    previewSearch: 'Search runs',
    previewPassed: 'Passed',
    previewFailed: 'Failed',
  },
  logviewer: {
    error: 'Error:',
    warning: 'Warning:',
    notice: 'Notice:',
    top: 'Top',
    clearSelection: 'Clear selection',
    copyLines: (count) => (count === 1 ? 'Copy 1 line' : `Copy ${count} lines`),
    copyAll: 'Copy all',
    hideDebug: 'Hide debug',
    showDebug: 'Show debug',
    filterLogs: 'Filter logs',
    beginningOfLog: 'Beginning of log',
    loadingOlderEntries: 'Loading older entries…',
    loadOlderEntries: 'Load older entries',
    timeRange: 'Time range',
    timeRangeActive: 'Time range active',
    timeRangeOn: 'ON',
    filterByTimeRange: 'Filter by time range',
    timeRangeHelp:
      'Times are interpreted in your local timezone. Applying a range re-queries the log source and replaces what is loaded. Setting an end time stops live tailing until you clear it.',
    timeRangeFrom: 'From',
    timeRangeTo: 'To',
    invalidStartTime: 'Start time is not a valid date.',
    invalidEndTime: 'End time is not a valid date.',
    endBeforeStart: 'End time must be after the start time.',
    endInFuture: 'End time cannot be in the future.',
    follow: 'Follow',
    following: 'Following',
    selectLine: (line) => `Select line ${line}`,
  },
  dag: {
    workflow: 'Workflow',
    run: 'Run',
    status: 'Status',
    runtime: 'Runtime',
    submitted: 'Submitted',
    resetView: 'Reset view',
    previousGraph: 'Back to the previous graph',
    nextGraph: 'Forward to the next graph',
    matrixOf: (name) => `Matrix: ${name}`,
    jobCount: (count) => (count === 1 ? '1 job' : `${count} jobs`),
    loadingLogs: 'Loading logs',
    noLogFound: 'No log found',
    logLoadFailed: 'Log could not be loaded',
    loadingSummary: 'Loading summary',
    hasSummary: 'Step summary',
    stepOf: (position, count) => `Step ${position} of ${count}`,
    summaryLoadFailed: 'Summary could not be loaded',
    summaryTab: 'Summary',
    stepSummaries: 'Step summaries',
    logsTab: 'Logs',
    scriptTab: 'Script',
    openSubworkflow: 'Open Subworkflow',
    statusLabel: (status) => status,
    statusReason: () => undefined,
    generalLog: 'General log',
    previousStep: 'Previous step',
    nextStep: 'Next step',
    graphView: 'DAG',
    treeView: 'Tree',
    summary: 'Summary',
    dependsOn: 'depends on:',
    subworkflow: '(subworkflow)',
    annotations: 'Annotations',
    annotationType: { error: 'Error', warning: 'Warning', notice: 'Notice' },
    annotationsLabel: ({ error, warning, notice }) =>
      `Annotations: ${[
        [error, 'error', 'errors'],
        [warning, 'warning', 'warnings'],
        [notice, 'notice', 'notices'],
      ]
        .filter(([count]) => count)
        .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
        .join(', ')}`,
    annotationSource: (job, step) => `in ${job} → ${step}`,
    stepNumber: (index) => `step ${index}`,
    warningCount: (count) => (count === 1 ? '1 warning' : `${count} warnings`),
    warningAbout: 'About this warning',
  },
  jobActions: {
    openSubworkflowLogs: 'Open subworkflow logs',
    openOriginalWorkflow: 'Open original workflow',
    openInNewGraph: 'Open in new graph',
  },
  graphEditor: {},
  access: {},
  inputsEditor: {},
  fileExplorer: {},
  form: {
    required: 'Enter a value.',
    checkValue: 'Check this value.',
    invalidDuration: 'Enter a duration as DD-HH:MM:SS or HH:MM:SS.',
    durationOutOfRange: (min, max) => `Must be between ${min} and ${max}.`,
    durationBelowMin: (min) => `Must be at least ${min}.`,
    copyTitle: (title, number) => `${title} ${number}`,
    addCopy: (title) => `+ Add ${title}`,
    removeCopy: (title) => `Remove ${title}`,
    steps: 'Steps',
    stepOf: (number, total) => `Step ${number} of ${total}`,
    allSteps: 'All steps',
    stepDone: 'Done',
    stepNeedsAttention: 'Needs a fix',
    runWizard: 'Execute',
    fixErrorsToContinue: 'Please fix errors before proceeding',
    stepFailed: 'An error occurred',
    stepLabel: (number, title) => `Step ${number}: ${title}`,
  },
  time: {
    now: 'now',
    minutes: (n) => `${n}m`,
    hours: (n) => `${n}h`,
    days: (n) => `${n}d`,
    years: (n) => `${n}y`,
    inFuture: (label) => `in ${label}`,
    date: (date, locale) =>
      dayFormat(locale)[
        date.getFullYear() === new Date().getFullYear() ? 'short' : 'medium'
      ].format(date),
  },
  keys: {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    meta: 'Meta',
    enter: 'Enter',
    escape: 'Esc',
    space: 'Space',
    tab: 'Tab',
    backspace: 'Backspace',
    delete: 'Delete',
  },
  runStatus: {
    queued: 'Queued',
    running: 'Running',
    canceling: 'Canceling',
    completed: 'Completed',
    warning: 'Warning',
    failed: 'Failed',
    canceled: 'Canceled',
    skipped: 'Skipped',
    notRun: 'Not run',
  },
  chart: {
    total: 'Total',
    other: 'Other',
  },
  list: {
    moreActions: 'More actions',
    labelName: 'name',
    labelEmail: 'email',
    labelUsername: 'username',
    labelUid: 'UID',
    labelId: 'ID',
    labelUrl: 'URL',
    couldNotLoad: (noun) => `Couldn't load ${noun}`,
    couldNotLoadHint: 'Something went wrong. Try again in a moment.',
    data: 'data',
    count: (count, noun) => `${count} ${noun}`,
    matchCount: (matches, total, nounPlural) => `${matches} of ${total} ${nounPlural}`,
    displayOptions: 'Display options',
    layout: 'Layout',
    grouping: 'Grouping',
    groups: 'Groups',
    ordering: 'Ordering',
    orderDefault: 'Default',
    orderFavorites: 'Favorites',
    ascending: 'Ascending',
    descending: 'Descending',
    sortedBy: (order, direction) =>
      direction ? `Sorted by ${order}, ${direction}` : `Sorted by ${order}`,
    sortedByDefault: (direction) => (direction ? `Default order, ${direction}` : 'Default order'),
    columnHeaders: 'Column headers',
    showColumnHeaders: 'Show column headers',
    selectAll: 'Select all',
    showActions: 'Show actions',
    showRowActions: 'Show row actions',
    alwaysShowActions: 'Always show actions',
    alwaysShowRowActions: 'Always show row actions',
    displayProperties: 'Display properties',
    pinnedActions: 'Pinned actions',
    pinnedActionsHelp:
      "Pinned actions show as quick buttons on the right of each row (on hover), alongside the ⋯ menu. Each only appears on rows where that action is available, so a row's buttons vary by its type and status.",
    none: 'None',
    searchOptions: 'Search options…',
    pager: (start, end, total, atLeast) => `${start}–${end} of ${total}${atLeast ? '+' : ''}`,
    perPage: 'Per page',
    paginationPrevious: 'Previous',
    paginationNext: 'Next',
    pagination: 'Pagination',
    page: (page) => `Page ${page}`,
    pageOfTotal: (page, total) => `Page ${page} of ${total}`,
    removeSearchTerm: (term) => `Remove filter ${term}`,
    searchActive: (label) => `${label}, on`,
  },
  filters: {
    addFilter: 'Filter',
    searchFields: 'Filter by…',
    activeFilters: 'Active filters',
    filterButton: (count) => (count > 0 ? `Filter, ${count} on` : 'Filter'),
    any: 'Any',
    pending: 'Choose…',
    operator: (op, count) => OPERATOR_WORDS[op](count),
    more: (count) => `+${count}`,
    overflow: (count) => `+${count} ${count === 1 ? 'filter' : 'filters'}`,
    sheetTitle: 'Filters',
    remove: (field) => `Remove ${field} filter`,
    chip: (field, operator, values) => [field, operator, values].filter(Boolean).join(' '),
    changeField: (field) => `Field: ${field}`,
    changeOperator: (operator) => `Condition: ${operator}`,
    changeValue: (values) => `Value: ${values}`,
    list: (values) => values.join(', '),
    datePreset: (preset) => {
      const named: Record<string, string> = {
        today: 'Today',
        month: 'This month',
        year: 'This year',
        all: 'All time',
      }
      const days = preset.match(/^-(\d+)d$/)?.[1]
      const hours = preset.match(/^-(\d+)h$/)?.[1]
      // One reads as a word, as hosts' plural messages have it: "Last day", "Last 7 days".
      const last = (count: string, one: string, other: string) =>
        Number(count) === 1 ? `Last ${one}` : `Last ${Number(count).toLocaleString('en')} ${other}`
      return (
        named[preset] ??
        (days ? last(days, 'day', 'days') : hours ? last(hours, 'hour', 'hours') : preset)
      )
    },
    quickMore: (count) => `+${count} more`,
    customDate: 'Custom…',
    between: (from, to) => `${from} – ${to}`,
    formatDate: (date, locale) =>
      dayFormat(locale)[
        date.getFullYear() === new Date().getFullYear() ? 'short' : 'medium'
      ].format(date),
    textPlaceholder: 'Type, then press Enter',
    yes: 'Yes',
    no: 'No',
  },
  errorPage: {
    back: 'Back',
    home: 'Back to home',
    error: 'This page couldn’t load',
    statusTitle: (status) => `Error ${status}`,
    titles: {
      notFound: 'Could not find the requested page',
      forbidden: 'No access',
      unauthenticated: 'Signed out',
      unavailable: 'The service is unreachable',
      server: 'Something went wrong on our side',
      network: 'You’re offline',
    },
    descriptions: {
      notFound: 'This page does not exist, or you do not have access to it.',
      forbidden: 'You can’t open this. Ask an administrator for access.',
      unauthenticated: 'Your session ended. Sign in again to pick up where you were.',
      unavailable: 'The server isn’t answering right now. Try again in a moment.',
      server: 'The page couldn’t load because of an error on the server.',
      network: 'The server couldn’t be reached. Check your connection and try again.',
    },
  },
}

const StringsContext = createContext<UIStrings>(DEFAULT_STRINGS)

export function useStrings(): UIStrings {
  return useContext(StringsContext)
}

/** UIProvider's `strings` alone, for a host that can't render UIProvider, such as one without a
 *  DOM. Overrides lay over the English defaults, not over an outer provider's strings. */
export function UIStringsProvider({
  strings,
  children,
}: {
  strings?: UIStringOverrides | undefined
  children: ReactNode
}) {
  const merged = useMerged(() => mergeStrings(DEFAULT_STRINGS, strings), strings)
  return <StringsContext value={merged}>{children}</StringsContext>
}
