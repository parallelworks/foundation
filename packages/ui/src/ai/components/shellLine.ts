/** A line a composer with a shell runs as a shell command, as a terminal's shell mode does. */
export function isShellLine(text: string): boolean {
  return text.trimStart().startsWith('!')
}

/** What a shell line runs: the text after its `!`, which the box shows beside its prompt. */
export function shellText(line: string): string {
  return line.slice(line.indexOf('!') + 1)
}
