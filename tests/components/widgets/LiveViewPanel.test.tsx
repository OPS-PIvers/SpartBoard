import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizResponse, QuizSession } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { LiveViewPanel } from '@/components/widgets/QuizWidget/components/monitor/LiveViewPanel';
import type { MonitorStudent } from '@/components/widgets/QuizWidget/components/monitor/useMonitorData';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null }),
}));
vi.mock('@/hooks/useQuizHandRaiseMode', () => ({
  useQuizLiveViewAlwaysNotify: () => false,
}));
const mirrorRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/quiz/QuizStudentApp', () => ({
  ActiveQuiz: () => {
    mirrorRenders.count += 1;
    return null;
  },
}));
vi.mock('@/utils/quizLiveViewStore', () => ({
  addLiveLogEntry: vi.fn(() => new Promise(() => undefined)),
  clearLiveView: vi.fn(() => Promise.resolve()),
  deleteLiveState: vi.fn(() => Promise.resolve()),
  loadLiveLog: vi.fn(() => new Promise(() => undefined)),
  sendNudge: vi.fn(() => Promise.resolve()),
  stampLiveView: vi.fn(() => Promise.resolve()),
  watchLiveState: vi.fn(() => () => undefined),
}));

const session = {
  id: 's1',
  teacherUid: 't1',
  assignmentId: 'a1',
  sessionMode: 'student',
  status: 'active',
  publicQuestions: [],
} as unknown as QuizSession;

const student = {
  key: 'r1',
  name: 'Ada Lovelace',
  response: {
    studentUid: 'u1',
    joinedAt: 1,
    answers: [],
    status: 'in-progress',
  } as unknown as QuizResponse,
} as unknown as MonitorStudent;

const question = (id: string) => ({
  id,
  type: 'MC',
  text: id,
  timeLimit: 0,
  choices: ['a', 'b'],
});
const six = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
const orderedSession = {
  ...session,
  publicQuestions: six.map(question),
} as unknown as QuizSession;
const answeredLast = {
  key: 'r1',
  name: 'Ada Lovelace',
  response: {
    studentUid: 'u1',
    joinedAt: 1,
    completedAttempts: 0,
    answers: [
      { questionId: 'q6', answer: 'a', answeredAt: 5, status: 'submitted' },
    ],
    status: 'in-progress',
  } as unknown as QuizResponse,
} as unknown as MonitorStudent;

function renderPanel(on: ReadonlySet<string>) {
  const auth = {
    canAccessFeature: (id: string) => on.has(id),
    globalPermissions: [],
    isAdmin: false,
  } as unknown as React.ContextType<typeof AuthContext>;
  render(
    <AuthContext.Provider value={auth}>
      <LiveViewPanel
        session={session}
        students={[student]}
        studentKey="r1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    </AuthContext.Provider>
  );
}

afterEach(cleanup);

describe('LiveViewPanel switches', () => {
  it('shows Nudge, its note and Screenshot, each behind its own switch', () => {
    renderPanel(
      new Set([
        'quiz-live-view-nudge',
        'quiz-live-view-nudge-note',
        'quiz-live-view-screenshot',
      ])
    );
    expect(screen.getByRole('button', { name: 'Nudge' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Nudge note' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Screenshot' })).toBeTruthy();
    expect(
      screen.getByText("Saves this redrawn view, not the student's screen.")
    ).toBeTruthy();
  });

  it('hides each control when its switch is off', () => {
    renderPanel(new Set(['quiz-live-view-nudge-note']));
    expect(screen.queryByRole('button', { name: 'Nudge' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Nudge note' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Screenshot' })).toBeNull();
  });

  it('keeps Nudge without the note when only the note is off', () => {
    renderPanel(new Set(['quiz-live-view-nudge']));
    expect(screen.getByRole('button', { name: 'Nudge' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Nudge note' })).toBeNull();
  });
});

describe('LiveViewPanel attempt', () => {
  const panel = (sess: QuizSession) => (
    <AuthContext.Provider
      value={
        {
          canAccessFeature: () => false,
          globalPermissions: [],
          isAdmin: false,
        } as unknown as React.ContextType<typeof AuthContext>
      }
    >
      <LiveViewPanel
        session={sess}
        students={[answeredLast]}
        studentKey="r1"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    </AuthContext.Provider>
  );

  it('keeps the question number when the shuffle is switched on mid-attempt', () => {
    const { rerender } = render(panel(orderedSession));
    expect(screen.getByText('Question 6')).toBeTruthy();
    rerender(panel({ ...orderedSession, shuffleQuestions: true }));
    expect(screen.getByText('Question 6')).toBeTruthy();
  });

  it('keeps the mirror still while the stats clock ticks', () => {
    vi.useFakeTimers();
    try {
      render(panel(orderedSession));
      const before = mirrorRenders.count;
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(mirrorRenders.count).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
