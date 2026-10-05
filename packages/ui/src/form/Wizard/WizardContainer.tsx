import { type FormikValues, useFormikContext } from 'formik'
import { useCallback } from 'react'
import { useFormEditing } from '../formEditing'
import { WizardNavigation } from './WizardNavigation'
import { WizardStepContent } from './WizardStepContent'
import { WizardStepIndicator } from './WizardStepIndicator'
import { useWizardState } from './useWizardState'
import type { WizardContainerProps } from './types'

function hasNestedError(stepErrors: unknown, fieldName: string): boolean {
  return (
    typeof stepErrors === 'object' &&
    stepErrors !== null &&
    fieldName in stepErrors
  )
}

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
  setFieldValue,
  setFieldTouched,
}: WizardContainerProps & {
  setFieldValue: (
    field: string,
    value: unknown,
    shouldValidate?: boolean
  ) => void
  setFieldTouched: (
    field: string,
    touched?: boolean,
    shouldValidate?: boolean
  ) => void
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

      // Get all field names in this step
      const stepFieldNames = Object.keys(stepConfig.options)
      const shouldFlatten = config.flatten !== false

      // Validate all fields and collect errors
      const errors = await validateForm()

      // Check if any step fields have errors
      const hasStepErrors = shouldFlatten
        ? stepFieldNames.some(fieldName => errors[fieldName])
        : stepFieldNames.some(fieldName =>
            hasNestedError(errors[stepKey], fieldName)
          )

      // Mark fields as touched to show errors
      if (hasStepErrors) {
        const touchedFields = stepFieldNames.reduce(
          (acc, fieldName) => {
            acc[fieldName] = true
            return acc
          },
          {} as Record<string, boolean>
        )
        if (shouldFlatten) {
          setTouched({ ...touched, ...touchedFields }, false)
        } else {
          setTouched({ ...touched, [stepKey]: touchedFields }, false)
        }
      }

      return !hasStepErrors
    },
    [steps, validateForm, setTouched, touched]
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
  const config_ = config.navigation || {}

  const handleGoToNext = useCallback(async () => {
    const success = await goToNext()
    if (success) {
      onChange?.(values)
    }
    return success
  }, [goToNext, values, onChange])

  const handleJumpToStep = useCallback(
    (stepKey: string) => {
      if (!config_.allowJump || !visitedSteps.has(stepKey)) {
        return false
      }
      return jumpToStep(stepKey)
    },
    [jumpToStep, config_.allowJump, visitedSteps]
  )

  const handleSubmit = useCallback(async () => {
    if (!isLastStep) {
      return
    }

    // Validate entire form on final submission
    const errors = await validateForm()
    if (Object.keys(errors).length > 0) {
      // Mark all fields as touched to show errors
      const allFieldNames = Object.keys(values)
      const touchedFields = allFieldNames.reduce(
        (acc, fieldName) => {
          acc[fieldName] = true
          return acc
        },
        {} as Record<string, boolean>
      )
      setTouched({ ...touched, ...touchedFields }, false)
      throw new Error('Please fix errors before submitting')
    }

    await onSubmit?.(values)
  }, [isLastStep, validateForm, values, setTouched, touched, onSubmit])

  // A form builder edits every page at once instead of paging through them.
  if (editing) {
    return (
      <div className={className}>
        {stepOrder.map(stepKey => {
          const stepConfig = steps[stepKey]
          return stepConfig ? (
            <WizardStepContent
              key={stepKey}
              currentStep={stepKey}
              stepConfig={stepConfig}
              flatten={config.flatten}
              values={values}
              onValuesChange={onChange}
              labelPosition={labelPosition}
              missingFields={missingFields}
              spaceCompact={spaceCompact}
              setFormDirty={() => onChange?.(values)}
              workflowForm={workflowForm}
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
      {config_.showSteps !== false && (
        <WizardStepIndicator
          stepOrder={stepOrder}
          currentStep={currentStep}
          steps={steps}
          visitedSteps={visitedSteps}
          invalidSteps={invalidSteps}
          onStepClick={handleJumpToStep}
          allowJump={config_.allowJump}
          hideStepNumbers={config_.hideStepNumbers}
        />
      )}

      {/* Step content */}
      {currentStepConfig && (
        <div className='mb-4'>
          <WizardStepContent
            currentStep={currentStep}
            stepConfig={currentStepConfig}
            flatten={config.flatten}
            values={values}
            onValuesChange={onChange}
            labelPosition={labelPosition}
            missingFields={missingFields}
            spaceCompact={spaceCompact}
            setFormDirty={() => onChange?.(values)}
            workflowForm={workflowForm}
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
        onSubmit={handleSubmit}
      />
    </div>
  )
}
