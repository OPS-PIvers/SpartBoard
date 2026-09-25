import { describe, it, expect } from 'vitest';
import {
  applyQuestionText,
  fillStubKey,
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
  it('reads questions the teacher labelled rather than numbered', () => {
    const parsed = parseNumberedQuestions(
      `Question 1: What is the value of 3 + 4?
A. 6
B. 7
Question 2: Which planet is closest
to the Sun?
`,
      2
    );
    expect(parsed.byNumber[1]).toBe('What is the value of 3 + 4?');
    expect(parsed.byNumber[2]).toBe('Which planet is closest to the Sun?');
    expect(parsed.missing).toEqual([]);
  });

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

describe('fillStubKey (R17)', () => {
  const stubQuiz = buildPaperStubQuiz({
    quizId: 'q',
    title: 'Paper',
    questionCount: 3,
    choiceCount: 4,
    createdAt: 0,
    newQuestionId: (() => {
      let n = 0;
      return () => `q${++n}`;
    })(),
  });

  it('puts the key letter on a bare stub row and reports what it could not place', () => {
    const result = fillStubKey(stubQuiz.questions, [
      { item: 1, answer: 'C' },
      { item: 2, answer: 'E' },
      { item: 9, answer: 'A' },
    ]);
    expect(result.filled).toEqual(['q1']);
    expect(result.questions[0]).toMatchObject({
      correctAnswer: 'C',
      incorrectAnswers: ['A', 'B', 'D'],
    });
    expect(result.questions[0].needsKey).toBeUndefined();
    // An unfilled row is handed back exactly as it was.
    expect(result.questions[1]).toBe(stubQuiz.questions[1]);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      'key says E, question has 4 choices',
      'no question with this number',
    ]);
  });

  it('fills a row the test already read, by its choice', () => {
    const read = {
      ...stubQuiz.questions[0],
      text: 'Which is a planet?',
      correctAnswer: '',
      incorrectAnswers: ['Sun', 'Mars', 'Moon'],
      needsKey: true,
    };
    const result = fillStubKey([read], [{ item: 1, answer: 'B' }]);
    expect(result.questions[0]).toMatchObject({
      correctAnswer: 'Mars',
      incorrectAnswers: ['Sun', 'Moon'],
    });
  });

  it('never overwrites a question the teacher already keyed', () => {
    const keyed = {
      ...stubQuiz.questions[0],
      correctAnswer: 'Mars',
      incorrectAnswers: ['Sun', 'Moon'],
    };
    const result = fillStubKey([keyed], [{ item: 1, answer: 'A' }]);
    expect(result.filled).toEqual([]);
    expect(result.skipped[0].reason).toBe('already answered — skipped');
  });
});
