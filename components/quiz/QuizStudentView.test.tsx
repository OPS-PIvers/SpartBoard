import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { QuizBehaviorSettings, QuizData } from '@/types';
import {
  buildAssignedStudentView,
  buildStudentViewSession,
} from '@/utils/quizStudentViewSession';
import { QuizStudentView } from './QuizStudentView';

const QUIZ = {
  id: 'quiz-1',
  title: 'Cells',
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Which organelle makes energy?',
      timeLimit: 0,
      correctAnswer: 'Mitochondria',
      incorrectAnswers: ['Nucleus', 'Ribosome'],
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} as QuizData;

const BEHAVIOR: QuizBehaviorSettings = {
  sessionMode: 'student',
  sessionOptions: { tabWarningsEnabled: false },
  attemptLimit: 1,
};

describe('QuizStudentView cross-out', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows no cross-out buttons without the teacher’s flag', async () => {
    render(
      <QuizStudentView
        quiz={QUIZ}
        behavior={BEHAVIOR}
        tabAwayTimerOn={false}
        onExit={vi.fn()}
      />
    );
    await screen.findByText('Which organelle makes energy?');
    expect(
      screen.queryByRole('button', { name: /cross out choice/i })
    ).toBeNull();
  });

  it('shows cross-out buttons with the flag and keeps them out of storage', async () => {
    render(
      <QuizStudentView
        quiz={QUIZ}
        behavior={BEHAVIOR}
        tabAwayTimerOn={false}
        crossOutOn
        onExit={vi.fn()}
      />
    );
    const buttons = await screen.findAllByRole('button', {
      name: /cross out choice/i,
    });
    expect(buttons).toHaveLength(3);
    fireEvent.click(buttons[0]);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(
      Object.keys(window.localStorage).filter((k) =>
        k.startsWith('sb_quiz_crossout:')
      )
    ).toEqual([]);
  });
});

describe('QuizStudentView on an assignment', () => {
  it('runs the assigned copy and labels a sample draw', async () => {
    const { session } = buildAssignedStudentView(
      {
        ...buildStudentViewSession(QUIZ, BEHAVIOR, false),
        id: 'live',
        quizTitle: 'Cells (assigned)',
      },
      null
    );
    render(
      <QuizStudentView
        assigned={{ session, drawIds: ['q1'] }}
        tabAwayTimerOn={false}
        onExit={vi.fn()}
      />
    );
    await screen.findByText('Which organelle makes energy?');
    expect(screen.getByText('Assigned version, sample draw')).toBeTruthy();
  });
});
