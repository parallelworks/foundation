import {
  askQuestionsFromArgs,
  defaultSubagentNoticeStrings,
  hiddenTranscriptTool,
  INTERRUPTED_NOTICE,
  interruptionNotice,
  parseSubagentNotice,
  type SubagentNoticeStrings,
  subagentDeliveryLine,
  taskCallFromArgs,
} from './transcript'

describe('interruptionNotice', () => {
  it("reads the user's stop as the live notice does", () => {
    expect(interruptionNotice('[Request interrupted by the user.]\n')).toBe(INTERRUPTED_NOTICE)
  })

  it('reads a stop the user did not make with the reason the daemon gave', () => {
    expect(interruptionNotice('[Request interrupted because the server stopped.]')).toBe(
      'Request interrupted because the server stopped.',
    )
    expect(interruptionNotice('[Request interrupted because its deadline expired.]')).toBe(
      'Request interrupted because its deadline expired.',
    )
  })

  it("leaves the model's own words alone", () => {
    expect(interruptionNotice('Request interrupted by the user.')).toBeNull()
    expect(interruptionNotice('[Request interrupted] the build, then retried it.')).toBeNull()
    expect(interruptionNotice('Done.')).toBeNull()
  })
})

describe('taskCallFromArgs', () => {
  it('prefers the description and drops the default agent type', () => {
    expect(
      taskCallFromArgs(
        '{"description":"Inventory routes","prompt":"long prompt","subagent_type":"default"}',
      ),
    ).toEqual({ description: 'Inventory routes', agentType: '' })
  })

  it('falls back to the clipped prompt', () => {
    const prompt = 'x'.repeat(60)
    expect(taskCallFromArgs(`{"prompt":"${prompt}"}`).description).toBe(`${'x'.repeat(37)}...`)
    expect(taskCallFromArgs('not json').description).toBe('')
  })
})

describe('parseSubagentNotice', () => {
  it('reads a completed report and clips its first line', () => {
    const n = parseSubagentNotice(
      '[Background subagent task-4 (Inventory (routes)) completed]\n\nKey finding: none.\n(pass task-4 as task_id to send it direction)',
    )
    expect(n).toEqual({
      id: 'task-4',
      description: 'Inventory (routes)',
      preview: 'Key finding: none.',
      body: 'Key finding: none.',
      interim: false,
      silent: false,
      failed: false,
      elapsedMs: 0,
    })
    expect(subagentDeliveryLine(n!)).toBe('Agent "Inventory (routes)" finished')
  })

  it('says how long an agent ran and whether it failed', () => {
    const failed = parseSubagentNotice(
      '[Background subagent task-5 (Audit) failed after 2m59.4s]\nNo access.',
    )
    expect(failed).toMatchObject({ failed: true, elapsedMs: 179_400, body: 'No access.' })
    expect(subagentDeliveryLine(failed!)).toBe('Agent "Audit" failed · 2m 59s')
    expect(
      subagentDeliveryLine(
        parseSubagentNotice('[Background subagent task-6 () completed after 850ms]')!,
      ),
    ).toBe('Agent "task-6" finished · 1s')
  })

  it('marks an interim message and an interrupted child', () => {
    const interim = parseSubagentNotice(
      '[Message from subagent task-3 (Coverage) — it is still working]\nHalf way.',
    )
    expect(interim?.interim).toBe(true)
    expect(subagentDeliveryLine(interim!)).toBe('Message from Coverage')
    expect(
      parseSubagentNotice(
        '[Background subagent task-1 (x) was interrupted by the user and returned no result]\n(pass task-1 as task_id to resume it)',
      )?.silent,
    ).toBe(true)
  })

  it('reads a background command exit and ignores other notices', () => {
    const failed = parseSubagentNotice('[Background command bash-2 (npm test) exited with code 1]')
    expect(failed).toMatchObject({ id: 'bash-2', shell: true, exitCode: 1 })
    expect(subagentDeliveryLine(failed!)).toBe(
      'Background command "npm test" failed with exit code 1',
    )
    expect(
      subagentDeliveryLine(
        parseSubagentNotice('[Background command bash-3 (ls) exited with code 0]')!,
      ),
    ).toBe('Background command "ls" completed (exit code 0)')
    expect(
      parseSubagentNotice('[Background command bash-4 (sleep 9) was stopped by the user]')?.silent,
    ).toBe(true)
    expect(parseSubagentNotice('Goal set: ship it')).toBeNull()
  })

  it("reads a monitor's event as the lines its script printed", () => {
    const n = parseSubagentNotice(
      '[Monitor monitor-3 (CI \\[checks\\]) event]\n\u001b[31mbuild: fail\u001b[0m\u0007\nlint: pass\n\u001b]0;title\u0007done',
    )
    expect(n).toEqual({
      id: 'monitor-3',
      description: 'CI [checks]',
      preview: 'build: fail',
      body: 'build: fail\nlint: pass\ndone',
      interim: false,
      silent: false,
      monitor: true,
    })
    expect(subagentDeliveryLine(n!)).toBe('Monitor event: build: fail · CI [checks]')
  })

  it('says how a monitor ended', () => {
    const line = (tail: string) =>
      subagentDeliveryLine(
        parseSubagentNotice(`[Monitor monitor-1 (deploy log) ${tail}]\n(a hint for the model)`)!,
      )
    expect(line('exited with code 0')).toBe('Monitor "deploy log" stream ended')
    expect(line('exited with code 2')).toBe('Monitor "deploy log" script failed (exit 2)')
    expect(line('exited with code -1')).toBe('Monitor "deploy log" script failed (exit -1)')
    expect(line('expired after 5m0s with 3 events delivered')).toBe(
      'Monitor "deploy log" expired after 5m 0s with 3 events delivered',
    )
    expect(line('expired after 1s with 1 event delivered')).toBe(
      'Monitor "deploy log" expired after 1s with 1 event delivered',
    )
    expect(line('expired after 30m0s with no events delivered')).toBe(
      'Monitor "deploy log" expired after 30m 0s with no events delivered',
    )
    expect(line('stopped after 30s of too much output')).toBe(
      'Monitor "deploy log" stopped after 30s of too much output',
    )
    expect(
      parseSubagentNotice(
        '[Monitor monitor-1 (deploy log) expired after 5m0s with 3 events delivered]',
      ),
    ).toMatchObject({ ended: 'expired', elapsedMs: 300_000, events: 3, body: '' })
  })

  it("takes a host's words for a monitor and falls back to English for the rest", () => {
    const n = parseSubagentNotice('[Monitor monitor-2 (tail) exited with code 0]')!
    const { messageFrom, commandCompleted, commandFailed, agentFinished, agentFailed } =
      defaultSubagentNoticeStrings
    const words: SubagentNoticeStrings = {
      messageFrom,
      commandCompleted,
      commandFailed,
      agentFinished,
      agentFailed,
      monitorEnded: (name) => `${name}: fin`,
    }
    expect(subagentDeliveryLine(n, words)).toBe('tail: fin')
    expect(subagentDeliveryLine({ ...n, exitCode: 1 }, words)).toBe(
      'Monitor "tail" script failed (exit 1)',
    )
  })

  it('keeps the full text of a monitor notice it cannot read', () => {
    expect(parseSubagentNotice('[Monitor monitor-4 (tail) paused for now]')).toBeNull()
    expect(parseSubagentNotice('[Monitor monitor-4 event]\nline')).toBeNull()
  })
})

