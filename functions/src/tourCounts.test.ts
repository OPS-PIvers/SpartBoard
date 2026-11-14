// Tour play counts: one play per new run, one finish per run that reaches the end.
import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_opts: unknown, handler: unknown) => handler),
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./firebaseAdmin', () => ({
  firestore: Object.assign(() => ({}), {
    FieldValue: { increment: (n: number) => ({ inc: n }) },
  }),
}));

import { runCountDelta } from './tourCounts';

const run = (startedAt: number, done = false) => ({ startedAt, done });

describe('runCountDelta', () => {
  it('counts a first run as a play', () => {
    expect(runCountDelta(undefined, run(1))).toEqual({ plays: 1, finished: 0 });
  });
  it('counts nothing for a mid-run save of the same run', () => {
    expect(runCountDelta(run(1), run(1))).toEqual({ plays: 0, finished: 0 });
  });
  it('counts a finish once', () => {
    expect(runCountDelta(run(1), run(1, true))).toEqual({
      plays: 0,
      finished: 1,
    });
    expect(runCountDelta(run(1, true), run(1, true))).toEqual({
      plays: 0,
      finished: 0,
    });
  });
  it('counts a new run that replaces a finished one as a play', () => {
    expect(runCountDelta(run(1, true), run(2))).toEqual({
      plays: 1,
      finished: 0,
    });
  });
  it('counts a run saved finished on its first write as a play and a finish', () => {
    expect(runCountDelta(run(1), run(2, true))).toEqual({
      plays: 1,
      finished: 1,
    });
  });
  it('counts nothing for a delete or a malformed run', () => {
    expect(runCountDelta(run(1), undefined)).toEqual({ plays: 0, finished: 0 });
    expect(runCountDelta(undefined, { startedAt: 'x' })).toEqual({
      plays: 0,
      finished: 0,
    });
  });
});
