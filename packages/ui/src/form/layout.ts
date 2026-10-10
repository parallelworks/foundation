export type LayoutBreakpoint = 'base' | 'sm' | 'md' | 'lg'
export type ResponsiveLayout<T> = T | Partial<Record<LayoutBreakpoint, T>>
export type LayoutTracks = number | number[]
export type LayoutGap = 'none' | 'sm' | 'md' | 'lg'

interface LayoutPlacement {
  span?: ResponsiveLayout<number>
  css?: string
}

export type FormLayoutNode =
  | (LayoutPlacement & { type: 'field'; field: string })
  | (LayoutPlacement & {
      type: 'stack'
      gap?: LayoutGap
      children: FormLayoutNode[]
    })
  | (LayoutPlacement & {
      type: 'grid'
      columns: ResponsiveLayout<LayoutTracks>
      align?: 'independent' | 'rows'
      gap?: LayoutGap
      children: FormLayoutNode[]
    })
  | (LayoutPlacement & {
      type: 'section'
      label: string
      description?: string
      gap?: LayoutGap
      children: FormLayoutNode[]
    })

export interface FormLayoutIssue {
  path: (string | number)[]
  code: 'invalid_node' | 'unknown_field' | 'duplicate_field'
}

export const layoutLimits = {
  depth: 64,
  nodes: 1024,
  children: 128,
  css: 65536,
  label: 256,
  description: 4096,
  field: 256,
} as const
export const layoutBreakpoints = ['base', 'sm', 'md', 'lg'] as const

export function responsiveLayoutValues<T>(
  value: ResponsiveLayout<T> | undefined,
  fallback: T,
): Record<LayoutBreakpoint, T> {
  const responsive = isRecord(value) ? (value as Partial<Record<LayoutBreakpoint, T>>) : undefined
  let current = responsive ? fallback : ((value as T | undefined) ?? fallback)
  return Object.fromEntries(
    layoutBreakpoints.map((key) => {
      current = responsive?.[key] ?? current
      return [key, current]
    }),
  ) as Record<LayoutBreakpoint, T>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12

function tracks(value: unknown): boolean {
  return (
    count(value) ||
    (Array.isArray(value) &&
      value.length >= 1 &&
      value.length <= 12 &&
      value.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0))
  )
}

function responsive(value: unknown, valid: (value: unknown) => boolean): boolean {
  return (
    valid(value) ||
    (isRecord(value) &&
      Object.keys(value).length > 0 &&
      Object.entries(value).every(
        ([key, entry]) =>
          layoutBreakpoints.some((breakpoint) => breakpoint === key) && valid(entry),
      ))
  )
}

/** Invalid layouts fall back as a whole, so a typo cannot hide an input or render it twice. */
export function resolveFormLayout(value: unknown, fieldNames: readonly string[]) {
  const issues: FormLayoutIssue[] = []
  const used = new Set<string>()
  const available = new Set(fieldNames)
  const ancestors = new Set<object>()
  let visited = 0
  let cssLength = 0
  let exhausted = false
  const visit = (node: unknown, path: (string | number)[], depth: number): boolean => {
    const invalid = () => {
      issues.push({ path, code: 'invalid_node' })
      return false
    }
    if (++visited > layoutLimits.nodes) {
      exhausted = true
      return invalid()
    }
    if (!isRecord(node) || depth > layoutLimits.depth || ancestors.has(node)) return invalid()
    const type = node['type']
    const allowed = ['type', 'span', 'css']
    if (node['css'] !== undefined && (typeof node['css'] !== 'string' || node['css'].length > 4096))
      return invalid()
    cssLength += typeof node['css'] === 'string' ? node['css'].length : 0
    if (cssLength > layoutLimits.css) {
      exhausted = true
      return invalid()
    }
    if (node['span'] !== undefined && !responsive(node['span'], count)) return invalid()
    if (type === 'field') {
      allowed.push('field')
      if (Object.keys(node).some((key) => !allowed.includes(key))) return invalid()
      const name = node['field']
      if (
        typeof name !== 'string' ||
        name.length > layoutLimits.field ||
        !/^[a-zA-Z0-9_-]+$/.test(name)
      )
        return invalid()
      if (!available.has(name)) issues.push({ path, code: 'unknown_field' })
      else if (used.has(name)) issues.push({ path, code: 'duplicate_field' })
      used.add(name)
      return true
    }
    if (type !== 'stack' && type !== 'grid' && type !== 'section') return invalid()
    if (!Array.isArray(node['children']) || node['children'].length > layoutLimits.children)
      return invalid()
    allowed.push('children', 'gap')
    if (type === 'grid') {
      allowed.push('columns', 'align')
      if (!responsive(node['columns'], tracks)) return invalid()
      if (
        node['align'] !== undefined &&
        node['align'] !== 'independent' &&
        node['align'] !== 'rows'
      )
        return invalid()
      if (
        node['align'] === 'rows' &&
        (!Array.isArray(node['children']) ||
          node['children'].some((child) => !isRecord(child) || child['type'] !== 'section'))
      )
        return invalid()
    }
    if (type === 'section') {
      allowed.push('label', 'description')
      if (
        typeof node['label'] !== 'string' ||
        !node['label'] ||
        node['label'].length > layoutLimits.label
      )
        return invalid()
      if (
        node['description'] !== undefined &&
        (typeof node['description'] !== 'string' ||
          node['description'].length > layoutLimits.description)
      )
        return invalid()
    }
    if (Object.keys(node).some((key) => !allowed.includes(key))) return invalid()
    if (
      node['gap'] !== undefined &&
      (typeof node['gap'] !== 'string' || !['none', 'sm', 'md', 'lg'].includes(node['gap']))
    ) {
      return invalid()
    }
    ancestors.add(node)
    for (let index = 0; index < node['children'].length && !exhausted; index++) {
      visit(node['children'][index], [...path, 'children', index], depth + 1)
    }
    ancestors.delete(node)
    return true
  }
  if (value !== undefined) visit(value, [], 0)
  const layout = value !== undefined && issues.length === 0 ? (value as FormLayoutNode) : undefined
  return { layout, remaining: fieldNames.filter((name) => !layout || !used.has(name)), issues }
}
