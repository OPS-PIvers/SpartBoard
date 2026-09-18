import { describe, it, expect } from 'vitest';
import {
  applyQuestionText,
  isPlaceholderQuestion,
  parseNumberedQuestions,
} from './paperQuestionOcr';
import { buildPaperStubQuiz } from './paperSheetPlan';

const PAPER = `SPARTRON  SPARTBOARD RESPONSES
Unit 3 Test
Name ________   Class ________

1. What is the value of 3 + 4?
A. 6
B. 7
C. 8
D. 9
2. Which planet is closest
to the Sun?
(A) Venus
(B) Mercury
3 . Solve for x when 2x = 10.
a) 4
b) 5
4. Skipped on purpose, comes after a gap
`;

describe('parseNumberedQuestions', () => {
  it('reads numbered questions, joins wrapped lines and drops option lines', () => {
    const parsed = parseNumberedQuestions(PAPER, 5);
    expect(parsed.byNumber).toEqual({
      1: 'What is the value of 3 + 4?',
      2: 'Which planet is closest to the Sun?',
      3: 'Solve for x when 2x = 10.',
      4: 'Skipped on purpose, comes after a gap',
    });
    expect(parsed.missing).toEqual([5]);
  });

  it('ignores a number that would step backwards or past the count', () => {
    const parsed = parseNumberedQuestions(
      '1. First\n7. Too far\n1. Not again\nstill first\n2. Second',
      3
    );
    expect(parsed.byNumber).toEqual({
      1: 'First 7. Too far 1. Not again still first',
      2: 'Second',
    });
    expect(parsed.missing).toEqual([3]);
  });

  it('applies text only where the teacher chose to and keeps the rest', () => {
    const quiz = buildPaperStubQuiz({
      quizId: 'q',
      title: 'T',
      questionCount: 3,
      choiceCount: 4,
      createdAt: 0,
    });
    expect(isPlaceholderQuestion(quiz.questions[0].text)).toBe(true);
    expect(isPlaceholderQuestion('Question 12?')).toBe(false);
    const next = applyQuestionText(quiz, { 1: 'What is 3 + 4?', 3: '  ' }, 9);
    expect(next.questions.map((q) => q.text)).toEqual([
      'What is 3 + 4?',
      'Question 2',
      'Question 3',
    ]);
    expect(next.updatedAt).toBe(9);
    expect(applyQuestionText(next, { 1: 'What is 3 + 4?' }, 10)).toBe(next);
  });
});
