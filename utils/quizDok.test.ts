import { describe, expect, it } from 'vitest';
import type { QuizQuestion, QuizResponse } from '@/types';
import {
  computeDokStats,
  dokTargetTag,
  questionsTaggedByDok,
  quizHasDok,
} from '@/utils/quizDok';
import { computeTargetStats } from '@/utils/quizTargetStats';

const CUTOFFS = { proficient: 80, approaching: 60 };

const question = (
  id: string,
  dok?: 1 | 2 | 3 | 4,
  withTarget = false
): QuizQuestion => ({
  id,
  type: 'MC',
  text: `Question ${id}`,
  correctAnswer: 'Correct',
  incorrectAnswers: ['Wrong'],
  timeLimit: 30,
  points: 1,
  ...(dok ? { dok } : {}),
  ...(withTarget
    ? { targets: [{ id: 'lt-a', kind: 'personal' as const, label: 'LT A' }] }
    : {}),
});

const response = (
  uid: string,
  answers: Array<{ questionId: string; answer: string }>
): QuizResponse => ({
  _responseKey: `response-${uid}`,
  studentUid: uid,
  joinedAt: 1,
  status: 'completed',
  answers: answers.map((a) => ({ ...a, answeredAt: 2 })),
  score: null,
  submittedAt: 3,
});

describe('quizHasDok', () => {
  it('is false until a question carries a level', () => {
    expect(quizHasDok([question('q1'), question('q2')])).toBe(false);
    expect(quizHasDok([question('q1'), question('q2', 3)])).toBe(true);
  });
});

describe('questionsTaggedByDok', () => {
  it('replaces target tags with the DOK tag and leaves unlevelled questions untagged', () => {
    const tagged = questionsTaggedByDok([
      question('q1', 2, true),
      question('q2', undefined, true),
    ]);
    expect(tagged[0].targets).toEqual([dokTargetTag(2)]);
    expect(tagged[1].targets).toBeUndefined();
  });
});

describe('computeDokStats', () => {
  const questions = [
    question('q1', 1),
    question('q2', 3),
    question('q3', 3),
    question('q4'),
  ];
  const responses = [
    response('a', [
      { questionId: 'q1', answer: 'Correct' },
      { questionId: 'q2', answer: 'Correct' },
      { questionId: 'q3', answer: 'Wrong' },
      { questionId: 'q4', answer: 'Wrong' },
    ]),
    response('b', [
      { questionId: 'q1', answer: 'Wrong' },
      { questionId: 'q2', answer: 'Correct' },
      { questionId: 'q3', answer: 'Correct' },
      { questionId: 'q4', answer: 'Correct' },
    ]),
  ];

  it('groups mastery by level, lowest first, ignoring questions without a level', () => {
    const stats = computeDokStats(questions, responses, CUTOFFS);
    expect(stats.targets.map((row) => row.target.label)).toEqual([
      'DOK 1',
      'DOK 3',
    ]);
    expect(stats.targets[0].correctPercent).toBe(50);
    expect(stats.targets[0].questionIds).toEqual(['q1']);
    expect(stats.targets[1].correctPercent).toBe(75);
    expect(stats.targets[1].questionIds).toEqual(['q2', 'q3']);
    expect(stats.standards).toEqual([]);
  });

  it('gives each student their own percent per level', () => {
    const stats = computeDokStats(questions, responses, CUTOFFS);
    const a = stats.byStudent.get('response-a');
    expect(a?.get('dok:1')?.correctPercent).toBe(100);
    expect(a?.get('dok:3')?.correctPercent).toBe(50);
    const b = stats.byStudent.get('response-b');
    expect(b?.get('dok:1')?.correctPercent).toBe(0);
    expect(b?.get('dok:3')?.correctPercent).toBe(100);
  });

  it('leaves the target breakdown untouched', () => {
    const tagged = [question('q1', 2, true), question('q2', 2, true)];
    const stats = computeTargetStats(tagged, responses, CUTOFFS);
    expect(stats.targets.map((row) => row.target.id)).toEqual(['lt-a']);
  });
});
