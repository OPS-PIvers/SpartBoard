import { describe, expect, it, vi } from 'vitest';
import type * as admin from 'firebase-admin';
import {
  isPeriodFrozen,
  PERIOD_WINDOW_GRACE_MS,
  withQuizSessionContent,
} from './quizSessionContent';

const NOW = 1_000_000;

function refWithContent(content: Record<string, unknown> | undefined) {
  const get = vi.fn(() => Promise.resolve({ data: () => content }));
  const ref = {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get })) })),
  } as unknown as admin.firestore.DocumentReference;
  return { ref, get };
}

describe('withQuizSessionContent', () => {
  it('leaves a session with inline questions alone and reads nothing', async () => {
    const { ref, get } = refWithContent({ publicQuestions: [{ id: 'x' }] });
    const data = { publicQuestions: [{ id: 'q1' }] };
    expect(await withQuizSessionContent(ref, data)).toBe(data);
    expect(get).not.toHaveBeenCalled();
  });

  it('folds the content doc back in for a per-period session', async () => {
    const { ref } = refWithContent({
      publicQuestions: [{ id: 'q1' }],
      stimuli: [{ id: 's1' }],
    });
    const out = await withQuizSessionContent(ref, {
      questionsInContent: true,
      publicQuestions: [],
      teacherUid: 't',
    });
    expect(out).toEqual({
      questionsInContent: true,
      publicQuestions: [{ id: 'q1' }],
      stimuli: [{ id: 's1' }],
      teacherUid: 't',
    });
  });
});

describe('isPeriodFrozen', () => {
  const open = { state: 'open', openAt: null, closeAt: null };
  const session = {
    periodAccess: {
      A: open,
      B: { ...open, state: 'paused' },
      C: { ...open, openAt: NOW + PERIOD_WINDOW_GRACE_MS + 1 },
      D: { ...open, closeAt: NOW - PERIOD_WINDOW_GRACE_MS },
    },
  };

  it('never freezes a legacy session', () => {
    expect(isPeriodFrozen({}, { classId: 'A' }, NOW)).toBe(false);
  });

  it('follows the response period', () => {
    expect(isPeriodFrozen(session, { classId: 'A' }, NOW)).toBe(false);
    expect(isPeriodFrozen(session, { classId: 'B' }, NOW)).toBe(true);
    expect(isPeriodFrozen(session, { classId: 'C' }, NOW)).toBe(true);
    expect(isPeriodFrozen(session, { classId: 'D' }, NOW)).toBe(true);
    expect(isPeriodFrozen(session, {}, NOW)).toBe(true);
  });

  it('gives the window edges the same grace as the rules', () => {
    const edges = {
      periodAccess: {
        E: { ...open, openAt: NOW + PERIOD_WINDOW_GRACE_MS },
        F: { ...open, closeAt: NOW - PERIOD_WINDOW_GRACE_MS + 1 },
      },
    };
    expect(isPeriodFrozen(edges, { classId: 'E' }, NOW)).toBe(false);
    expect(isPeriodFrozen(edges, { classId: 'F' }, NOW)).toBe(false);
  });

  it('lets an unexpired Let in now pass through', () => {
    const withPass = { ...session, studentAccess: { u: NOW + 1 } };
    expect(
      isPeriodFrozen(withPass, { classId: 'B', studentUid: 'u' }, NOW)
    ).toBe(false);
  });
});
