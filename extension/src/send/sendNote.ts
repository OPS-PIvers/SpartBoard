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
  'needs-update': 'Send to SpartBoard is not set up yet.',
  blocked: 'Your district turned off sending from this page.',
};

const isReply = (v: unknown): v is SendReply =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { ok?: unknown }).ok === 'boolean';

export type SendNoteInput =
  | { kind: 'blocked' }
  | { kind: 'empty'; selectionOnly?: boolean }
  | { kind: 'not-youtube' }
  | {
      kind: 'reply';
      reply: unknown;
      selectionOnly?: boolean;
      /** The Platform reader that couldn't read the page; true for Schoology's quiz reader. */
      fellBack?: boolean | 'edpuzzle' | 'quizlet' | 'google-forms';
      /** An Edpuzzle lesson went as a lesson; `skipped` questions had no SpartBoard kind. */
      lesson?: { skipped: number };
      /** A Quizlet set went as cards; how many. */
      cards?: number;
      /** A Google Form went as a form; how many questions. */
      questions?: number;
    };

export function sendNote(input: SendNoteInput): SendNote {
  if (input.kind === 'blocked') return { ok: false, text: WHY.blocked };
  if (input.kind === 'not-youtube')
    return {
      ok: false,
      text: "This lesson's video is stored on Edpuzzle, so it can't play in SpartBoard. Only lessons made from a YouTube video can be sent.",
    };
  if (input.kind === 'empty' && input.selectionOnly)
    return {
      ok: false,
      text: 'Your selection has no text that can be sent. Select text on the page itself, not in a box you type in.',
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
  if (input.lesson) {
    const { skipped } = input.lesson;
    const left =
      skipped === 1
        ? ' 1 question SpartBoard has no kind for was skipped.'
        : skipped > 1
          ? ` ${skipped} questions SpartBoard has no kind for were skipped.`
          : '';
    return {
      ok: true,
      open: 'import',
      text: `Sent this lesson to SpartBoard.${left}`,
    };
  }
  if (input.cards !== undefined)
    return {
      ok: true,
      open: 'import',
      text: `Sent this set to SpartBoard (${input.cards === 1 ? '1 card' : `${input.cards} cards`}).`,
    };
  if (input.questions !== undefined)
    return { ok: true, open: 'import', text: 'Sent to SpartBoard.' };
  if (input.fellBack === 'google-forms')
    return {
      ok: true,
      open: 'import',
      text: 'Form couldn’t be read. Page text was sent to SpartBoard.',
    };
  const what = input.selectionOnly ? 'your selection' : 'this page';
  const reader =
    input.fellBack === 'edpuzzle'
      ? 'The Edpuzzle reader'
      : input.fellBack === 'quizlet'
        ? 'The Quizlet reader'
        : 'The quiz reader';
  return {
    ok: true,
    open: 'import',
    text: input.fellBack
      ? `${reader} couldn't read this page, so SpartBoard got ${what} as text instead.`
      : `Sent ${what} to SpartBoard.`,
  };
}
