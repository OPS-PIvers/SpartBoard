import { describe, it, expect } from 'vitest';
import { parseLastVideoAssignSettings } from '@/hooks/useLastVideoAssignSettings';

const valid = {
  behavior: {
    sessionMode: 'student',
    attemptLimit: 2,
    sessionOptions: {
      tabWarningsEnabled: false,
      tabWarningThreshold: 'off',
      showResultToStudent: false,
      scoreVisibility: 'score-only',
    },
  },
  player: { autoPlay: true, requireCorrectAnswer: false, allowSkipping: true },
};

describe('parseLastVideoAssignSettings', () => {
  it('round-trips a well-formed value', () => {
    expect(parseLastVideoAssignSettings(valid)).toEqual(valid);
  });

  it('accepts unlimited attempts', () => {
    const parsed = parseLastVideoAssignSettings({
      ...valid,
      behavior: { ...valid.behavior, attemptLimit: null },
    });
    expect(parsed?.behavior.attemptLimit).toBeNull();
  });

  it.each([
    null,
    'x',
    {},
    { behavior: {} },
    { behavior: { sessionOptions: {} } },
  ])('rejects %j', (raw) => {
    expect(parseLastVideoAssignSettings(raw)).toBeNull();
  });

  it.each([0, -1, 1.5, '2'])('rejects attemptLimit %j', (attemptLimit) => {
    expect(
      parseLastVideoAssignSettings({
        ...valid,
        behavior: { ...valid.behavior, attemptLimit },
      })
    ).toBeNull();
  });

  it('drops ill-typed options and forces self-paced', () => {
    const parsed = parseLastVideoAssignSettings({
      ...valid,
      behavior: {
        ...valid.behavior,
        sessionMode: 'teacher',
        sessionOptions: {
          showResultToStudent: 'yes',
          scoreVisibility: 'everything',
          tabWarningThreshold: 'sometimes',
          rewindOnIncorrectSeconds: Number.NaN,
          shuffleAnswerOptions: false,
        },
      },
    });
    expect(parsed?.behavior).toEqual({
      sessionMode: 'student',
      attemptLimit: 2,
      sessionOptions: { shuffleAnswerOptions: false },
    });
  });

  it('fills missing or ill-typed player rules with the drawer defaults', () => {
    const parsed = parseLastVideoAssignSettings({
      behavior: valid.behavior,
      player: { autoPlay: 'on' },
    });
    expect(parsed?.player).toEqual({
      autoPlay: false,
      requireCorrectAnswer: true,
      allowSkipping: false,
    });
  });
});
