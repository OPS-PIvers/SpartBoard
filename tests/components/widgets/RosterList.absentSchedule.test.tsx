import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuizConfig, QuizSession } from '@/types';

vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));

import { RosterList } from '@/components/widgets/QuizWidget/components/monitor/RosterList';
import type { NotJoinedStudent } from '@/components/widgets/QuizWidget/components/monitor/rosterNotJoined';

const row = (absent: boolean): NotJoinedStudent => ({
  key: 'uid-9',
  name: 'Casey Kid',
  studentUid: 'uid-9',
  period: 'Period 1',
  periodKey: 'cl-1',
  absent,
  rosterId: 'r1',
  studentId: 's9',
  onPaper: false,
});

const session = {
  id: 'session-1',
  status: 'active',
  classIds: ['cl-1'],
  periodAccess: { 'cl-1': { state: 'paused' } },
} as unknown as QuizSession;

const renderRow = (absent: boolean, onSetTime = vi.fn()) =>
  render(
    <RosterList
      bucket="notStarted"
      students={[]}
      notJoined={[row(absent)]}
      onSetAbsent={vi.fn()}
      session={session}
      config={{} as QuizConfig}
      isGamified={false}
      onUpdateConfig={vi.fn()}
      onLetIn={vi.fn()}
      onSetTime={onSetTime}
    />
  );

describe('RosterList absent students', () => {
  it('puts a one-tap Schedule button on an absent row', () => {
    const onSetTime = vi.fn();
    renderRow(true, onSetTime);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(onSetTime).toHaveBeenCalledWith('uid-9', 'Casey Kid');
  });

  it('keeps the row button off a student who is not absent', () => {
    renderRow(false);
    expect(
      screen.queryByRole('button', { name: 'Schedule' })
    ).not.toBeInTheDocument();
  });

  it.each([false, true])('absent=%s keeps Schedule for later', (absent) => {
    render(
      <RosterList
        bucket="notStarted"
        students={[]}
        notJoined={[row(absent)]}
        onSetAbsent={vi.fn()}
        session={session}
        config={{} as QuizConfig}
        isGamified={false}
        onUpdateConfig={vi.fn()}
        onLetIn={vi.fn()}
        onSetTime={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('Actions for Casey Kid'));
    expect(screen.getByText('Schedule for later')).toBeInTheDocument();
  });
});
