// What the teacher reads after a Send: the server's own refusal when it gave one, else a plain reason.

import type { ApiFailure } from '../spartboardApi';
import type { SendReply } from './messages';

export interface SendNote {
  ok: boolean;
  text: string;
  /** Which inbox "Open in SpartBoard" opens; absent when there's nothing to open. */
  open?: 'import' | 'schoology';
}

const WHY: Record<ApiFailure | 'blocked', string> = {
  'signed-out':
    'Sign in to Chrome with your Orono account, then send it again.',
  'no-access': "Send to SpartBoard isn't available for your account yet.",
  'not-set-up': 'Send to SpartBoard is not set up yet.',
  'not-found': 'SpartBoard could not take this page.',
  offline:
    "Couldn't reach SpartBoard. Check your connection and send it again.",
  blocked: 'Your district turned off sending from this page.',
};

const isReply = (v: unknown): v is SendReply =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { ok?: unknown }).ok === 'boolean';

export type SendNoteInput =
  | { kind: 'blocked' }
  | { kind: 'empty'; selectionOnly?: boolean }
  | {
      kind: 'reply';
      reply: unknown;
      selectionOnly?: boolean;
      fellBack?: boolean;
    };

export function sendNote(input: SendNoteInput): SendNote {
  if (input.kind === 'blocked') return { ok: false, text: WHY.blocked };
  if (input.kind === 'empty' && input.selectionOnly)
    return {
      ok: false,
      text: "Text in a box you type in can't be sent. Select text on the page instead.",
    };
  if (input.kind === 'empty')
    return {
      ok: false,
      text: 'There is no text to send on this page. Select some text and send it again.',
    };
  const { reply } = input;
  if (!isReply(reply))
    return {
      ok: false,
      text: "Couldn't send this page. Try reloading it.",
    };
  if (!reply.ok) return { ok: false, text: reply.message ?? WHY[reply.why] };
  const what = input.selectionOnly ? 'your selection' : 'this page';
  return {
    ok: true,
    open: 'import',
    text: input.fellBack
      ? `The quiz reader couldn't read this page, so SpartBoard got ${what} as text instead.`
      : `Sent ${what} to SpartBoard.`,
  };
}
