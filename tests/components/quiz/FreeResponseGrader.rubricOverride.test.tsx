import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// EditorModalShell calls these hooks unconditionally. Stub them so the
// grader can render outside a full provider tree.
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showConfirm: vi.fn().mockResolvedValue(true),
  }),
}));

import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import type {
  QuizData,
  QuizResponse,
  Rubric,
  StudentOverride,
  WrittenAnswerGrade,
} from '@/types';

const baseRubric: Rubric = {
  id: 'base-rubric',
  title: 'Base rubric',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'c1',
      name: 'Thesis',
      levels: [
        { id: 'c1l1', label: 'Below', points: 1 },
        { id: 'c1l2', label: 'Meets', points: 3 },
      ],
    },
  ],
};

const overrideRubric: Rubric = {
  id: 'override-rubric',
  title: 'Simplified rubric',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'oc1',
      name: 'Effort',
      levels: [
        { id: 'oc1l1', label: 'Tried', points: 5 },
        { id: 'oc1l2', label: 'Excelled', points: 10 },
      ],
    },
  ],
};

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q1',
      type: 'free-response',
      text: 'Write something.',
      timeLimit: 0,
      correctAnswer: '',
      incorrectAnswers: [],
      points: 10,
      rubricId: baseRubric.id,
      rubricSnapshot: baseRubric,
    },
  ],
};

const responseFor = (studentUid: string): QuizResponse => ({
  studentUid,
  _responseKey: studentUid,
  pin: '1234',
  answers: [{ questionId: 'q1', answer: '<p>hello world</p>', answeredAt: 0 }],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
});

const saveGrade = async () => {
  await act(() => {
    fireEvent.click(
      screen.getByRole('button', { name: /save grade|save & next/i })
    );
    return Promise.resolve();
  });
};

describe('FreeResponseGrader — per-student rubric override (M17 C4)', () => {
  it('grades exactly as today when the assignment has no overrides (zero regression)', () => {
    render(
      <FreeResponseGrader
        quiz={quiz}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Base rubric')).toBeInTheDocument();
    expect(screen.queryByText(/Alternate rubric/)).toBeNull();
    expect(screen.queryByText(/Points only for this student/)).toBeNull();
  });

  it('applies the override rubric only to the matched student', () => {
    const overridesBySourcedId: Record<string, StudentOverride> = {
      'classlink:sid-a': { rubricOverrideByQuestion: { q1: overrideRubric } },
    };
    const targetRefKeyByStudentUid = new Map([['uid-a', 'classlink:sid-a']]);
    render(
      <FreeResponseGrader
        quiz={quiz}
        responses={[responseFor('uid-a'), responseFor('uid-b')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        overridesBySourcedId={overridesBySourcedId}
        targetRefKeyByStudentUid={targetRefKeyByStudentUid}
        onClose={vi.fn()}
      />
    );
    // uid-a (student idx 0) gets the override rubric.
    expect(screen.getByText('Simplified rubric')).toBeInTheDocument();
    expect(
      screen.getByText('Alternate rubric for this student')
    ).toBeInTheDocument();

    // Next student (uid-b) is unmatched — falls back to the base rubric.
    fireEvent.click(screen.getByRole('button', { name: /next student/i }));
    expect(screen.getByText('Base rubric')).toBeInTheDocument();
    expect(screen.queryByText(/Alternate rubric/)).toBeNull();
  });

  it("'points' mode grades by raw points, ignoring the base rubric entirely", () => {
    const overridesBySourcedId: Record<string, StudentOverride> = {
      'classlink:sid-a': { rubricOverrideByQuestion: { q1: 'points' } },
    };
    const targetRefKeyByStudentUid = new Map([['uid-a', 'classlink:sid-a']]);
    render(
      <FreeResponseGrader
        quiz={quiz}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        overridesBySourcedId={overridesBySourcedId}
        targetRefKeyByStudentUid={targetRefKeyByStudentUid}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByLabelText('Rubric scoring')).toBeNull();
    expect(
      screen.getByText(/Points only for this student/)
    ).toBeInTheDocument();
  });

  it('saves the raw points score in points-override mode', async () => {
    const overridesBySourcedId: Record<string, StudentOverride> = {
      'classlink:sid-a': { rubricOverrideByQuestion: { q1: 'points' } },
    };
    const targetRefKeyByStudentUid = new Map([['uid-a', 'classlink:sid-a']]);
    const onSaveGrade = vi
      .fn<(rk: string, qid: string, g: WrittenAnswerGrade) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <FreeResponseGrader
        quiz={quiz}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={onSaveGrade}
        overridesBySourcedId={overridesBySourcedId}
        targetRefKeyByStudentUid={targetRefKeyByStudentUid}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText(/points awarded/i), {
      target: { value: '6' },
    });
    await saveGrade();
    const [, , grade] = onSaveGrade.mock.calls[0];
    expect(grade.pointsAwarded).toBe(6);
    expect(grade.rubricScores).toBeUndefined();
  });

  it('falls back to the base rubric when the studentUid has no pseudonym match', () => {
    const overridesBySourcedId: Record<string, StudentOverride> = {
      'classlink:sid-a': { rubricOverrideByQuestion: { q1: overrideRubric } },
    };
    // Empty map: no pseudonym resolution has happened yet (or the uid never resolved).
    const targetRefKeyByStudentUid = new Map<string, string>();
    render(
      <FreeResponseGrader
        quiz={quiz}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        overridesBySourcedId={overridesBySourcedId}
        targetRefKeyByStudentUid={targetRefKeyByStudentUid}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Base rubric')).toBeInTheDocument();
    expect(screen.queryByText(/Alternate rubric/)).toBeNull();
  });

  it('falls back to the base rubric when the matched student has no override for this question', () => {
    const overridesBySourcedId: Record<string, StudentOverride> = {
      // Override exists for the student, but not for question q1.
      'classlink:sid-a': { rubricOverrideByQuestion: {} },
    };
    const targetRefKeyByStudentUid = new Map([['uid-a', 'classlink:sid-a']]);
    render(
      <FreeResponseGrader
        quiz={quiz}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        overridesBySourcedId={overridesBySourcedId}
        targetRefKeyByStudentUid={targetRefKeyByStudentUid}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Base rubric')).toBeInTheDocument();
    expect(screen.queryByText(/Alternate rubric/)).toBeNull();
  });
});
