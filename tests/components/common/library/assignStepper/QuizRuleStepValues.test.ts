import { describe, it, expect } from 'vitest';
import type { QuizBehaviorSettings, QuizSessionOptions } from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import {
  formatQuizAttemptsValue,
  formatQuizFeedbackValue,
  formatQuizIntegrityValue,
} from '@/components/common/library/assignStepper/QuizRuleStepValues';

const make = (
  options: Partial<QuizSessionOptions> = {},
  attemptLimit: number | null = 1
): QuizBehaviorSettings => ({
  ...DEFAULT_QUIZ_BEHAVIOR,
  attemptLimit,
  sessionOptions: { ...DEFAULT_QUIZ_BEHAVIOR.sessionOptions, ...options },
});

describe('formatQuizAttemptsValue', () => {
  it('reads the defaults', () => {
    expect(formatQuizAttemptsValue(make())).toBe('1 attempt, Shuffled answers');
  });

  it('pluralises attempts and names unlimited', () => {
    expect(
      formatQuizAttemptsValue(make({ shuffleAnswerOptions: false }, 3))
    ).toBe('3 attempts');
    expect(
      formatQuizAttemptsValue(make({ shuffleAnswerOptions: false }, null))
    ).toBe('Unlimited attempts');
  });

  it('shows the time limit only when its flag is on', () => {
    const v = make({ timeLimitMinutes: 20, shuffleAnswerOptions: false });
    expect(formatQuizAttemptsValue(v)).toBe('1 attempt');
    expect(formatQuizAttemptsValue(v, { timeLimitOn: true })).toBe(
      '1 attempt, 20 min'
    );
  });

  it('names which parts are shuffled', () => {
    expect(formatQuizAttemptsValue(make({ shuffleQuestions: true }))).toBe(
      '1 attempt, Shuffled'
    );
    expect(
      formatQuizAttemptsValue(
        make({ shuffleQuestions: true, shuffleAnswerOptions: false })
      )
    ).toBe('1 attempt, Shuffled questions');
  });
});

describe('formatQuizIntegrityValue', () => {
  it('lists focus mode and copy blocking, or Off', () => {
    expect(formatQuizIntegrityValue(make())).toBe('Focus mode');
    expect(
      formatQuizIntegrityValue(
        make({ tabWarningsEnabled: false, blockCopyPaste: true })
      )
    ).toBe('No copy and paste');
    expect(formatQuizIntegrityValue(make({ tabWarningsEnabled: false }))).toBe(
      'Off'
    );
  });
});

describe('formatQuizFeedbackValue', () => {
  const on = { scoreOnSubmitOn: true };

  it('reads each feedback level', () => {
    expect(formatQuizFeedbackValue(make(), on)).toBe(
      'Nothing until I release results'
    );
    expect(formatQuizFeedbackValue(make({ showScoreOnSubmit: true }), on)).toBe(
      'Their score'
    );
    expect(
      formatQuizFeedbackValue(
        make({ showScoreOnSubmit: true, showResultToStudent: true }),
        on
      )
    ).toBe('Their score and which answers were right');
    expect(
      formatQuizFeedbackValue(
        make({
          showScoreOnSubmit: true,
          showResultToStudent: true,
          showCorrectAnswerToStudent: true,
        }),
        on
      )
    ).toBe('Score, right and wrong, and the correct answers');
  });

  it('ignores the score when its flag is off or a question needs a teacher grade', () => {
    const v = make({ showScoreOnSubmit: true });
    expect(formatQuizFeedbackValue(v)).toBe('Nothing until I release results');
    expect(formatQuizFeedbackValue(v, { ...on, hasManualGrading: true })).toBe(
      'Nothing until I release results'
    );
  });

  it('falls back to Custom', () => {
    expect(
      formatQuizFeedbackValue(make({ showResultToStudent: true }), on)
    ).toBe('Custom');
  });
});
