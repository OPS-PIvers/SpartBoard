// What the teacher reads after a send: the server's own refusal when it gave one, else a plain reason.

import type { ApiFailure } from '../spartboardApi';
import type { SendReply } from './messages';
import { SchoologyReadError } from './readResult';

export interface SendOutcome {
  ok: boolean;
  text: string;
}

const WHY: Record<ApiFailure, string> = {
  'signed-out':
    'Sign in to Chrome with your Orono account, then send it again.',
  'no-access': "Schoology import isn't available for your account yet.",
  'not-set-up': 'Schoology import is not set up yet.',
  'not-found': 'SpartBoard could not take this quiz.',
  offline:
    "Couldn't reach SpartBoard. Check your connection and send it again.",
};

const isReply = (v: unknown): v is SendReply =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { ok?: unknown }).ok === 'boolean';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function sendOutcome(result: unknown): SendOutcome {
  if (result instanceof SchoologyReadError)
    return { ok: false, text: result.message };
  if (!isReply(result))
    return {
      ok: false,
      text: "Couldn't read this quiz. Try reloading the page.",
    };
  if (result.ok) {
    const pictures = result.pictures
      ? ` and ${plural(result.pictures, 'picture')}`
      : '';
    return {
      ok: true,
      text: `Sent ${plural(result.questions, 'question')}${pictures}.`,
    };
  }
  return { ok: false, text: result.message ?? WHY[result.why] };
}
