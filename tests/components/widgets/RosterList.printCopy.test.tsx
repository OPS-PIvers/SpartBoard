import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuizConfig, QuizResponse, QuizSession } from '@/types';

vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));

import { RosterList } from '@/components/widgets/QuizWidget/components/monitor/RosterList';
import type { MonitorStudent } from '@/components/widgets/QuizWidget/components/monitor/useMonitorData';
import type { NotJoinedStudent } from '@/components/widgets/QuizWidget/components/monitor/rosterNotJoined';

const student = (key: string, name: string): MonitorStudent => ({
  response: {
    studentUid: key,
    _responseKey: key,
    answers: [],
    status: 'in-progress',
    tabSwitchWarnings: 0,
  } as unknown as QuizResponse,
  key,
  name,
  bandScore: null,
  displayScore: null,
  awaitingGrade: false,
  band: null,
  tabWarnings: 0,
  hand: null,
  idle: null,
  duplicate: false,
  onQuestion: 1,
});

const notJoined = (key: string, name: string): NotJoinedStudent => ({
  key,
  name,
  studentUid: null,
  period: 'Period 1',
  periodKey: null,
  absent: false,
  rosterId: 'r1',
  studentId: 's9',
  onPaper: false,
});

const session = {
  id: 'session-1',
  quizId: 'quiz-1',
  teacherUid: 'teacher-1',
  classIds: [],
} as unknown as QuizSession;

describe('RosterList Print paper copy', () => {
  it('prints a joined student whose row has a roster match', () => {
    const onPrint = vi.fn();
    render(
      <RosterList
        bucket="inProgress"
        students={[student('uid-1', 'Alex Student'), student('uid-2', 'Bo')]}
        session={session}
        config={{} as QuizConfig}
        isGamified={false}
        onUpdateConfig={vi.fn()}
        onPrintCopy={onPrint}
        printCopyKeys={new Set(['uid-1'])}
      />
    );
    fireEvent.click(screen.getByLabelText('Actions for Alex Student'));
    fireEvent.click(screen.getByText('Print paper copy'));
    expect(onPrint).toHaveBeenCalledWith('uid-1');
    // No roster match and nothing else to do: no menu at all.
    expect(screen.queryByLabelText('Actions for Bo')).not.toBeInTheDocument();
  });

  it('prints a student who has not joined', () => {
    const onPrint = vi.fn();
    render(
      <RosterList
        bucket="notStarted"
        students={[]}
        notJoined={[notJoined('r1:s9', 'Casey Kid')]}
        session={session}
        config={{} as QuizConfig}
        isGamified={false}
        onUpdateConfig={vi.fn()}
        onPrintCopy={onPrint}
        printCopyKeys={new Set(['r1:s9'])}
      />
    );
    fireEvent.click(screen.getByLabelText('Actions for Casey Kid'));
    fireEvent.click(screen.getByText('Print paper copy'));
    expect(onPrint).toHaveBeenCalledWith('r1:s9');
  });

  it('is absent without the handler', () => {
    render(
      <RosterList
        bucket="inProgress"
        students={[student('uid-1', 'Alex Student')]}
        session={session}
        config={{} as QuizConfig}
        isGamified={false}
        onUpdateConfig={vi.fn()}
        onRemove={vi.fn()}
        printCopyKeys={new Set(['uid-1'])}
      />
    );
    fireEvent.click(screen.getByLabelText('Actions for Alex Student'));
    expect(screen.queryByText('Print paper copy')).not.toBeInTheDocument();
  });
});
