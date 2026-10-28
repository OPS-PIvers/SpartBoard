import { describe, it, expect } from 'vitest';
import { parseLastVideoAssignSettings } from '@/hooks/useLastVideoAssignSettings';
import {
  videoRulesFromLastUsed,
  withoutAssignTimeOptions,
} from '@/components/common/library/assignStepper/VideoRuleStepValues';

const valid = {
  behavior: {
    sessionMode: 'student',
    attemptLimit: 2,
    sessionOptions: {
      tabWarningsEnabled: false,
      tabWarningThreshold: 'off',
      showResultToStudent: false,
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

  it('keeps only the rows the steps edit, well typed and in range', () => {
    const parsed = parseLastVideoAssignSettings({
      ...valid,
      behavior: {
        ...valid.behavior,
        sessionMode: 'teacher',
        sessionOptions: {
          showResultToStudent: 'yes',
          scoreVisibility: 'none',
          dueAt: 123,
          answerRulesSet: true,
          rewindOnIncorrectSeconds: 5,
          tabWarningThreshold: 0,
          tabAwayLimitSeconds: 60,
          tabAwayAutoSubmit: true,
          shuffleAnswerOptions: false,
        },
      },
    });
    expect(parsed?.behavior).toEqual({
      sessionMode: 'student',
      attemptLimit: 2,
      sessionOptions: {
        shuffleAnswerOptions: false,
        tabAwayAutoSubmit: true,
        tabAwayLimitSeconds: 60,
      },
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

describe('videoRulesFromLastUsed', () => {
  it('lays the remembered rows over this activity and keeps its hidden fields', () => {
    const last = parseLastVideoAssignSettings(valid);
    if (!last) throw new Error('parse failed');
    const rules = videoRulesFromLastUsed(
      {
        sessionMode: 'teacher',
        attemptLimit: 1,
        sessionOptions: {
          scoreVisibility: 'none',
          showResultToStudent: true,
          shuffleAnswerOptions: false,
        },
      },
      last
    );
    expect(rules.behavior.attemptLimit).toBe(2);
    expect(rules.behavior.sessionOptions).toEqual({
      scoreVisibility: 'none',
      shuffleAnswerOptions: true,
      showResultToStudent: false,
      showCorrectAnswerToStudent: true,
      tabWarningsEnabled: false,
      tabWarningThreshold: 'off',
    });
    expect(rules.player).toEqual(valid.player);
  });
});

describe('withoutAssignTimeOptions', () => {
  it('drops due date, stamp and attempt keys a saved behavior may carry', () => {
    expect(
      withoutAssignTimeOptions({
        tabWarningsEnabled: true,
        dueAt: 5,
        dueAtHasTime: true,
        answerRulesSet: true,
        attemptLimit: 4,
      } as never)
    ).toEqual({ tabWarningsEnabled: true });
  });
});
