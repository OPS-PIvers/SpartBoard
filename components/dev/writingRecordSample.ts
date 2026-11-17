// Sample Writing records built with the real recorder, for the dev harness pages.
import { WritingRecorder } from '@/utils/writingRecorder';
import type { WritingRecordChunk } from '@/utils/writingRecord';
import type { WritingDraft, WritingResponseSummary } from '@/types';

export const SAMPLE_START = Date.UTC(2026, 10, 16, 14, 5);

export interface WritingRecordSample {
  chunks: WritingRecordChunk[];
  summary: WritingResponseSummary;
  drafts: Pick<WritingDraft, 'number' | 'logMark'>[];
}

/** Two sittings of writing with a paste, a dictated sentence, revisions and two turn ins. */
export function buildWritingRecordSample(
  chunkBytes?: number
): WritingRecordSample {
  const rec = new WritingRecorder({
    log: '',
    startText: '',
    chunk: 0,
    base: null,
    chunkBytes,
  });
  const chunks: WritingRecordChunk[] = [];
  const drafts: WritingRecordSample['drafts'] = [];
  let text = '';
  let t = 0;
  let wall = SAMPLE_START;
  const settle = () => {
    for (let c = rec.nextClosing; c; c = rec.nextClosing) {
      chunks.push({ index: c.index, log: c.log });
      rec.confirmClosed(c.index);
    }
  };
  const step = (next: string, ms: number, kind: 'typed' | 'pasted') => {
    t += ms;
    wall += ms;
    rec.edit(text, next, t, kind, wall);
    text = next;
    settle();
  };
  const type = (s: string, ms = 180) => {
    for (const ch of s) step(text + ch, ms, 'typed');
  };
  const erase = (n: number) => {
    for (let i = 0; i < n; i += 1) step(text.slice(0, -1), 120, 'typed');
  };
  const turnIn = () =>
    drafts.push({
      number: drafts.length + 1,
      logMark: { chunk: rec.openChunk.index, length: rec.openChunk.log.length },
    });

  type('The morning of the science fair, I dropped my volcano ');
  type('in the parkng');
  erase(6);
  type('parking lot. ');
  t += 14_000;
  wall += 14_000;
  type('Baking soda went everywhere, and the cone folded in half.\n');
  step(
    `${text}Volcanoes form where magma reaches the surface of the earth. `,
    600,
    'pasted'
  );
  type('My little brother picked up the pieces and handed me the tape.\n');
  turnIn();
  // The next day: a new Writing session.
  wall += 20 * 60 * 60_000;
  t += 1_000;
  // A sentence an extension added: the next keystroke records it as untyped.
  text += 'We rebuilt it on the hood of the car in twenty minutes.';
  type(' It was not perfect, but it worked.\n', 200);
  type('That was the day I learned that a plan B is still a plan.', 210);
  turnIn();
  const open = rec.openChunk;
  chunks.push({ index: open.index, log: open.log });
  const summary = {
    ...rec.summary(118, wall),
    awayMs: 74_000,
    awayCount: 2,
  };
  return { chunks, summary, drafts };
}
