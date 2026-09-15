import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { QuizConfig, QuizResponse, QuizSession } from '@/types';

vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));

import { RosterList } from '@/components/widgets/QuizWidget/components/monitor/RosterList';
import { StatusBuckets } from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import type { MonitorStudent } from '@/components/widgets/QuizWidget/components/monitor/useMonitorData';

function makeStudent(
  name: string,
  flags: { hand?: number | null; idle?: number | null }
): MonitorStudent {
  return {
    response: {
      studentUid: `uid-${name}`,
      _responseKey: `k-${name}`,
      answers: [],
      status: 'in-progress',
      score: null,
      submittedAt: null,
      joinedAt: 0,
    } as unknown as QuizResponse,
    key: `k-${name}`,
    name,
    bandScore: null,
    displayScore: null,
    awaitingGrade: false,
    band: null,
    tabWarnings: 0,
    hand: flags.hand ?? null,
    idle: flags.idle ?? null,
    duplicate: false,
    onQuestion: 3,
  };
}

const session = {
  id: 's1',
  quizId: 'q1',
  teacherUid: 't1',
  classIds: [],
  handRaiseEnabled: true,
} as unknown as QuizSession;

function renderRoster(
  config: Partial<QuizConfig>,
  onClearHand = vi.fn(),
  sessionOverride: QuizSession = session
) {
  render(
    <RosterList
      bucket="inProgress"
      students={[
        makeStudent('Hand Kid', { hand: 2 }),
        makeStudent('Idle Kid', { idle: 4 }),
        makeStudent('Busy Kid', {}),
      ]}
      session={sessionOverride}
      config={config as QuizConfig}
      isGamified={false}
      onUpdateConfig={vi.fn()}
      onClearHand={onClearHand}
    />
  );
  return onClearHand;
}

describe('RosterList — hand vs idle flags', () => {
  it('board view (default) shows no per-student hand or idle flags', () => {
    renderRoster({});
    expect(screen.queryByTestId('hand-row')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Idle/)).not.toBeInTheDocument();
    // Everyone still renders as a plain row.
    expect(screen.getByText('Hand Kid')).toBeInTheDocument();
    expect(screen.getByText('Idle Kid')).toBeInTheDocument();
  });

  it('teacher view separates the raised hand (with Clear) from the idle badge', () => {
    const onClearHand = renderRoster({ monitorBoardView: false });
    const handRow = screen.getByTestId('hand-row');
    expect(handRow).toHaveTextContent('Hand Kid');
    expect(handRow).toHaveTextContent('Raised hand 2 min ago · Q3');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClearHand).toHaveBeenCalledWith('k-Hand Kid');

    // Idle stays a quiet badge on the normal row, never an alert block.
    expect(screen.getByLabelText('Idle 4 min')).toBeInTheDocument();
    expect(screen.getAllByTestId('hand-row')).toHaveLength(1);
  });

  it('hides the hands section when the session has raise hand disabled', () => {
    renderRoster({ monitorBoardView: false }, vi.fn(), {
      ...session,
      handRaiseEnabled: false,
    } as QuizSession);
    expect(screen.queryByTestId('hand-row')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    // The student is still listed, just without the hand treatment.
    expect(screen.getByText('Hand Kid')).toBeInTheDocument();
  });
});

describe('StatusBuckets — separate hand and idle counts', () => {
  it('renders both counts under In progress', () => {
    render(
      <StatusBuckets
        counts={{ notStarted: 1, inProgress: 5, done: 2 }}
        handCount={1}
        idleCount={3}
        openBucket={null}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('1 hand')).toBeInTheDocument();
    expect(screen.getByText('3 idle')).toBeInTheDocument();
  });

  it('omits the line entirely when nothing is flagged', () => {
    render(
      <StatusBuckets
        counts={{ notStarted: 0, inProgress: 2, done: 0 }}
        handCount={0}
        idleCount={0}
        openBucket={null}
        onToggle={vi.fn()}
      />
    );
    expect(screen.queryByText(/hand/)).not.toBeInTheDocument();
    expect(screen.queryByText(/idle/)).not.toBeInTheDocument();
  });
});
