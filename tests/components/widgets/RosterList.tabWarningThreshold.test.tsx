import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QuizConfig, QuizResponse, QuizSession } from '@/types';

vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));

import { RosterList } from '@/components/widgets/QuizWidget/components/monitor/RosterList';
import type { MonitorStudent } from '@/components/widgets/QuizWidget/components/monitor/useMonitorData';

function makeResponse(tabSwitchWarnings: number): QuizResponse {
  return {
    studentUid: 'uid-1',
    _responseKey: 'pin-Period 1-1111',
    pin: '1111',
    classPeriod: 'Period 1',
    answers: [],
    status: 'completed',
    submittedAt: 200,
    tabSwitchWarnings,
    unlocked: false,
  } as unknown as QuizResponse;
}

function makeStudent(tabSwitchWarnings: number): MonitorStudent {
  return {
    response: makeResponse(tabSwitchWarnings),
    key: 'pin-Period 1-1111',
    name: 'Alex Student',
    bandScore: null,
    displayScore: null,
    awaitingGrade: false,
    band: null,
    tabWarnings: tabSwitchWarnings,
    needsHelp: null,
    duplicate: false,
    onQuestion: 1,
  };
}

function makeSession(tabWarningThreshold?: number | 'off'): QuizSession {
  return {
    id: 'session-1',
    quizId: 'quiz-1',
    teacherUid: 'teacher-1',
    classIds: [],
    tabWarningThreshold,
  } as unknown as QuizSession;
}

function makeConfig(): QuizConfig {
  return {} as unknown as QuizConfig;
}

function renderRoster(
  tabSwitchWarnings: number,
  tabWarningThreshold?: number | 'off'
) {
  return render(
    <RosterList
      bucket="done"
      students={[makeStudent(tabSwitchWarnings)]}
      session={makeSession(tabWarningThreshold)}
      config={makeConfig()}
      isGamified={false}
      onUpdateConfig={vi.fn()}
    />
  );
}

describe('RosterList — tab-warning threshold-aware lock icon', () => {
  it('default threshold (3): locks a student with 3 warnings', () => {
    renderRoster(3, undefined);
    expect(screen.getByLabelText('Locked')).toBeInTheDocument();
  });

  it('default threshold (3): does not lock a student with 2 warnings', () => {
    renderRoster(2, undefined);
    expect(screen.queryByLabelText('Locked')).not.toBeInTheDocument();
  });

  it('custom threshold 5: does not lock at 3 warnings (avoids false padlock)', () => {
    renderRoster(3, 5);
    expect(screen.queryByLabelText('Locked')).not.toBeInTheDocument();
  });

  it('custom threshold 5: locks once 5 warnings are reached', () => {
    renderRoster(5, 5);
    expect(screen.getByLabelText('Locked')).toBeInTheDocument();
  });

  it('custom threshold 1: locks a genuinely locked student at 1 warning', () => {
    renderRoster(1, 1);
    expect(screen.getByLabelText('Locked')).toBeInTheDocument();
  });

  it("threshold 'off': never locks regardless of warning count", () => {
    renderRoster(10, 'off');
    expect(screen.queryByLabelText('Locked')).not.toBeInTheDocument();
  });
});
