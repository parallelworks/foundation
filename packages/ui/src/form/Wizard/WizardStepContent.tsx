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
          key={currentStep}
          options={stepConfig.options}
          values={values}
          setFormDirty={setFormDirty}
          setFieldValue={setFieldValue}
          setFieldTouched={setFieldTouched}
          {...(flatten === false
            ? {
                parentInfo: {
                  parentName: currentStep,
                  fieldNamePrefix: `${currentStep}.`,
                },
              }
            : {})}
          {...fieldsProps}
        />
      </EditingScope>
    </div>
  )
  return editing && path ? <editing.Row path={path}>{content}</editing.Row> : content
}
