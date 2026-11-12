import { describe, it, expect } from 'vitest';
import {
  hasAnswerContent,
  reviewCounts,
  reviewRows,
  reviewStepActive,
} from '@/utils/quizReviewStep';
import { joinBlanks } from '@/utils/quizFibBlanks';

describe('reviewStepActive (M23, M25)', () => {
  it('is on only for a self-paced session stamped with the flag', () => {
    expect(reviewStepActive({ reviewStep: true, sessionMode: 'student' })).toBe(
      true
    );
    expect(reviewStepActive({ reviewStep: true, sessionMode: 'teacher' })).toBe(
      false
    );
    expect(reviewStepActive({ reviewStep: true, sessionMode: 'auto' })).toBe(
      false
    );
    expect(reviewStepActive({ sessionMode: 'student' })).toBe(false);
  });
});

describe('hasAnswerContent', () => {
  it('reads each wire format', () => {
    expect(hasAnswerContent('MC', '4')).toBe(true);
    expect(hasAnswerContent('MC', '  ')).toBe(false);
    expect(hasAnswerContent('FIB', joinBlanks(['', '']))).toBe(false);
    expect(hasAnswerContent('FIB', joinBlanks(['', 'x']))).toBe(true);
    expect(hasAnswerContent('Matching', 'a:|b:')).toBe(false);
    expect(hasAnswerContent('Matching', 'a:|b:2')).toBe(true);
    expect(hasAnswerContent('MC', null)).toBe(false);
  });
});

describe('reviewRows (M23, M24, M25)', () => {
  const questions = [
    { id: 'q1', type: 'MC' as const, text: 'One' },
    { id: 'q2', type: 'FIB' as const, text: 'Two' },
    { id: 'q3', type: 'MC' as const, text: 'Three' },
    { id: 'q4', type: 'free-response' as const, text: 'Four' },
  ];

  it('marks answered, unanswered, locked and marked questions', () => {
    const rows = reviewRows(
      questions,
      [
        { questionId: 'q1', answer: '4' },
        { questionId: 'q2', answer: '' },
        { questionId: 'q4', answer: '', artifacts: [{} as never] },
      ],
      { q2: 'typed but not saved' },
      new Set(['q3']),
      (id) => id === 'q1'
    );
    expect(rows.map((r) => [r.id, r.status, r.marked, r.index])).toEqual([
      ['q1', 'locked', false, 0],
      ['q2', 'answered', false, 1],
      ['q3', 'unanswered', true, 2],
      ['q4', 'answered', false, 3],
    ]);
    expect(reviewCounts(rows)).toEqual({
      answered: 2,
      unanswered: 1,
      marked: 1,
    });
  });

  it('lets a cleared answer in progress win over the saved one', () => {
    const [row] = reviewRows(
      [questions[0]],
      [{ questionId: 'q1', answer: '4' }],
      { q1: '' },
      new Set(),
      () => false
    );
    expect(row.status).toBe('unanswered');
  });
});
