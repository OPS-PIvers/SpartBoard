import { describe, it, expect } from 'vitest';
import {
  buildTraversal,
  collectStudents,
  findPosition,
  nextUngraded,
  type TraversalQuestion,
} from '@/utils/gradeTraversal';

const row = (studentKey: string, graded: boolean[]) => ({
  studentKey,
  slots: graded.map((isGraded, i) => ({
    slot: i === 0 ? ('primary' as const) : ('addendum' as const),
    isGraded,
  })),
});

const questions: TraversalQuestion[] = [
  { questionId: 'q1', rows: [row('ada', [false]), row('grace', [true])] },
  {
    questionId: 'q2',
    rows: [row('grace', [false, true]), row('lin', [false])],
  },
];

const shape = (t: { questionId: string; studentKey: string; slot: string }) =>
  `${t.questionId}/${t.studentKey}/${t.slot}`;

describe('buildTraversal', () => {
  it('walks question-major by default', () => {
    expect(buildTraversal('question', questions).map(shape)).toEqual([
      'q1/ada/primary',
      'q1/grace/primary',
      'q2/grace/primary',
      'q2/grace/addendum',
      'q2/lin/primary',
    ]);
  });

  it('walks student-major in first-seen order', () => {
    expect(collectStudents(questions)).toEqual(['ada', 'grace', 'lin']);
    expect(buildTraversal('student', questions).map(shape)).toEqual([
      'q1/ada/primary',
      'q1/grace/primary',
      'q2/grace/primary',
      'q2/grace/addendum',
      'q2/lin/primary',
    ]);
    const swapped: TraversalQuestion[] = [
      { questionId: 'q1', rows: [row('grace', [false]), row('ada', [false])] },
      { questionId: 'q2', rows: [row('ada', [false]), row('grace', [false])] },
    ];
    expect(buildTraversal('student', swapped).map(shape)).toEqual([
      'q1/grace/primary',
      'q2/grace/primary',
      'q1/ada/primary',
      'q2/ada/primary',
    ]);
  });
});

describe('findPosition', () => {
  const list = buildTraversal('question', questions);
  it('matches question, student and slot', () => {
    expect(findPosition(list, 1, 'grace', 'addendum')).toBe(3);
  });
  it('falls back to the student when the slot is absent', () => {
    expect(findPosition(list, 1, 'lin', 'addendum')).toBe(4);
    expect(findPosition(list, 0, 'nobody', 'primary')).toBe(-1);
  });
});

describe('nextUngraded', () => {
  const list = buildTraversal('question', questions);
  it('skips graded targets going forward', () => {
    expect(nextUngraded(list, 0, 1)).toBe(2);
    expect(nextUngraded(list, 2, 1)).toBe(4);
  });
  it('wraps around the end', () => {
    expect(nextUngraded(list, 4, 1)).toBe(0);
    expect(nextUngraded(list, 0, -1)).toBe(4);
  });
  it('returns null when nothing else is owed a grade', () => {
    const done = list.map((t, i) => ({ ...t, isGraded: i !== 2 }));
    expect(nextUngraded(done, 2, 1)).toBeNull();
    expect(nextUngraded([], 0, 1)).toBeNull();
  });
});
