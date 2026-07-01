import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

import { WrittenResponseGrader } from '@/components/widgets/QuizWidget/components/WrittenResponseGrader';
import type { QuizData, QuizResponse } from '@/types';

afterEach(cleanup);

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

describe('WrittenResponseGrader — Escape with widget portal', () => {
  it('does not call onClose when Escape originates from inside a [data-widget-portal] element', () => {
    const onClose = vi.fn();
    render(
      <WrittenResponseGrader
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
