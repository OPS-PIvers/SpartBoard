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

import { WrittenResponseGrader } from '@/components/widgets/QuizWidget/components/WrittenResponseGrader';
import type {
  QuizData,
  QuizResponse,
  WrittenAnswerAnnotation,
  WrittenAnswerGrade,
} from '@/types';

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q1',
      type: 'essay',
      text: 'Write something.',
      timeLimit: 0,
      correctAnswer: '',
      incorrectAnswers: [],
      points: 10,
    },
  ],
};

const responseFor = (
  studentUid: string,
  answer: string,
  grading?: { [k: string]: WrittenAnswerGrade }
): QuizResponse => ({
  studentUid,
  _responseKey: studentUid,
  pin: '1234',
  answers: [
    {
      questionId: 'q1',
      answer,
      answeredAt: 0,
    },
  ],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
  grading,
});

describe('WrittenResponseGrader — annotations + snapshot', () => {
  it('saves a points-only grade without setting gradingSnapshot when no annotations exist', async () => {
    const onSaveGrade = vi
      .fn<(rk: string, qid: string, g: WrittenAnswerGrade) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <WrittenResponseGrader
        quiz={quiz}
        responses={[responseFor('uid-a', '<p>hello world</p>')]}
        teacherUid="teacher-1"
        onSaveGrade={onSaveGrade}
        onClose={vi.fn()}
      />
    );
    const pts = screen.getByLabelText(/points awarded/i);
    fireEvent.change(pts, { target: { value: '7' } });
    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /save grade/i }));
      return Promise.resolve();
    });
    expect(onSaveGrade).toHaveBeenCalledTimes(1);
    const [, , grade] = onSaveGrade.mock.calls[0];
    expect(grade.pointsAwarded).toBe(7);
    expect(grade.gradingSnapshot).toBeUndefined();
    expect(grade.annotations).toBeUndefined();
  });

  it('preserves a previously-frozen gradingSnapshot on subsequent saves', async () => {
    const existing: WrittenAnswerGrade = {
      pointsAwarded: 5,
      gradedBy: 'teacher-1',
      gradedAt: 1000,
      gradingSnapshot: '<p>FROZEN SNAPSHOT</p>',
      annotations: [
        {
          id: 'a1',
          from: 0,
          to: 6,
          highlightColor: 'yellow',
          authorUid: 'teacher-1',
          createdAt: 1000,
        },
      ],
    };
    const onSaveGrade = vi
      .fn<(rk: string, qid: string, g: WrittenAnswerGrade) => Promise<void>>()
      .mockResolvedValue(undefined);
    // Note the live answer is DIFFERENT from the snapshot — this is
    // exactly the case where Phase 2 must not re-snapshot.
    render(
      <WrittenResponseGrader
        quiz={quiz}
        responses={[
          responseFor('uid-b', '<p>student edited after unlock</p>', {
            q1: existing,
          }),
        ]}
        teacherUid="teacher-1"
        onSaveGrade={onSaveGrade}
        onClose={vi.fn()}
      />
    );
    const pts = screen.getByLabelText(/points awarded/i);
    fireEvent.change(pts, { target: { value: '9' } });
    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /save grade/i }));
      return Promise.resolve();
    });
    expect(onSaveGrade).toHaveBeenCalledTimes(1);
    const [, , grade] = onSaveGrade.mock.calls[0];
    expect(grade.pointsAwarded).toBe(9);
    // Snapshot must remain frozen at the original value, NOT re-snapshot
    // the student's edited answer.
    expect(grade.gradingSnapshot).toBe('<p>FROZEN SNAPSHOT</p>');
    // Annotations carry over unchanged (we didn't edit them in the UI).
    expect(grade.annotations).toEqual(existing.annotations);
  });

  it('hydrates draftAnnotations from the saved grade on mount', () => {
    const annotations: WrittenAnswerAnnotation[] = [
      {
        id: 'a1',
        from: 0,
        to: 5,
        highlightColor: 'pink',
        authorUid: 'teacher-1',
        createdAt: 1,
        comment: 'A note',
      },
    ];
    const existing: WrittenAnswerGrade = {
      pointsAwarded: 5,
      gradedBy: 'teacher-1',
      gradedAt: 1,
      gradingSnapshot: '<p>hello world</p>',
      annotations,
    };
    render(
      <WrittenResponseGrader
        quiz={quiz}
        responses={[
          responseFor('uid-c', '<p>hello world</p>', { q1: existing }),
        ]}
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/Highlights & comments \(1\)/)).toBeInTheDocument();
    expect(screen.getByText('A note')).toBeInTheDocument();
  });
});
