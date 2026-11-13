// Faster to smarter, the same for every model: a model runs a level at the nearest one it takes.
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export type EffortLevel = (typeof EFFORT_LEVELS)[number]

/** The level a session runs at until one is picked. */
export const DEFAULT_EFFORT: EffortLevel = 'high'

export function isEffortLevel(value: string | null | undefined): value is EffortLevel {
  return EFFORT_LEVELS.some((level) => level === value)
}
