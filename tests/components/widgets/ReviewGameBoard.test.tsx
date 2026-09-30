// Review self-paced game board (docs/plans/QUIZ_REVIEW_SPLIT.md D26).
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QuizLeaderboardEntry, QuizSession } from '@/types';
import { GameBoard } from '@/components/widgets/QuizWidget/components/game/GameBoard';
import { PresentScreen } from '@/components/widgets/QuizWidget/components/present/PresentScreen';

const entries: QuizLeaderboardEntry[] = [
  { studentUid: 'a', name: 'Maya Lopez', score: 900, rank: 1 },
  { studentUid: 'b', name: 'Jordan Lee', score: 700, rank: 2 },
  { studentUid: 'c', name: 'Liam Park', score: 400, rank: 3 },
];

const baseProps = {
  clock: { phase: 'running' as const, remainingMs: 125_000 },
  stats: { joined: 24, active: 18, firstTryPct: 72 },
  entries,
  rows: 5,
  showNames: false,
  nowMs: 0,
};

describe('GameBoard', () => {
  it('shows the countdown, counts and first-try accuracy', () => {
    render(<GameBoard {...baseProps} />);
    expect(screen.getByTestId('game-board-clock')).toHaveTextContent('2:05');
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '72');
  });

  it('hides names until the teacher turns them on, first names only', () => {
    const { rerender } = render(<GameBoard {...baseProps} />);
    expect(screen.queryByText('Maya')).toBeNull();
    rerender(<GameBoard {...baseProps} showNames />);
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.queryByText('Maya Lopez')).toBeNull();
  });

  it('limits rows to the launch Top-N', () => {
    render(<GameBoard {...baseProps} rows={2} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('marks a rank move with an arrow', () => {
    const { rerender } = render(<GameBoard {...baseProps} showNames />);
    rerender(
      <GameBoard
        {...baseProps}
        showNames
        nowMs={1_000}
        entries={[entries[2], entries[0], entries[1]].map((e, i) => ({
          ...e,
          rank: i + 1,
        }))}
      />
    );
    expect(screen.getByLabelText('Up 2')).toHaveTextContent('▲2');
    expect(screen.getAllByLabelText('Down 1')).toHaveLength(2);
  });

  it('labels a paused clock', () => {
    render(
      <GameBoard
        {...baseProps}
        clock={{ phase: 'paused', remainingMs: 60_000 }}
      />
    );
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });
});

describe('PresentScreen with a game', () => {
  const session = {
    id: 's',
    quizTitle: 'Cells Review',
    status: 'active',
    sessionMode: 'game',
    currentQuestionIndex: -1,
    totalQuestions: 10,
  } as unknown as QuizSession;
  const data = {
    session,
    currentQ: undefined,
    responses: [],
    answered: 0,
    counts: { notStarted: 0, inProgress: 0, done: 0 },
    total: 3,
    standings: entries,
    isGamified: true,
    classAverage: 72,
  };

  it('shows the game board while the game runs', () => {
    render(
      <PresentScreen
        {...data}
        showNames={false}
        game={{ ...baseProps, stats: { ...baseProps.stats } }}
      />
    );
    expect(screen.getByTestId('game-board')).toBeInTheDocument();
    expect(screen.getByText('Cells Review')).toBeInTheDocument();
  });

  it('goes to final standings when the game ends', () => {
    render(
      <PresentScreen
        {...data}
        session={{ ...session, status: 'ended' } as QuizSession}
        showNames={false}
        game={baseProps}
      />
    );
    expect(screen.queryByTestId('game-board')).toBeNull();
  });
});
