import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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
vi.mock('@/components/quiz/QuizStudentApp', () => ({
  ActiveQuiz: () => null,
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
