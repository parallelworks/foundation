import { useState } from 'react'
import { Loader } from '../../components/Loader'
import { useStrings } from '../../components/Provider'
import type { WizardNavigationProps } from './types'

export function WizardNavigation({
  isLastStep,
  canGoBack,
  isCurrentStepValid,
  nextLabel,
  prevLabel,
  submitLabel: submitLabelProp,
  onNext,
  onPrevious,
  onSubmit,
}: WizardNavigationProps) {
  const { form: t, common } = useStrings()
  const submitLabel = submitLabelProp ?? common.submit
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNext = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const success = await onNext()
      if (!success) {
        setError(t.fixErrorsToContinue)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.stepFailed)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await onSubmit?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 justify-between pt-4">
        {/* Previous button */}
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canGoBack || isLoading}
          className="px-6 py-3 rounded-lg font-medium transition-all duration-200 border flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            color: 'var(--theme-app)',
            borderColor: 'var(--theme-border)',
            backgroundColor: 'var(--theme-app-bg)',
          }}
          onMouseEnter={(e) => {
            if (canGoBack && !isLoading) {
              e.currentTarget.style.backgroundColor = 'var(--theme-hover)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--theme-app-bg)'
          }}
          aria-label={t.previousStep}
        >
          {prevLabel || t.previous}
        </button>

        {/* Next / Submit button */}
        {isLastStep && !onSubmit ? null : isLastStep ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isCurrentStepValid || isLoading}
            className="px-8 py-3 rounded-lg font-medium transition-all duration-200 text-(--theme-element-text) flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            style={{
              backgroundColor: 'var(--theme-element)',
            }}
            onMouseEnter={(e) => {
              if (isCurrentStepValid && !isLoading) {
                e.currentTarget.style.filter = 'brightness(0.9)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'brightness(1)'
            }}
            aria-label={submitLabel}
          >
            {isLoading && <Loader size={16} inline color="currentColor" />}
            {submitLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={isLoading}
            className="px-8 py-3 rounded-lg font-medium transition-all duration-200 text-(--theme-element-text) flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            style={{
              backgroundColor: 'var(--theme-element)',
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.filter = 'brightness(0.9)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'brightness(1)'
            }}
            aria-label={t.nextStep}
          >
            {isLoading && <Loader size={16} inline color="currentColor" />}
            {nextLabel || t.next}
          </button>
        )}
      </div>
    </div>
  )
}
