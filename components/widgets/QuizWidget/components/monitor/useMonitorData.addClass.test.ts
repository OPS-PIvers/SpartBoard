import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ClassRoster, QuizConfig, QuizData, QuizSession } from '@/types';
import { useMonitorData } from './useMonitorData';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ orgId: 'test-org' }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    byAssignmentPseudonym: new Map(),
    targetRefKeyByStudentUid: new Map(),
    loading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map(),
}));

const student = (id: string) => ({
  id,
  firstName: `First${id}`,
  lastName: `Last${id}`,
  pin: id,
});

const rosters = [
  {
    id: 'r1',
    name: 'Period 1',
    students: [student('a1'), student('a2'), student('a3')],
  },
  { id: 'r2', name: 'Period 2', students: [student('b1'), student('b2')] },
] as unknown as ClassRoster[];

const targets = { targetMode: 'class' } as const;

const quiz = {
  id: 'quiz-1',
  title: 'Quiz',
  questions: [],
  createdAt: 1,
  updatedAt: 1,
} as unknown as QuizData;

const session = (periodNames: string[], rosterIds: string[]) =>
  ({
    id: 'sess-1',
    status: 'active',
    sessionMode: 'student',
    currentQuestionIndex: 0,
    totalQuestions: 0,
    publicQuestions: [],
    periodNames,
    rosterIds,
    teacherUid: 't1',
  }) as unknown as QuizSession;

describe('useMonitorData when Quiz settings adds a class', () => {
  it('lists the new class instead of staying on the first one', () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: QuizSession }) =>
        useMonitorData(
          s,
          [],
          quiz,
          {} as QuizConfig,
          rosters,
          null,
          false,
          targets,
          true
        ),
      { initialProps: { s: session(['Period 1'], ['r1']) } }
    );
    expect(result.current.notJoined).toHaveLength(3);

    rerender({ s: session(['Period 1', 'Period 2'], ['r1', 'r2']) });

    expect(result.current.periodNames).toEqual(['Period 1', 'Period 2']);
    expect(result.current.selectedPeriods).toEqual([]);
    expect(result.current.notJoined).toHaveLength(5);
  });

  it('keeps a one-class session on its class so Start and Pause stay', () => {
    const { result } = renderHook(() =>
      useMonitorData(
        session(['Period 1'], ['r1']),
        [],
        quiz,
        {} as QuizConfig,
        rosters,
        null,
        false,
        targets,
        true
      )
    );
    expect(result.current.selectedPeriods).toEqual(['Period 1']);
  });

  it('still opens a per-period session on its first class', () => {
    const { result } = renderHook(() =>
      useMonitorData(
        session(['Period 1', 'Period 2'], ['r1', 'r2']),
        [],
        quiz,
        {} as QuizConfig,
        rosters,
        null,
        false,
        targets,
        true
      )
    );
    expect(result.current.selectedPeriods).toEqual(['Period 1']);
    expect(result.current.notJoined).toHaveLength(3);
  });
});
