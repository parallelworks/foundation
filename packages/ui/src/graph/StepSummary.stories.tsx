import { createWorkflowEngine } from '@parallelworks/workflow-parser'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
import Markdown from '../components/Markdown'
import { type RunFileResult, UIProvider } from '../components/Provider'
import { RunStatusIcon } from '../components/RunStatusIcon'
import { SummaryIcon } from '../icons'
import DependencyGraph from './DependencyGraph'

const engine = createWorkflowEngine()

const SUMMARY = [
  '## Tests',
  '',
  '| Suite | Passed | Failed |',
  '| --- | --- | --- |',
  '| unit | 120 | 3 |',
  '',
  '<details><summary>3 failures</summary>',
  '',
  '```text',
  'test_residual_converges: residual 3.2e-4 > 1e-6',
  '```',
  '',
  '</details>',
].join('\n')

const FILES: Record<string, string> = {
  'logs/test/step_0/summary.md': SUMMARY,
  'logs/test/step_0/logs.out': 'collected 123 items\n120 passed, 3 failed in 41.2s',
  'logs/test/step_0/script-unstable-redacted.sh': 'pytest -q tests/ --junitxml=results.xml',
  'logs/test/step_1/logs.out': 'Uploaded results.xml (18.4 KB)',
}

const useRunFile = (_slug: string, path: string | null): RunFileResult => ({
  data: path ? FILES[path] : undefined,
  isLoading: false,
  error: undefined,
})

const meta: Meta<typeof DependencyGraph> = {
  title: 'UI/Workflow/DependencyGraph',
  component: DependencyGraph,
  argTypes: { openStep: { control: 'object' }, sidebarStickyTop: { control: 'number' } },
  decorators: [
    (Story) => (
      <UIProvider engine={engine} data={{ useRunFile }}>
        <Story />
      </UIProvider>
    ),
  ],
}
export default meta

const RUN = {
  id: 'run-12',
  number: 12,
  slug: 'solver-sweep-00012',
  workflowName: 'solver-sweep',
  status: 'completed',
  executedJobs: {
    test: {
      status: 'completed',
      steps: [
        { name: 'Run tests', status: 'completed', summary: { bytes: SUMMARY.length } },
        { name: 'Upload results', status: 'completed' },
      ],
    },
  },
}

export const StepWithSummary: StoryObj<typeof DependencyGraph> = {
  args: { run: RUN, openStep: { job: 'test', step: 0 } },
}

// What a host such as ACTIVATE's run page puts under the graph: the run's step summaries, open.
function HostStepSummaries() {
  return (
    <section aria-label="Step summaries" className="panel rounded-lg border">
      <h2 className="flex items-center gap-3 border-b px-4 py-2.5 text-sm font-medium">
        Step summaries
        <span className="inline-flex items-center gap-1 rounded-full bg-(--theme-muted-panel-bg) px-2 py-0.5 text-xs theme-muted-text">
          <SummaryIcon aria-hidden className="h-3 w-3" />1
        </span>
      </h2>
      <div className="flex flex-col gap-2 px-4 py-3 text-sm sm:pl-10">
        <h3 className="flex items-center gap-2 font-medium">
          <RunStatusIcon status="completed" />
          Test <span className="font-normal theme-muted-text">1 summary</span>
        </h3>
        <div className="flex flex-col gap-2 pl-6">
          <div className="flex items-center gap-2 font-medium">
            <RunStatusIcon status="completed" />
            Run tests
          </div>
          <Markdown httpsImagesOnly compact>
            {SUMMARY}
          </Markdown>
        </div>
      </div>
    </section>
  )
}

export const ContentBelowGraph: StoryObj<typeof DependencyGraph> = {
  args: { run: RUN, children: <HostStepSummaries /> },
}

// The summary mark beside a step in the job list opens that step on its summary.
export const SummaryMarkOpensSummary: StoryObj<typeof DependencyGraph> = {
  args: { run: RUN },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The job list beside the graph and the graph's own node both name the job.
    await userEvent.click(canvas.getAllByText('Test')[0] as HTMLElement)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Step summary' })[0] as HTMLElement)
    await expect(await screen.findByRole('heading', { name: 'Tests' })).toBeVisible()
    await expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  },
}
