import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo } from 'react'
import {
  makeComposerPastes,
  makePasteText,
  makeStaticAdapter,
  pasteIntoComposer,
  StoryChat,
} from '../stories/harness'
import type { MessagePaste } from '../types'
import ChatInput from './ChatInput'
import { ComposerControls, ConnectToolsLink } from './ComposerChrome'

const meta: Meta = {
  title: 'Chat/Composer',
  component: ChatInput,
  parameters: { layout: 'fullscreen' },
  // Docked at the foot of the panel, the way a thread shows it, so the dock
  // and its fade read against the surface they belong to.
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'var(--theme-panel-bg)',
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default meta

const send = (text: string, _ids?: string[], _meta?: unknown, pastes?: MessagePaste[]) =>
  console.info('[send]', text, pastes ?? [])

export const Idle: StoryObj<{ disabled: boolean; placeholder: string }> = {
  args: { disabled: false, placeholder: 'Ask anything' },
  render: (args) => (
    <StoryChat>
      <div>
        <ChatInput
          onSend={send}
          disabled={args.disabled}
          placeholder={args.placeholder}
          conversationId="conv-1"
        />
      </div>
    </StoryChat>
  ),
}

// The box as a thread docks it: attach on the left of its toolbar, the model
// and send on the right, and the surface's own links under it. The play opens
// the attach tray inside the box.
export const Toolbar: StoryObj<{ attachOpen: boolean }> = {
  args: { attachOpen: false },
  render: () => {
    const Composer = () => {
      const adapter = useMemo(() => makeStaticAdapter({ attachments: true }), [])
      return (
        <StoryChat adapter={adapter}>
          <div>
            <ChatInput
              onSend={send}
              conversationId="conv-toolbar"
              settingsLeft={<ConnectToolsLink />}
              settingsRight={<ComposerControls />}
            />
          </div>
        </StoryChat>
      )
    }
    return <Composer />
  },
  play: async ({ canvasElement, args }) => {
    if (args.attachOpen) {
      canvasElement.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click()
    }
  },
}

// Text over inlineMaxBytes becomes a card. The play pastes three logs: the
// host saves the first, is still saving the second and refuses the third.
// Pastes of your own are saved.
export const LargePastes: StoryObj<{ inlineMaxBytes: number; uploadMs: number }> = {
  args: { inlineMaxBytes: 4_000, uploadMs: 600 },
  argTypes: {
    inlineMaxBytes: { control: { type: 'range', min: 1_000, max: 64_000, step: 1_000 } },
    uploadMs: { control: { type: 'range', min: 0, max: 5_000, step: 100 } },
  },
  render: (args) => {
    const Composer = () => {
      const { inlineMaxBytes, uploadMs } = args
      const pastes = useMemo(
        () =>
          makeComposerPastes({
            inlineMaxBytes,
            uploadMs,
            outcomes: ['saved', 'saving', 'refused'],
          }),
        // Composer is rebuilt whenever the story's args change.
        [],
      )
      return (
        <StoryChat>
          <div>
            <ChatInput onSend={send} conversationId="conv-pastes" pastes={pastes} />
          </div>
        </StoryChat>
      )
    }
    return <Composer />
  },
  play: async ({ canvasElement }) => {
    for (const lines of [412, 1_280, 96]) {
      pasteIntoComposer(canvasElement, makePasteText(lines))
    }
  },
}
