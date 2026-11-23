import { describe, it, expect } from 'vitest';
import {
  buildAssignmentSummary,
  KIND_CONFIG,
} from '@/hooks/useStudentAssignments';

const build = (data: Record<string, unknown>, claims: string[]) =>
  buildAssignmentSummary(
    'quiz',
    'active',
    KIND_CONFIG.quiz,
    's1',
    { quizTitle: 'Grammar', status: 'active', ...data },
    new Set(claims)
  );

describe('buildAssignmentSummary outsideClasses', () => {
  it('flags a run whose classes are none of the student classes', () => {
    const a = build({ classIds: ['english-10'] }, ['english-9']);
    expect(a.classIds).toEqual([]);
    expect(a.outsideClasses).toBe(true);
  });

  it('leaves a run in one of the student classes alone', () => {
    expect(
      build({ classIds: ['english-10', 'english-9'] }, ['english-9'])
        .outsideClasses
    ).toBeUndefined();
  });

  it('leaves Flashcards and Writing alone, which admit pointer holders', () => {
    for (const kind of ['flashcards', 'writing'] as const) {
      const a = buildAssignmentSummary(
        kind,
        'active',
        KIND_CONFIG[kind],
        's1',
        { title: 'Words', status: 'active', classIds: ['english-10'] },
        new Set(['english-9'])
      );
      expect(a.outsideClasses).toBeUndefined();
    }
  });

  it('leaves a run with no classes alone', () => {
    expect(build({}, ['english-9']).outsideClasses).toBeUndefined();
  });
});
