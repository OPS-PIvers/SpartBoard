import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuizConfig, QuizResponse, QuizSession } from '@/types';

vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));

import { RosterList } from '@/components/widgets/QuizWidget/components/monitor/RosterList';
import type { MonitorStudent } from '@/components/widgets/QuizWidget/components/monitor/useMonitorData';

function makeStudent(response: Partial<QuizResponse>): MonitorStudent {
  return {
    response: {
      studentUid: 'uid-1',
      _responseKey: 'uid-1',
      answers: [],
      status: 'completed',
      submittedAt: 200,
      completedAttempts: 1,
      tabSwitchWarnings: 0,
      ...response,
    } as unknown as QuizResponse,
    key: 'uid-1',
    name: 'Alex Student',
    bandScore: null,
    displayScore: null,
    awaitingGrade: false,
    band: null,
    tabWarnings: response.tabSwitchWarnings ?? 0,
    hand: null,
    idle: null,
    duplicate: false,
    onQuestion: 1,
  };
}

function openMenu(
  response: Partial<QuizResponse>,
  attemptLimit: number | null,
  handlers: { onReopen?: (k: string) => void; onUnlock?: (k: string) => void }
) {
  render(
    <RosterList
      bucket="done"
      students={[makeStudent(response)]}
      session={
        {
          id: 'session-1',
          quizId: 'quiz-1',
          teacherUid: 'teacher-1',
          classIds: [],
          attemptLimit,
        } as unknown as QuizSession
      }
      config={{} as QuizConfig}
      isGamified={false}
      onUpdateConfig={vi.fn()}
      onReopen={handlers.onReopen}
      onUnlockAttempt={handlers.onUnlock}
    />
  );
  const trigger = screen.queryByLabelText('Actions for Alex Student');
  if (trigger) fireEvent.click(trigger);
}

describe('RosterList reopen', () => {
  it('offers Reopen instead of Unlock attempt for a turned-in single attempt', () => {
    const onReopen = vi.fn();
    const onUnlock = vi.fn();
    openMenu({}, 1, { onReopen, onUnlock });
    expect(screen.queryByText('Unlock attempt')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Reopen'));
    expect(onReopen).toHaveBeenCalledWith('uid-1');
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('offers Reopen when more attempts are allowed', () => {
    openMenu({}, 3, { onReopen: vi.fn() });
    expect(screen.getByText('Reopen')).toBeInTheDocument();
  });

  it('keeps Unlock attempt for a tab lockout', () => {
    openMenu({ tabSwitchWarnings: 3 }, 1, {
      onReopen: vi.fn(),
      onUnlock: vi.fn(),
    });
    expect(screen.queryByText('Reopen')).not.toBeInTheDocument();
    expect(screen.getByText('Unlock attempt')).toBeInTheDocument();
  });

  it('shows no Reopen for a student still working', () => {
    openMenu({ status: 'in-progress', completedAttempts: 0 }, 1, {
      onReopen: vi.fn(),
      onUnlock: vi.fn(),
    });
    expect(screen.queryByText('Reopen')).not.toBeInTheDocument();
  });

  it('keeps the old Unlock attempt when the flag is off', () => {
    openMenu({}, 1, { onUnlock: vi.fn() });
    expect(screen.queryByText('Reopen')).not.toBeInTheDocument();
    expect(screen.getByText('Unlock attempt')).toBeInTheDocument();
  });
});
