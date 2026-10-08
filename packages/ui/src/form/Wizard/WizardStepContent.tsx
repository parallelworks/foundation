import type { TSetFormDirty } from '../Form'
import { FieldsFromOptions } from '../Form'
import { EditingScope, useFormEditing } from '../formEditing'
import type { WizardStepContentProps } from './types'

export function WizardStepContent({
  currentStep,
  stepConfig,
  flatten = true,
  values,
  setFormDirty,
  setFieldValue,
  setFieldTouched,
  fieldNamePrefix = '',
  copy,
  ...fieldsProps
}: WizardStepContentProps & {
  setFormDirty: TSetFormDirty
  setFieldValue: (field: string, value: unknown, shouldValidate?: boolean) => void
  setFieldTouched: (field: string, touched?: boolean, shouldValidate?: boolean) => void
  flatten?: boolean | undefined
}) {
  const editing = useFormEditing()
  if (!stepConfig.options) {
    return null
  }
  const path = editing ? [...editing.parent, currentStep] : null
  // A repeated page's copy keeps its fields in its row of the page's list, and only the first copy
  // edits them, as only a list's first row edits its template.
  const parentInfo =
    copy !== undefined
      ? {
          parentName: currentStep,
          fieldNamePrefix: `${fieldNamePrefix}${currentStep}[${copy}].`,
          arrayIndex: copy,
        }
      : flatten === false
        ? { parentName: currentStep, fieldNamePrefix: `${fieldNamePrefix}${currentStep}.` }
        : fieldNamePrefix
          ? { parentName: fieldNamePrefix.slice(0, -1), fieldNamePrefix }
          : undefined

  const content = (
    <div className="mb-4 w-full">
      {stepConfig.title && (
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--theme-app)' }}>
          {stepConfig.title}
        </h2>
      )}
      {stepConfig.description && (
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--theme-muted-text-color)' }}>
          {stepConfig.description}
        </p>
      )}
      <EditingScope editing={editing} path={path}>
        <FieldsFromOptions
          key={copy === undefined ? currentStep : `${currentStep}[${copy}]`}
          options={stepConfig.options}
          values={values}
          setFormDirty={setFormDirty}
          setFieldValue={setFieldValue}
          setFieldTouched={setFieldTouched}
          {...(parentInfo ? { parentInfo } : {})}
          {...fieldsProps}
        />
      </EditingScope>
    </div>
  )
  return editing && path ? <editing.Row path={path}>{content}</editing.Row> : content
}
