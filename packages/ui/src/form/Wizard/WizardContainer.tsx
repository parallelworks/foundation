import { type FormikValues, useFormikContext } from 'formik'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useStrings, useWorkflowEngine } from '../../components/Provider'
import { useFormEditing } from '../formEditing'
import { initializeValues } from '../lib'
import { getValueUsingPath } from '../utils/getValueUsingPath'
import type { StepFieldConfig, WizardContainerProps } from './types'
import { useWizardState } from './useWizardState'
import { copyBounds, stepText } from './utils'
import { WizardNavigation } from './WizardNavigation'
import { WizardStepContent } from './WizardStepContent'
import { WizardStepIndicator } from './WizardStepIndicator'
import { WizardPagesContext } from './wizardPages'

/** One page the wizard shows: a step, or one copy of a step the person repeats. */
interface Page {
  step: string
  config: StepFieldConfig
  /** A repeated step's copy (none on the page it shows while it has none), how many copies it has, and
   * whether its `min`/`max` allow another or one fewer. */
  copy?: number
  count?: number
  canAdd?: boolean
  canRemove?: boolean
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
  const pages = useContext(WizardPagesContext)
  const [ownPage, setOwnPage] = useState(0)
  const { form: strings } = useStrings()
  const engine = useWorkflowEngine()

  const { config, steps, stepOrder } = wizardConfig

  // A repeated page's title or description: one per copy when written as a list, read for each copy
  // when it uses `[index]`, and otherwise the page's own, a title numbered by copy.
  const perCopy = useCallback(
    (value: string | string[] | undefined, copy: number, numbered: boolean): string => {
      if (Array.isArray(value)) {
        return value[copy] ?? (numbered ? strings.copyTitle(value[0] ?? '', copy + 1) : '')
      }
      const text = value ?? ''
      if (text.includes('${{')) {
        const read = engine.evaluate<{ text: unknown }>({
          inputs: values,
          obj: { text },
          orgVars: {},
          index: copy,
        })
        return String(read.text ?? '')
      }
      return numbered && text ? strings.copyTitle(text, copy + 1) : text
    },
    [engine, values, strings],
  )

  // A repeated step shows a page per copy in its values, and at least its `min`; with none, one page
  // its first copy is added from.
  const shown = useMemo(() => {
    const order: string[] = []
    const byKey: Record<string, Page> = {}
    for (const step of stepOrder) {
      const stepConfig = steps[step]
      if (!stepConfig) {
        continue
      }
      if (stepConfig.multi !== true) {
        order.push(step)
        byKey[step] = { step, config: stepConfig }
        continue
      }
      const rows = getValueUsingPath(values, `${fieldNamePrefix}${step}`)
      const { lo, hi } = copyBounds(stepConfig.min, stepConfig.max)
      const count = Math.max(Array.isArray(rows) ? rows.length : 0, lo)
      if (count === 0) {
        order.push(step)
        byKey[step] = {
          step,
          count,
          canAdd: hi === undefined || hi > 0,
          canRemove: false,
          config: {
            ...stepConfig,
            title: perCopy(stepConfig.title, 0, false),
            description: perCopy(stepConfig.description, 0, false),
            options: {},
          },
        }
        continue
      }
      for (let copy = 0; copy < count; copy++) {
        const key = `${step}[${copy}]`
        order.push(key)
        byKey[key] = {
          step,
          copy,
          count,
          canAdd: hi === undefined || count < hi,
          canRemove: count > lo,
          config: {
            ...stepConfig,
            title: perCopy(stepConfig.title, copy, true),
            description: perCopy(stepConfig.description, copy, false),
          },
        }
      }
    }
    return { order, byKey }
  }, [stepOrder, steps, values, fieldNamePrefix, perCopy])

  // A repeated page below its `min` gets rows up to it from the defaults, as a list pads to its own.
  useEffect(() => {
    for (const step of stepOrder) {
      const stepConfig = steps[step]
      if (stepConfig?.multi !== true) {
        continue
      }
      const { lo } = copyBounds(stepConfig.min, stepConfig.max)
      const path = `${fieldNamePrefix}${step}`
      const rows = getValueUsingPath(values, path)
      const now = Array.isArray(rows) ? rows : []
      if (now.length < lo) {
        setFieldValue(
          path,
          Array.from(
            { length: lo },
            (_, i) => now[i] ?? initializeValues(stepConfig.options, {}) ?? {},
          ),
        )
      }
    }
  }, [stepOrder, steps, values, fieldNamePrefix, setFieldValue])
  const configs = useMemo(
    () => Object.fromEntries(Object.entries(shown.byKey).map(([key, page]) => [key, page.config])),
    [shown],
  )

