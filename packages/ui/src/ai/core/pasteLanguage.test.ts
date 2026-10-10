import { describe, expect, it } from 'vitest'
import { fencePaste, guessPasteLanguage } from './pasteLanguage'

describe('guessPasteLanguage', () => {
  it.each([
    ['yaml', 'partitions:\n  - name: compute\n    nodes: 12\n  - name: gpu\n    nodes: 4'],
    ['yaml', '# cluster\nname: demo\nreplicas: 3\n'],
    ['json', '{\n  "name": "demo",\n  "replicas": 3\n}'],
    ['json', '[1, 2, 3]'],
    ['toml', '[server]\nport = 8080\nhost = "0.0.0.0"'],
    ['diff', 'diff --git a/x b/x\n@@ -1 +1 @@\n-old\n+new'],
    ['bash', '#!/usr/bin/env bash\nset -e\nmake'],
    ['bash', '$ go test ./...\n$ make check'],
    ['sql', 'SELECT id, name\nFROM users\nWHERE active'],
    ['html', '<!doctype html>\n<html><body></body></html>'],
    ['xml', '<config>\n  <port>8080</port>\n</config>'],
  ])('reads %s', (language, text) => {
    expect(guessPasteLanguage(text)).toBe(language)
  })

  it.each([
    ['prose', 'The build fails at step 380.\nIt worked yesterday.'],
    ['a log', '2026-10-08 12:00:01 INFO starting\n2026-10-08 12:00:02 ERROR no nodes'],
    ['broken json', '{ "name": '],
    ['a single key line', 'note: this is just one line'],
    ['nothing', '   \n'],
  ])('leaves %s as plain text', (_, text) => {
    expect(guessPasteLanguage(text)).toBe('')
  })
})

describe('fencePaste', () => {
  it('fences the paste in its language without its trailing newlines', () => {
    expect(fencePaste('a: 1\nb: 2\n\n')).toBe('```yaml\na: 1\nb: 2\n```')
  })

  it('outruns backticks inside the paste', () => {
    expect(fencePaste('use ```code``` here')).toBe('````\nuse ```code``` here\n````')
  })
})
