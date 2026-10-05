import cx from 'classnames'
import * as monaco from 'monaco-editor'
import { lintWorkflow } from '@parallelworks/workflow-parser'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useCssIsDark } from '../components/useCssIsDark'
import { useLintContext } from './lintContext'
import { holdListeners, modelFor } from './editorModel'
import { registerRevealer } from './reveal'
import { defineEditorThemes, getThemeName } from './themes'
import { setupMonacoWorkers } from './workers'
import { ensureYamlLanguage } from './yamlLanguage'

setupMonacoWorkers()

export type ISchemaError = monaco.editor.IMarker

export interface EditorMarketplaceItem {
  readonly slug?: string
  readonly name?: string | null
  readonly description?: string | null
  readonly type?: string | null
  readonly subtype?: string | null
  readonly versions?: readonly string[] | null
}

export interface EditorWorkflowItem {
  readonly name?: string
  readonly displayName?: string | null
  readonly description?: string | null
  readonly type?: string | null
}

export interface UsesCompletions {
  marketplaceItems: EditorMarketplaceItem[]
  workflows: EditorWorkflowItem[]
}

export interface NestedWorkflowText {
  inputs: () => Record<string, unknown>
  addInputs: (name: string, definition: Record<string, unknown>) => void
}

export interface EditorMarker {
  line: number
  message: string
}

function editorText(value: string): string {
  return value.replace(/\r/g, '')
}

const noop = () => {}
export interface IEditorProps extends monaco.editor.IStandaloneEditorConstructionOptions {
  className?: string
  disabled?: boolean | undefined
  onChange?: (value: string) => void
  onValidate?: (errors: ISchemaError[]) => void
  width?: string | number
  height?: string | number
  path?: 'file:///workflow.yaml' | string
  marketplaceItems?: EditorMarketplaceItem[]
  workflows?: EditorWorkflowItem[]
  preserveUndo?: boolean
  lint?: boolean
  markers?: EditorMarker[]
  nested?: NestedWorkflowText
  scrollBeyondLastLine?: boolean
}

export default function MonacoEditor({
  className,
  disabled,
  onChange = noop,
  onValidate = noop,
  width = '100%',
  height = '100%',
  // `path` is for multi-model editors, but we also use it to determine
  // if we should use the workflow schema or not.
  path = 'file:///default',
  marketplaceItems: _marketplaceItems,
  workflows: _workflows,
  preserveUndo = false,
  lint = false,
  markers = [],
  nested: _nested,
  ...options
}: IEditorProps) {
  const isDark = useCssIsDark()
  const lintContext = useLintContext(lint ? options.value : undefined)
  const readOnly = disabled || options.readOnly
  const monacoRef = useRef<ReturnType<typeof monaco.editor.create>>(null)
  const isSyncingValueRef = useRef(false)

  // Update theme when the scheme or disabled state changes
  useEffect(() => {
    if (!monacoRef.current) {
      return
    }
    defineEditorThemes(monaco.editor)
    monaco.editor.setTheme(getThemeName(isDark, disabled))
    monacoRef.current.updateOptions(readOnly === undefined ? {} : { readOnly })
  }, [disabled, isDark, readOnly])

  // Reconcile before paint so an older passive effect cannot overwrite a new edit.
  useLayoutEffect(() => {
    const model = monacoRef.current?.getModel()
    if (
      !model ||
      options.value === undefined ||
      editorText(model.getValue()) === editorText(options.value)
    ) {
      return
    }
    isSyncingValueRef.current = true
    try {
      if (preserveUndo) {
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: options.value }],
          () => null,
        )
      } else {
        model.setValue(options.value)
      }
    } finally {
      isSyncingValueRef.current = false
    }
  }, [options.value, preserveUndo])

  useEffect(() => {
    const model = monacoRef.current?.getModel()
    if (!model) {
      return
    }
    const external = markers.map(({ line, message }) => ({
      severity: monaco.MarkerSeverity.Error,
      message,
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: model.getLineMaxColumn(line),
    }))
    const lintMarkers = lint
      ? lintWorkflow(model.getValue(), lintContext).map(({ line, message }) => ({
          severity: monaco.MarkerSeverity.Error,
          message,
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line),
        }))
      : []
    monaco.editor.setModelMarkers(model, 'workflowlint', [...external, ...lintMarkers])
  }, [lint, lintContext, markers])

  // Dispose only the editor on unmount; the YAML service and completion providers
  // are global and outlive every editor.
  useEffect(() => {
    return () => {
      monacoRef.current?.dispose()
      monacoRef.current = null
    }
  }, [])

  /** Strips CR (\r) — Windows line endings break bash scripts. */
  const onChangeWrapper = (value: string) => {
    value = editorText(value)
    onChange(value)
  }

  return (
    <div
      style={{ width, height }}
      className={cx('relative border rounded', className)}
      ref={(ref) => {
        if (ref && !monacoRef.current) {
          defineEditorThemes(monaco.editor)
          monaco.editor.setTheme(getThemeName(isDark, disabled))
          const model = modelFor(monaco.Uri.parse(path), options.value ?? '', options.language)
          const editor = monaco.editor.create(ref, {
            automaticLayout: true,
            model,
            ...options,
            ...(readOnly === undefined ? {} : { readOnly }),
            fixedOverflowWidgets: true,
            suggest: {
              preview: true,
              // prevents the variable names from being shown as completion suggestions
              showWords: false,
              showInlineDetails: true,
            },
          })

          const listeners = [
            model.onDidChangeContent(() => {
              if (isSyncingValueRef.current) {
                return
              }
              onChangeWrapper(editor.getValue())
            }),
            model.onDidChangeDecorations(() => {
              const found = monaco.editor.getModelMarkers({ resource: model.uri })
              onValidate(found)
            }),
            {
              dispose: registerRevealer(path, (start, end) => {
                editor.revealLinesInCenter(start, end)
                editor.setSelection({
                  startLineNumber: start,
                  startColumn: 1,
                  endLineNumber: end,
                  endColumn: model.getLineMaxColumn(end),
                })
              }),
            },
          ]
          holdListeners(model, listeners)

          ensureYamlLanguage()
          monacoRef.current = editor
        }
      }}
    />
  )
}
