import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import {
  render,
  cleanup,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
const { showConfirm } = vi.hoisted(() => ({
  showConfirm: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));

import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import type { QuizData, QuizResponse, WrittenAnswerGrade } from '@/types';

afterEach(cleanup);

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
    },
  ],
};

const response: QuizResponse = {
  studentUid: 'student-1',
  _responseKey: 'student-1',
  pin: '1234',
  answers: [{ questionId: 'q1', answer: 'Hello', answeredAt: 0 }],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
};

describe('FreeResponseGrader — Escape with widget portal', () => {
  it('does not call onClose when Escape originates from inside a [data-widget-portal] element', () => {
    const onClose = vi.fn();
    render(
      <FreeResponseGrader
        quiz={quiz}
        responses={[response]}
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        teacherUid="teacher-1"
        onClose={onClose}
      />
    );

    // Simulate a nested portal dialog (e.g. ConfirmDialog) opening inside
    // the grader — Escape from its elements must not propagate to onClose.
    const portalRoot = document.createElement('div');
    portalRoot.setAttribute('data-widget-portal', '');
    const inner = document.createElement('button');
    portalRoot.appendChild(inner);
    document.body.appendChild(portalRoot);

    try {
      inner.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      );
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(portalRoot);
    }
  });
});

describe('FreeResponseGrader — Escape with unsaved edits', () => {
  it('banks the edit and closes, with no discard prompt', async () => {
    showConfirm.mockClear();
    const onClose = vi.fn();
    const onSaveGrade = vi
      .fn<(rk: string, k: string, g: WrittenAnswerGrade) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <FreeResponseGrader
        quiz={quiz}
        responses={[response]}
        onSaveGrade={onSaveGrade}
        teacherUid="teacher-1"
        onClose={onClose}
      />
    );

    fireEvent.change(screen.getByLabelText(/Points awarded/i), {
      target: { value: '5' },
    });
    fireEvent.keyDown(document.body, { key: 'Escape' });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(showConfirm).not.toHaveBeenCalled();
    expect(onSaveGrade).toHaveBeenCalledTimes(1);
    expect(onSaveGrade.mock.calls[0][2].pointsAwarded).toBe(5);
  });
});