  const validateCurrentStep = useCallback(
    async (pageKey: string) => {
      const page = shown.byKey[pageKey]
      if (!page?.config.options) {
        return true
      }

      // Where the page's fields keep their values: a copy's row, where the wizard's do, or under the step's name.
      const stepPrefix =
        page.copy !== undefined
          ? `${fieldNamePrefix}${page.step}[${page.copy}].`
          : config.flatten !== false
            ? fieldNamePrefix
            : `${fieldNamePrefix}${page.step}.`
      const stepFieldPaths = Object.keys(page.config.options).map((name) => `${stepPrefix}${name}`)

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
    [shown, config, fieldNamePrefix, validateForm, setTouched, setFieldTouched, touched],
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
    showStep,
  } = useWizardState({
    stepOrder: shown.order,
    steps: configs,
    validateStep: validateCurrentStep,
  })

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

  // A form being built pages as it will when run, moving freely: no step blocks the next, every
  // step can be jumped to, and the editor can turn the pages too.
  const last = Math.max(shown.order.length - 1, 0)
  const wizardKey = editing ? JSON.stringify(editing.parent) : ''
  const editIndex = Math.min(Math.max(pages ? pages.page(wizardKey) : ownPage, 0), last)
  const turn = (to: number) => {
    const next = Math.max(to, 0)
    if (pages) {
      pages.setPage(wizardKey, next)
    } else {
      setOwnPage(next)
    }
  }
  const drawn = shown.order.length
  useEffect(() => {
    pages?.setCount(wizardKey, drawn)
  }, [pages, wizardKey, drawn])
  const pageKey = editing ? (shown.order[editIndex] ?? '') : currentStep
  const page = shown.byKey[pageKey]
  // A new copy goes after the step's last and is the page shown.
  const show = (key: string, index: number) => (editing ? turn(index) : showStep(key))
  const copiesOf = (step: string): unknown[] => {
    const rows = getValueUsingPath(values, `${fieldNamePrefix}${step}`)
    return Array.isArray(rows) ? rows : []
  }
  const addCopy = (shownPage: Page) => {
    const options = steps[shownPage.step]?.options
    const rows = copiesOf(shownPage.step)
    const kept = Array.from(
      { length: shownPage.count ?? rows.length },
      (_, i) => rows[i] ?? initializeValues(options, {}) ?? {},
    )
    setFieldValue(`${fieldNamePrefix}${shownPage.step}`, [
      ...kept,
      initializeValues(options, {}) ?? {},
    ])
    // The first copy takes the empty page's place.
    const at = shown.order.indexOf(pageKey) + (shownPage.copy === undefined ? 0 : 1)
    show(`${shownPage.step}[${kept.length}]`, at)
  }
  const removeCopy = (shownPage: Page) => {
    const copy = shownPage.copy ?? 0
    const rows = copiesOf(shownPage.step).filter((_, i) => i !== copy)
    setFieldValue(`${fieldNamePrefix}${shownPage.step}`, rows)
    const at = shown.order.indexOf(pageKey) - (copy > 0 ? 1 : 0)
    show(rows.length > 0 ? `${shownPage.step}[${Math.max(copy - 1, 0)}]` : shownPage.step, at)
  }

  const stepTitle = page ? stepText(steps[page.step]?.title) : ''
  const copies =
    page?.count !== undefined && (page.canAdd || page.canRemove) ? (
      <div className="mb-4 flex items-center justify-between gap-3">
        {page.canRemove ? (
          <button
            type="button"
            onClick={() => removeCopy(page)}
            className="rounded-lg border theme-border px-4 py-2 text-sm theme-muted-text hover:text-(--theme-app)"
          >
            {strings.removeCopy(stepTitle)}
          </button>
        ) : (
          <span />
        )}
        {page.canAdd && (page.copy === undefined || page.copy === page.count - 1) && (
          <button
            type="button"
            onClick={() => addCopy(page)}
            className="rounded-lg bg-(--theme-element) px-4 py-2 font-medium text-(--theme-element-text) text-sm"
          >
            {strings.addCopy(stepTitle)}
          </button>
        )}
      </div>
    ) : null

  const content = page ? (
    <div className="mb-4">
      <WizardStepContent
        currentStep={page.step}
        stepConfig={page.config}
        flatten={config.flatten}
        values={values}
        labelPosition={labelPosition}
        missingFields={missingFields}
        spaceCompact={spaceCompact}
        setFormDirty={() => onChange?.(values)}
        workflowForm={workflowForm}
        fieldNamePrefix={fieldNamePrefix}
        copy={page.copy}
        setFieldValue={setFieldValue}
        setFieldTouched={setFieldTouched}
      />
      {copies}
    </div>
  ) : null

  if (editing) {
    return (
      <div className={className}>
        {navigation.showSteps !== false && (
          <WizardStepIndicator
            stepOrder={shown.order}
            currentStep={pageKey}
            steps={configs}
            visitedSteps={new Set(shown.order)}
            invalidSteps={new Set()}
            onStepClick={(key) => {
              turn(shown.order.indexOf(key))
              return true
            }}
            allowJump
            hideStepNumbers={navigation.hideStepNumbers}
          />
        )}
        {content}
        <WizardNavigation
          isLastStep={editIndex === last}
          canGoBack={editIndex > 0}
          isCurrentStepValid
          nextLabel={page?.config.nextLabel}
          prevLabel={page?.config.prevLabel}
          submitLabel={config.submitLabel || 'Execute'}
          onNext={async () => {
            turn(editIndex + 1)
            return true
          }}
          onPrevious={() => turn(editIndex - 1)}
          onSubmit={nested ? undefined : async () => {}}
        />
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Step indicator */}
      {navigation.showSteps !== false && (
        <WizardStepIndicator
          stepOrder={shown.order}
          currentStep={currentStep}
          steps={configs}
          visitedSteps={visitedSteps}
          invalidSteps={invalidSteps}
          onStepClick={jumpToStep}
          allowJump={navigation.allowJump}
          hideStepNumbers={navigation.hideStepNumbers}
        />
      )}

      {/* Step content */}
      {content}

      {/* Navigation */}
      <WizardNavigation
        isLastStep={isLastStep}
        canGoBack={canGoBack}
        isCurrentStepValid={!invalidSteps.has(currentStep)}
        nextLabel={page?.config.nextLabel}
        prevLabel={page?.config.prevLabel}
        submitLabel={config.submitLabel || 'Execute'}
        onNext={handleGoToNext}
        onPrevious={goToPrevious}
        onSubmit={nested ? undefined : handleSubmit}
      />
    </div>
  )
}
