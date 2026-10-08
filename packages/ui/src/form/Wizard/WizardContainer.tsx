import { type FormikValues, useFormikContext } from 'formik'
import { useCallback } from 'react'
import { useFormEditing } from '../formEditing'
import { getValueUsingPath } from '../utils/getValueUsingPath'
import type { WizardContainerProps } from './types'
import { useWizardState } from './useWizardState'
import { WizardNavigation } from './WizardNavigation'
import { WizardStepContent } from './WizardStepContent'
import { WizardStepIndicator } from './WizardStepIndicator'

export function WizardContainer({
  wizardConfig,
  values,
  onChange,
  onSubmit,
  className = '',
  labelPosition = 'left',
  missingFields = [],
  spaceCompact = false,
  workflowForm = false,
  nested = false,
  fieldNamePrefix = '',
  setFieldValue,
  setFieldTouched,
}: WizardContainerProps & {
  setFieldValue: (field: string, value: unknown, shouldValidate?: boolean) => void
  setFieldTouched: (field: string, touched?: boolean, shouldValidate?: boolean) => void
}) {
  const { validateForm, setTouched, touched } = useFormikContext<FormikValues>()
  const editing = useFormEditing()

  const { config, steps, stepOrder } = wizardConfig

  const validateCurrentStep = useCallback(
    async (stepKey: string) => {
      const stepConfig = steps[stepKey]
      if (!stepConfig?.options) {
        return true
      }

      // Where the step's fields keep their values: where the wizard's do, or under the step's name.
      const stepPrefix =
        config.flatten !== false ? fieldNamePrefix : `${fieldNamePrefix}${stepKey}.`
      const stepFieldPaths = Object.keys(stepConfig.options).map((name) => `${stepPrefix}${name}`)

      // Validate all fields and collect errors
      const errors = await validateForm()
      const hasStepErrors = stepFieldPaths.some((path) => getValueUsingPath(errors, path))

      // Mark fields as touched to show errors
      if (hasStepErrors) {
        if (stepPrefix) {
          for (const path of stepFieldPaths) {
            setFieldTouched(path, true, false)
          }
        } else {
          const touchedFields = Object.fromEntries(stepFieldPaths.map((path) => [path, true]))
          setTouched({ ...touched, ...touchedFields }, false)
        }
      }

      return !hasStepErrors
    },
    [steps, config, fieldNamePrefix, validateForm, setTouched, setFieldTouched, touched],
  )

  const {
    currentStep,
    visitedSteps,
    invalidSteps,
    isLastStep,
    canGoBack,
    goToNext,
    goToPrevious,
    jumpToStep,
  } = useWizardState({
    stepOrder,
    steps,
    validateStep: validateCurrentStep,
  })

  const currentStepConfig = steps[currentStep]
  const navigation = config.navigation ?? {}

  const handleGoToNext = useCallback(async () => {
    const success = await goToNext()
    if (success) {
      onChange?.(values)
    }
    return success
  }, [goToNext, values, onChange])

  const handleSubmit = useCallback(async () => {
    if (!isLastStep) {
      return
    }

    // Validate entire form on final submission
    const errors = await validateForm()
    if (Object.keys(errors).length > 0) {
      // Mark all fields as touched to show errors
      const touchedFields = Object.fromEntries(Object.keys(values).map((name) => [name, true]))
      setTouched({ ...touched, ...touchedFields }, false)
      throw new Error('Please fix errors before submitting')
    }

    await onSubmit?.(values)
  }, [isLastStep, validateForm, values, setTouched, touched, onSubmit])

  // A form builder edits every page at once instead of paging through them.
  if (editing) {
    return (
      <div className={className}>
        {stepOrder.map((stepKey) => {
          const stepConfig = steps[stepKey]
          return stepConfig ? (
            <WizardStepContent
              key={stepKey}
              currentStep={stepKey}
              stepConfig={stepConfig}
              flatten={config.flatten}
              values={values}
              labelPosition={labelPosition}
              missingFields={missingFields}
              spaceCompact={spaceCompact}
              setFormDirty={() => onChange?.(values)}
              workflowForm={workflowForm}
              fieldNamePrefix={fieldNamePrefix}
              setFieldValue={setFieldValue}
              setFieldTouched={setFieldTouched}
            />
          ) : null
        })}
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Step indicator */}
      {navigation.showSteps !== false && (
        <WizardStepIndicator
          stepOrder={stepOrder}
          currentStep={currentStep}
          steps={steps}
          visitedSteps={visitedSteps}
          invalidSteps={invalidSteps}
          onStepClick={jumpToStep}
          allowJump={navigation.allowJump}
          hideStepNumbers={navigation.hideStepNumbers}
        />
      )}

      {/* Step content */}
      {currentStepConfig && (
        <div className="mb-4">
          <WizardStepContent
            currentStep={currentStep}
            stepConfig={currentStepConfig}
            flatten={config.flatten}
            values={values}
            labelPosition={labelPosition}
            missingFields={missingFields}
            spaceCompact={spaceCompact}
            setFormDirty={() => onChange?.(values)}
            workflowForm={workflowForm}
            fieldNamePrefix={fieldNamePrefix}
            setFieldValue={setFieldValue}
            setFieldTouched={setFieldTouched}
          />
        </div>
      )}

      {/* Navigation */}
      <WizardNavigation
        isLastStep={isLastStep}
        canGoBack={canGoBack}
        isCurrentStepValid={!invalidSteps.has(currentStep)}
        nextLabel={currentStepConfig?.nextLabel}
        prevLabel={currentStepConfig?.prevLabel}
        submitLabel={config.submitLabel || 'Execute'}
        onNext={handleGoToNext}
        onPrevious={goToPrevious}
        onSubmit={nested ? undefined : handleSubmit}
      />
    </div>
  )
}
