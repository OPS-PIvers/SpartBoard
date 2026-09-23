import { describe, it, expect } from 'vitest';
import { matchQuestionOpening } from './questionNumbering';

describe('matchQuestionOpening', () => {
  it('reads the bare number styles a test prints', () => {
    expect(matchQuestionOpening('1. What is 3 + 4?')).toEqual({
      number: 1,
      text: 'What is 3 + 4?',
    });
    expect(matchQuestionOpening('12) Name a planet.')?.number).toBe(12);
    expect(matchQuestionOpening('3 . Solve for x.')?.number).toBe(3);
  });

  it('reads a question the teacher labelled instead of numbering', () => {
    expect(matchQuestionOpening('Question 1: What is 3 + 4?')).toEqual({
      number: 1,
      text: 'What is 3 + 4?',
    });
    expect(matchQuestionOpening('Question 2 Name a planet.')).toEqual({
      number: 2,
      text: 'Name a planet.',
    });
    expect(matchQuestionOpening('Q3. Solve for x.')?.number).toBe(3);
    expect(matchQuestionOpening('#4 Round to the nearest ten.')?.number).toBe(
      4
    );
  });

  it('carries no text when the label is alone on its line', () => {
    expect(matchQuestionOpening('Question 5:')).toEqual({
      number: 5,
      text: '',
    });
  });

  it('leaves an instruction line alone', () => {
    // "Questions 1-5 refer to the passage" is a heading, not question 1.
    expect(
      matchQuestionOpening('Questions 1-5 refer to the passage below.')
    ).toBeNull();
    expect(matchQuestionOpening('Quickly name three states.')).toBeNull();
    expect(matchQuestionOpening('The answer is 7 because…')).toBeNull();
  });
});
