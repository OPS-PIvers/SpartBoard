// Reads one Schoology quiz or bank in the teacher's session and posts it to the Schoology inbox; used by both Send buttons.

import { readFromSchoology, type ReadDeps } from './fetchRead';
import type { SchoologyMessage, SendReply } from './messages';
import type { SchoologyItem } from './page';
import { collectPictures, inboxRequest } from './payload';
import { SchoologyReadError } from './readResult';
import { sendOutcome, type SendOutcome } from './sendOutcome';

const PAUSE_MS = 250;

const get = (path: string) =>
  fetch(path, { credentials: 'include', headers: { Accept: '*/*' } });

const readDeps = (onProgress?: ReadDeps['onProgress']): ReadDeps => ({
  get,
  origin: location.origin,
  pause: () => new Promise((r) => setTimeout(r, PAUSE_MS)),
  onProgress,
});

const ask = <T>(message: SchoologyMessage) =>
  chrome.runtime.sendMessage<SchoologyMessage, T>(message);

function itemUrl(item: SchoologyItem): string {
  if (item.kind === 'testQuiz')
    return `${location.origin}/assignment/${item.itemId}`;
  if (item.kind === 'questionBank')
    return item.bank === 'item'
      ? `${location.origin}/common-assessment-question-banks/${item.itemId}`
      : `${location.origin}/resources/my/${item.collectionId ?? ''}?f=${item.itemId}`;
  return `${location.origin}/course/${item.sectionId ?? ''}/assessments/${item.itemId}`;
}

/** Reads one quiz, copies its pictures and posts it to the inbox. */
export async function sendItem(
  item: SchoologyItem,
  courseName: string | null,
  onProgress?: ReadDeps['onProgress']
): Promise<SendOutcome & { readError?: string }> {
  try {
    const read = await readFromSchoology(item, readDeps(onProgress));
    const pictures = await collectPictures(
      read.imageUrls,
      get,
      location.origin
    );
    const reply = await ask<SendReply>({
      type: 'schoology/send',
      request: inboxRequest(item, read, courseName, pictures, itemUrl(item)),
    });
    return sendOutcome(reply);
  } catch (error) {
    // A reader that no longer matches Schoology's page lets the universal Send fall back (IMPORT D18); a refusal or outage doesn't.
    if (error instanceof SchoologyReadError && !error.transport)
      return { ...sendOutcome(error), readError: error.message };
    return sendOutcome(error);
  }
}
