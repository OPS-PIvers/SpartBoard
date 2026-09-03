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
  WrittenAnswerGrade,
} from '@/types';

const rubric: Rubric = {
  id: 'r1',
  title: 'Essay rubric',
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
    {
      id: 'c2',
      name: 'Evidence',
      levels: [
        { id: 'c2l1', label: 'Weak', points: 1 },
        { id: 'c2l2', label: 'Strong', points: 4 },
      ],
    },
  ],
};

const quizWith = (attachRubric: boolean): QuizData => ({
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
      ...(attachRubric ? { rubricId: rubric.id, rubricSnapshot: rubric } : {}),
    },
  ],
});

const responseFor = (
  studentUid: string,
  grading?: { [k: string]: WrittenAnswerGrade }
): QuizResponse => ({
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
  grading,
});

// Enter in the points field commits the draft; a grade already written
// by rubric completion is not written twice.
const saveGrade = async () => {
  await act(() => {
    fireEvent.keyDown(screen.getByLabelText(/points awarded/i), {
      key: 'Enter',
    });
    return Promise.resolve();
  });
};

describe('FreeResponseGrader — rubric scoring', () => {
  it('does not mount the rubric panel when the question has no snapshot', () => {
    render(
      <FreeResponseGrader
        quiz={quizWith(false)}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByLabelText('Rubric scoring')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('mounts the rubric panel when the question carries a snapshot', () => {
    render(
      <FreeResponseGrader
        quiz={quizWith(true)}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Rubric scoring')).toBeInTheDocument();
    expect(screen.getByText('Essay rubric')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('auto-fills the points field once every criterion has a level', () => {
    render(
      <FreeResponseGrader
        quiz={quizWith(true)}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    const pts = screen.getByLabelText(/points awarded/i);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    // Only one of two criteria scored — no auto-fill yet.
    expect(pts).toHaveValue(null);
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    expect(pts).toHaveValue(7);
  });

  it('caps the auto-filled points at the question max', () => {
    const quiz = quizWith(true);
    quiz.questions[0].points = 5;
    render(
      <FreeResponseGrader
        quiz={quiz}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    expect(screen.getByLabelText(/points awarded/i)).toHaveValue(5);
  });

  it('includes rubricScores in the saved grade', async () => {
    const onSaveGrade = vi
      .fn<(rk: string, qid: string, g: WrittenAnswerGrade) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <FreeResponseGrader
        quiz={quizWith(true)}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={onSaveGrade}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    await saveGrade();
    expect(onSaveGrade).toHaveBeenCalledTimes(1);
    const [, , grade] = onSaveGrade.mock.calls[0];
    expect(grade.pointsAwarded).toBe(7);
    expect(grade.rubricScores).toEqual([
      { criterionId: 'c1', levelId: 'c1l2', points: 3 },
      { criterionId: 'c2', levelId: 'c2l2', points: 4 },
    ]);
  });

  it('saves a partial selection without auto-filling the points field', async () => {
    const onSaveGrade = vi
      .fn<(rk: string, qid: string, g: WrittenAnswerGrade) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <FreeResponseGrader
        quiz={quizWith(true)}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={onSaveGrade}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    const pts = screen.getByLabelText(/points awarded/i);
    expect(pts).toHaveValue(null);
    // The teacher still owes a numeric score, so they enter one by hand;
    // the partial rubric selection persists alongside it.
    fireEvent.change(pts, { target: { value: '3' } });
    await saveGrade();
    const [, , grade] = onSaveGrade.mock.calls[0];
    expect(grade.pointsAwarded).toBe(3);
    expect(grade.rubricScores).toEqual([
      { criterionId: 'c1', levelId: 'c1l2', points: 3 },
    ]);
  });

  it('keeps a manual points override when a criterion note is edited', () => {
    render(
      <FreeResponseGrader
        quiz={quizWith(true)}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    const pts = screen.getByLabelText(/points awarded/i);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    expect(pts).toHaveValue(7);
    fireEvent.change(pts, { target: { value: '5' } });
    fireEvent.click(
      screen.getByRole('button', { name: /Add note for Thesis/ })
    );
    fireEvent.change(screen.getByLabelText('Note for Thesis'), {
      target: { value: 'Clear claim' },
    });
    expect(pts).toHaveValue(5);
  });

  it('re-fills the points field on a level change the teacher has not overridden', () => {
    render(
      <FreeResponseGrader
        quiz={quizWith(true)}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    const pts = screen.getByLabelText(/points awarded/i);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    expect(pts).toHaveValue(7);
    fireEvent.click(screen.getByRole('radio', { name: /Below/ }));
    expect(pts).toHaveValue(5);
  });

  it('keeps a manual points override when a level changes', () => {
    render(
      <FreeResponseGrader
        quiz={quizWith(true)}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    const pts = screen.getByLabelText(/points awarded/i);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    fireEvent.change(pts, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('radio', { name: /Below/ }));
    expect(pts).toHaveValue(2);
  });

  it('saves a partial selection with its running total when points are empty', async () => {
    const onSaveGrade = vi
      .fn<(rk: string, qid: string, g: WrittenAnswerGrade) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <FreeResponseGrader
        quiz={quizWith(true)}
        responses={[responseFor('uid-a')]}
        teacherUid="teacher-1"
        onSaveGrade={onSaveGrade}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    const pts = screen.getByLabelText(/points awarded/i);
    expect(pts).toHaveValue(null);
    expect(screen.getByText(/1 of 2 criteria scored/)).toBeInTheDocument();
    await saveGrade();
    const [, , grade] = onSaveGrade.mock.calls[0];
    expect(grade.pointsAwarded).toBe(3);
    expect(grade.rubricScores).toEqual([
      { criterionId: 'c1', levelId: 'c1l2', points: 3 },
    ]);
  });

  it('hydrates saved rubric scores into the panel', () => {
    render(
      <FreeResponseGrader
        quiz={quizWith(true)}
        responses={[
          responseFor('uid-a', {
            q1: {
              pointsAwarded: 4,
              gradedBy: 'teacher-1',
              gradedAt: 1,
              rubricScores: [{ criterionId: 'c1', levelId: 'c1l1', points: 1 }],
            },
          }),
        ]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('radio', { name: /Below/ })).toBeChecked();
    expect(screen.getByText(/1 of 2 criteria scored/)).toBeInTheDocument();
  });
});
