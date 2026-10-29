// Messages between the Schoology content script and the service worker, which alone may call SpartBoard (CORS).

import type { ApiFailure } from '../spartboardApi';
import type { InboxRequest } from './payload';

export const SCHOOLOGY_CONTENT_FILE = 'schoology.js';

export type SchoologyMessage =
  | { type: 'schoology/send'; request: InboxRequest }
  | { type: 'schoology/open' };

export type SendReply =
  | { ok: true; questions: number; pictures: number }
  | { ok: false; why: ApiFailure; message?: string };

export function parseSchoologyMessage(raw: unknown): SchoologyMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const msg = raw as { type?: unknown; request?: unknown };
  if (msg.type === 'schoology/open') return { type: 'schoology/open' };
  if (
    msg.type === 'schoology/send' &&
    typeof msg.request === 'object' &&
    msg.request !== null
  )
    // The server checks every field; this only routes it.
    return { type: 'schoology/send', request: msg.request as InboxRequest };
  return null;
}
