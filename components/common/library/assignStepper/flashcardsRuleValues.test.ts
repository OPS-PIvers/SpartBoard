import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLASHCARD_CHECK_RULES,
  behaviorToFlashcardRules,
  flashcardRulesToBehavior,
  parseFlashcardCheckRules,
  rulesFromScoreVisibility,
  scoreVisibilityFromRules,
} from './flashcardsRuleValues';
import { formatQuizAttemptsValue } from './QuizRuleStepValues';

describe('flashcardsRuleValues', () => {
  it("maps the What students see switches to Quiz's results levels", () => {
    expect(scoreVisibilityFromRules(rulesFromScoreVisibility('none'))).toBe(
      'none'
    );
    expect(scoreVisibilityFromRules(rulesFromScoreVisibility('score'))).toBe(
      'score-only'
    );
    expect(
      scoreVisibilityFromRules(rulesFromScoreVisibility('score-and-answers'))
    ).toBe('score-responses-and-answers');
    const rightWrongOnly = rulesFromScoreVisibility('score');
    rightWrongOnly.sessionOptions.showResultToStudent = true;
    expect(scoreVisibilityFromRules(rightWrongOnly)).toBe(
      'score-and-responses'
    );
  });

  it('defaults to one attempt with the score shown, as Flashcards did', () => {
    expect(DEFAULT_FLASHCARD_CHECK_RULES.attemptLimit).toBe(1);
    expect(scoreVisibilityFromRules(DEFAULT_FLASHCARD_CHECK_RULES)).toBe(
      'score-only'
    );
  });

  it('round-trips through the Quiz behavior shape without Quiz-only keys', () => {
    const behavior = flashcardRulesToBehavior(DEFAULT_FLASHCARD_CHECK_RULES);
    expect(behavior.sessionOptions.shuffleAnswerOptions).toBe(false);
    const back = behaviorToFlashcardRules({
      ...behavior,
      attemptLimit: null,
      sessionOptions: {
        ...behavior.sessionOptions,
        timeLimitMinutes: 20,
        speedBonusEnabled: true,
      },
    });
    expect(back.attemptLimit).toBeNull();
    expect(back.sessionOptions.timeLimitMinutes).toBe(20);
    expect(back.sessionOptions).not.toHaveProperty('shuffleAnswerOptions');
    expect(back.sessionOptions).not.toHaveProperty('speedBonusEnabled');
  });

  it('parses only well-typed saved rules', () => {
    expect(parseFlashcardCheckRules(null)).toBeNull();
    const parsed = parseFlashcardCheckRules({
      attemptLimit: 'x',
      sessionOptions: {
        shuffleQuestions: true,
        timeLimitMinutes: -5,
        tabWarningThreshold: 'off',
        focusLevel: 'nope',
        blockCopyPaste: 'yes',
      },
    });
    expect(parsed?.attemptLimit).toBe(1);
    expect(parsed?.sessionOptions.shuffleQuestions).toBe(true);
    expect(parsed?.sessionOptions.timeLimitMinutes).toBeUndefined();
    expect(parsed?.sessionOptions.tabWarningThreshold).toBe('off');
    expect(parsed?.sessionOptions.focusLevel).toBeUndefined();
    expect(parsed?.sessionOptions.blockCopyPaste).toBe(false);
    expect(parseFlashcardCheckRules({ attemptLimit: null })?.attemptLimit).toBe(
      null
    );
  });

  it('names cards in the Attempts and order summary', () => {
    const behavior = flashcardRulesToBehavior({
      attemptLimit: 2,
      sessionOptions: { shuffleQuestions: true },
    });
    expect(formatQuizAttemptsValue(behavior, { flashcards: true })).toBe(
      '2 attempts, Shuffled cards'
    );
  });
});
