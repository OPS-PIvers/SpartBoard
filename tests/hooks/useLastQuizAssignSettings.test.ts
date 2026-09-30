import { describe, it, expect } from 'vitest';
import { parseLastQuizAssignSettings } from '@/hooks/useLastQuizAssignSettings';
import {
  DEFAULT_QUIZ_BEHAVIOR,
  getQuizAssignPrefill,
} from '@/utils/quizBehavior';

describe('parseLastQuizAssignSettings', () => {
  it('keeps typed option values and forces Assessment Mode', () => {
    expect(
      parseLastQuizAssignSettings({
        sessionMode: 'teacher',
        sessionOptions: {
          blockCopyPaste: true,
          tabWarningThreshold: 'off',
          tabAwayLimitSeconds: 30,
          dueAt: { nested: true },
          junk: 'x',
        },
        attemptLimit: null,
      })
    ).toEqual({
      sessionMode: 'student',
      sessionOptions: {
        blockCopyPaste: true,
        tabWarningThreshold: 'off',
        tabAwayLimitSeconds: 30,
      },
      attemptLimit: null,
    });
  });

  it.each([
    null,
    'x',
    { sessionOptions: {}, attemptLimit: 0 },
    { sessionOptions: {}, attemptLimit: 1.5 },
    { attemptLimit: 1 },
  ])('rejects malformed value %#', (raw) => {
    expect(parseLastQuizAssignSettings(raw)).toBeNull();
  });
});

describe('getQuizAssignPrefill', () => {
  it('falls back to the default on first use', () => {
    expect(getQuizAssignPrefill(null)).toEqual(DEFAULT_QUIZ_BEHAVIOR);
  });

  it('strips gamification and board reveal from last-used settings', () => {
    const prefill = getQuizAssignPrefill({
      sessionMode: 'student',
      sessionOptions: { speedBonusEnabled: true, showCorrectOnBoard: true },
      attemptLimit: 2,
    });
    expect(prefill.sessionOptions.speedBonusEnabled).toBe(false);
    expect(prefill.sessionOptions.showCorrectOnBoard).toBe(false);
    expect(prefill.attemptLimit).toBe(2);
  });
});