describe('askQuestionsFromArgs', () => {
  it('reads every question a call asked', () => {
    const args = JSON.stringify({
      questions: [
        {
          question: 'Which db?',
          header: 'Database',
          options: [
            { label: 'Postgres', description: 'Relational', preview: 'CREATE TABLE runs ()' },
            { label: 'Mongo' },
          ],
        },
        { question: 'Which checks?', multiSelect: true, options: [{ label: 'Lint' }] },
        { question: 'Anything else?' },
      ],
    })
    expect(askQuestionsFromArgs(args)).toEqual([
      {
        question: 'Which db?',
        header: 'Database',
        options: [
          { label: 'Postgres', description: 'Relational', preview: 'CREATE TABLE runs ()' },
          { label: 'Mongo' },
        ],
      },
      { question: 'Which checks?', multiSelect: true, options: [{ label: 'Lint' }] },
      { question: 'Anything else?' },
    ])
  })

  it('reads the one question a call made before several per call', () => {
    const args = JSON.stringify({ question: 'Which db?', options: [{ label: 'Postgres' }] })
    expect(askQuestionsFromArgs(args)).toEqual([
      { question: 'Which db?', options: [{ label: 'Postgres' }] },
    ])
  })

  it('skips what is not a question or an option', () => {
    const args = JSON.stringify({
      questions: [
        { question: 'Which db?', multiSelect: 'yes', options: [{ label: 1 }, 'Mongo'] },
        { header: 'No question' },
        null,
      ],
    })
    expect(askQuestionsFromArgs(args)).toEqual([{ question: 'Which db?' }])
    expect(askQuestionsFromArgs('not json')).toEqual([])
  })
})

describe('hiddenTranscriptTool', () => {
  it('hides the tools whose output has its own surface', () => {
    expect(hiddenTranscriptTool('TodoWrite')).toBe(true)
    expect(hiddenTranscriptTool('ExitPlanMode')).toBe(true)
    expect(hiddenTranscriptTool('Bash')).toBe(false)
  })
})
