import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuizConfig, QuizResponse, QuizSession } from '@/types';

vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));

import { RosterList } from '@/components/widgets/QuizWidget/components/monitor/RosterList';
import type { MonitorStudent } from '@/components/widgets/QuizWidget/components/monitor/useMonitorData';

function makeStudent(
  response: Partial<QuizResponse>,
  key = 'uid-1'
): MonitorStudent {
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
    key,
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
  key: string,
  onReleasePaperRow?: (k: string) => void
) {
  render(
    <RosterList
      bucket="done"
      students={[makeStudent(response, key)]}
      session={
        {
          id: 'session-1',
          quizId: 'quiz-1',
          teacherUid: 'teacher-1',
          classIds: [],
        } as unknown as QuizSession
      }
      config={{} as QuizConfig}
      isGamified={false}
      onUpdateConfig={vi.fn()}
      onReleasePaperRow={onReleasePaperRow}
    />
  );
  const trigger = screen.queryByLabelText('Actions for Alex Student');
  if (trigger) fireEvent.click(trigger);
}

const KEY = 'pin-period_1-1234';

describe('RosterList release paper row', () => {
  it('offers Let student rejoin for a claimed scanned row', () => {
    const onRelease = vi.fn();
    openMenu(
      { studentUid: 'anon-1', paperWrittenBatchId: 'b1' },
      KEY,
      onRelease
    );
    fireEvent.click(screen.getByText('Let student rejoin'));
    expect(onRelease).toHaveBeenCalledWith(KEY);
  });

  it('hides it while the row is still unclaimed', () => {
    openMenu({ studentUid: KEY, paperWrittenBatchId: 'b1' }, KEY, vi.fn());
    expect(screen.queryByText('Let student rejoin')).not.toBeInTheDocument();
  });

  it('hides it on a row with no scanned answers', () => {
    openMenu({ studentUid: 'anon-1' }, KEY, vi.fn());
    expect(screen.queryByText('Let student rejoin')).not.toBeInTheDocument();
  });

  it('hides it without a handler', () => {
    openMenu({ studentUid: 'anon-1', paperWrittenBatchId: 'b1' }, KEY);
    expect(screen.queryByText('Let student rejoin')).not.toBeInTheDocument();
  });
});
