// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { dumpYaml } from '@parallelworks/workflow-parser'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GRAPH_EDITOR_STRINGS } from './editorStrings'
import { WorkflowSettingsDialog } from './WorkflowSettingsDialog'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

vi.mock('../editor/Monaco', () => ({
  default: ({
    value,
    onChange,
    path,
  }: {
    value?: string
    onChange?: (value: string) => void
    path?: string
  }) => <textarea aria-label={path} value={value} onChange={(e) => onChange?.(e.target.value)} />,
}))

global.ResizeObserver = class implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(cleanup)

// Typed values reach the dropdown's owner on blur, which clicking Save causes in a browser.
function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } })
  fireEvent.blur(field)
}

const WORKFLOW = {
  permissions: ['*'],
  env: { A: '1' },
  sessions: { app: { redirect: true } },
  on: {
    execute: {
      inputs: { $meta: { labelPosition: 'top' }, x: { type: 'string' } },
    },
  },
  jobs: { main: { steps: [{ run: 'echo' }] } },
}

function open(workflow: Record<string, unknown> = WORKFLOW) {
  const onEdit = vi.fn()
  render(<WorkflowSettingsDialog workflow={workflow} onEdit={onEdit} onClose={() => {}} />)
  return onEdit
}

describe('WorkflowSettingsDialog', () => {
  it('describes each setting', () => {
    open()
    const help = GRAPH_EDITOR_STRINGS.help
    for (const text of [
      help.workflowEnv,
      help.workflowTimeout,
      help.permissions,
      help.sessionName,
      help.sessionType,
      help.promptForName,
      help.sessionRedirect,
      help.useTLS,
      help.useCustomDomain,
      help.openAI,
      help.sessionDetach,
      help.organizationVariables,
      help.userVariables,
      help.labelPosition,
      help.wizard,
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })

  it('saves only the sections that changed', () => {
    const onEdit = open()
    type(screen.getByDisplayValue('1'), '2')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith({
      type: 'updateWorkflow',
      set: { env: { A: '2' } },
      unset: [],
      inputsMeta: { set: {}, unset: [] },
    })
  })

  it('allows only one redirect across sessions and links', () => {
    open()
    fireEvent.click(screen.getByText('Add link'))
    const names = screen.getAllByLabelText('Name')
    fireEvent.change(names[names.length - 1] as HTMLElement, {
      target: { value: 'docs' },
    })
    fireEvent.change(screen.getByLabelText('An endpoint session'), {
      target: { value: 'app' },
    })
    const redirects = screen.getAllByLabelText('Open when the run starts')
    fireEvent.click(redirects[redirects.length - 1] as HTMLElement)
    expect(screen.getAllByText(GRAPH_EDITOR_STRINGS.oneRedirect).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('edits the input form layout in the same step, the inputs starting the first page', () => {
    const onEdit = open()
    fireEvent.click(screen.getByText(GRAPH_EDITOR_STRINGS.labelsBeside))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Split into pages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'updateWorkflow',
          set: {},
          unset: [],
          inputsMeta: {
            set: { wizard: { mode: 'wizard' } },
            unset: ['labelPosition'],
          },
        },
        {
          type: 'addInput',
          parent: [],
          index: 0,
          name: 'step_1',
          definition: { type: 'step', title: 'Step 1', options: {} },
        },
        { type: 'moveInputs', paths: [['x']], parent: ['step_1'], index: 0 },
      ],
    })
  })

  it('adds permissions and required variables', () => {
    const onEdit = open({ jobs: {} })
    fireEvent.click(screen.getByText('Add permission'))
    type(screen.getByLabelText('Add permission'), '*')
    fireEvent.click(screen.getByText('Add organization variable'))
    type(screen.getByLabelText('Add organization variable'), 'API_KEY')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith({
      type: 'updateWorkflow',
      set: {
        permissions: ['*'],
        needs: { organizationVariables: ['API_KEY'] },
      },
      unset: [],
      inputsMeta: { set: {}, unset: [] },
    })
  })
})

describe('WorkflowSettingsDialog as YAML', () => {
  it('shows the settings, not the jobs or trigger, and saves edited text', async () => {
    const onEdit = vi.fn()
    render(
      <WorkflowSettingsDialog
        workflow={WORKFLOW}
        source={dumpYaml(WORKFLOW)}
        onEdit={onEdit}
        onClose={() => {}}
      />,
    )
    const text = (await screen.findByLabelText(
      'file:///workflow-settings.yaml',
    )) as HTMLTextAreaElement
    expect(text.value).toContain('permissions:')
    expect(text.value).not.toContain('jobs:')
    fireEvent.change(text, { target: { value: 'timeout: 2h\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith({
      type: 'setSettingsYaml',
      yaml: 'timeout: 2h\n',
    })
  })

  it('carries what the YAML changed into the form', async () => {
    render(
      <WorkflowSettingsDialog
        workflow={WORKFLOW}
        source={dumpYaml(WORKFLOW)}
        onEdit={() => {}}
        onClose={() => {}}
      />,
    )
    const text = await screen.findByLabelText('file:///workflow-settings.yaml')
    fireEvent.change(text, { target: { value: 'timeout: 2h\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Form' }))
    expect(screen.getByDisplayValue('2h')).toBeInTheDocument()
  })
})
