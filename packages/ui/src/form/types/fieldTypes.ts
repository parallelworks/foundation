import type { FormLayoutNode } from '../layout'
import type { StepFieldConfig, WizardConfig } from '../Wizard/types'

export type LabelPosition = 'left' | 'top'

/** A flag a field may set literally or as an expression the engine resolves. */
export type FieldFlag = string | boolean

/** NOT part of the workflow JSON schema — added by the form system at runtime. */
export interface RuntimeFieldExtensions {
  name?: string // Added at runtime
  description?: string
  showInUI?: boolean
  noCollapse?: boolean
  enable_if?: string | boolean
  show_if?: string
  show_if_not?: string
  depends_on?: string
  secondaryField?: string | string[]
  one_must_be_true?: boolean
  computeOn?: boolean
  labelPosition?: LabelPosition
  /** Path of another field; when its value changes, this field's value is cleared. */
  resetOnChange?: string
  options?: unknown // Runtime-provided options override
}

export interface BaseField extends RuntimeFieldExtensions {
  type: string
  label?: string
  tooltip?: string | string[]
  hidden?: FieldFlag
  optional?: FieldFlag
  ignore?: FieldFlag
  collapsed?: boolean
  disabled?: boolean
  default?: unknown
  /** Pixels, or a share of the row such as '50%'; inputs whose widths fit share a row. */
  width?: number | string
  /** Under the input before it, in that input's column. */
  'anchor-below'?: boolean
}

type AnyField = BaseField
type StepField = Omit<BaseField, 'type' | 'description'> & StepFieldConfig

export interface DynamicFormSchema {
  $meta?: {
    labelPosition?: LabelPosition
    spaceCompact?: boolean
    wizard?: WizardConfig
    layout?: FormLayoutNode
  }
  [fieldName: string]: AnyField | StepField | DynamicFormSchema['$meta'] | undefined
}
