// Self-paced Review game on a student device (docs/plans/QUIZ_REVIEW_SPLIT.md D22-D25).

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@/i18n';
import type { QuizPublicQuestion, QuizResponse, QuizSession } from '@/types';

const { callable } = vi.hoisted(() => ({ callable: vi.fn() }));

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  functions: {},
  isAuthBypass: false,
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => callable,
}));

import { QuizGamePlay } from '@/components/quiz/game/QuizGamePlay';

const mc = (id: string, text: string): QuizPublicQuestion => ({
  id,
  type: 'MC',
  text,
  timeLimit: 0,
  choices: [`${id}-right`, `${id}-wrong`],
});

const questions = [mc('q1', 'First question'), mc('q2', 'Second question')];

const session = (overrides: Partial<QuizSession> = {}): QuizSession =>
  ({
    id: 'sess',
    assignmentId: 'sess',
    quizId: 'quiz',
    quizTitle: 'Fractions review',
    teacherUid: 't1',
    status: 'active',
    sessionMode: 'game',
    currentQuestionIndex: -1,
    startedAt: null,
    endedAt: null,
    code: 'ABC123',
    totalQuestions: 2,
    publicQuestions: questions,
    shuffleAnswerOptions: false,
    gameDurationMs: 600_000,
    gameEndsAt: Date.now() + 600_000,
    ...overrides,
  }) as QuizSession;

const response: QuizResponse = {
  studentUid: 'stu1',
  pin: '1234',
  joinedAt: 0,
  status: 'joined',
  answers: [],
  score: null,
  submittedAt: null,
} as unknown as QuizResponse;

function renderGame(sessionOverrides: Partial<QuizSession> = {}) {
  return render(
    <QuizGamePlay
      session={session(sessionOverrides)}
      myResponse={response}
      servedQuestions={questions}
      pin="1234"
      onSetHandRaised={vi.fn().mockResolvedValue(undefined)}
      reportTabSwitch={vi.fn().mockResolvedValue(0)}
    />
  );
}

describe('QuizGamePlay', () => {
  beforeEach(() => callable.mockReset());

  it('waits for the teacher with the game length on the clock', () => {
    renderGame({ status: 'waiting', gameEndsAt: undefined });
    expect(
      screen.getByText('Waiting for your teacher to start')
    ).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('grades on the server, shows the result, then moves on', async () => {
    callable.mockResolvedValue({
      data: {
        isCorrect: false,
        points: 0,
        speedBonus: 0,
        streak: 0,
        totalPoints: 0,
        correctAnswer: 'q1-right',
        firstTry: true,
      },
    });
    renderGame();
    expect(screen.getByText('First question')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'q1-wrong' }));
    await waitFor(() => expect(screen.getByText('Not quite')).toBeVisible());
    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess',
        questionId: 'q1',
        answer: 'q1-wrong',
        startedAt: expect.any(Number),
      })
    );
    expect(screen.getByText('q1-right')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Second question')).toBeInTheDocument();
  });

  it('pauses without losing the clock', () => {
    const now = Date.now();
    renderGame({ gameEndsAt: now + 90_000, gamePausedAt: now });
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByTestId('game-clock')).toHaveTextContent('1:30');
  });

  it('freezes a question timer while the game is paused', () => {
    vi.useFakeTimers();
    try {
      const timed = [{ ...questions[0], timeLimit: 20 }, questions[1]];
      const start = Date.now();
      const props = {
        myResponse: response,
        servedQuestions: timed,
        pin: '1234',
        onSetHandRaised: vi.fn().mockResolvedValue(undefined),
        reportTabSwitch: vi.fn().mockResolvedValue(0),
      };
      const s = session({
        publicQuestions: timed,
        gameEndsAt: start + 600_000,
      });
      const { rerender } = render(<QuizGamePlay session={s} {...props} />);
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      rerender(
        <QuizGamePlay
          session={{ ...s, gamePausedAt: start + 5_000 }}
          {...props}
        />
      );
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      rerender(
        <QuizGamePlay
          session={{ ...s, gameEndsAt: start + 660_000, gamePausedAt: null }}
          {...props}
        />
      );
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(callable).not.toHaveBeenCalled();
      expect(screen.getByText('First question')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the final rank when time is up', () => {
    renderGame({
      gameEndsAt: Date.now() - 1,
      liveLeaderboard: [
        { pin: '9', score: 40, rank: 1 },
        { pin: '1234', score: 20, rank: 2 },
      ],
    });
    expect(screen.getByText("Time's up")).toBeInTheDocument();
    expect(screen.getByTestId('game-final-rank')).toHaveTextContent('2nd');
  });
});
