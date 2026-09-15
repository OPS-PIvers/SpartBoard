import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteQuizControl } from './RemoteQuizControl';
import type { QuizResponse, QuizSession, WidgetData } from '@/types';

const { mockUseQuizSessionTeacher, mockClearHand } = vi.hoisted(() => ({
  mockUseQuizSessionTeacher: vi.fn(),
  mockClearHand: vi.fn(),
}));

vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionTeacher: mockUseQuizSessionTeacher,
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ rosters: [] }),
}));
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ orgId: null }) }));
vi.mock('@/hooks/useAssignmentPseudonyms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useAssignmentPseudonyms')>()),
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map([
      ['uid-hand', { givenName: 'Hand', familyName: 'Kid' }],
      ['uid-idle', { givenName: 'Idle', familyName: 'Kid' }],
      ['uid-busy', { givenName: 'Busy', familyName: 'Kid' }],
    ]),
    targetRefKeyByStudentUid: new Map<string, string>(),
  }),
}));
vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map<string, unknown>(),
}));

const NOW = Date.now();
const ts = (ms: number) => ({ toMillis: () => ms });

const widget = {
  id: 'quiz-1',
  type: 'quiz',
  config: { activeAssignmentId: 'assignment-1' },
} as unknown as WidgetData;

const session = {
  id: 'assignment-1',
  status: 'active',
  currentQuestionIndex: -1,
  totalQuestions: 5,
  classIds: [],
  periodNames: [],
  handRaiseEnabled: true,
} as unknown as QuizSession;

function response(uid: string, extra: Partial<QuizResponse>): QuizResponse {
  return {
    studentUid: uid,
    _responseKey: `key-${uid}`,
    status: 'in-progress',
    answers: [],
    ...extra,
  } as unknown as QuizResponse;
}

const handStudent = response('uid-hand', {
  handRaisedAt: ts(NOW - 180_000),
  lastWriteAt: ts(NOW),
} as Partial<QuizResponse>);
const idleStudent = response('uid-idle', {
  lastWriteAt: ts(NOW - 300_000),
} as Partial<QuizResponse>);
const busyStudent = response('uid-busy', {
  lastWriteAt: ts(NOW),
} as Partial<QuizResponse>);

function mockSession(
  sessionValue: QuizSession | null,
  responses: QuizResponse[]
) {
  mockUseQuizSessionTeacher.mockReturnValue({
    session: sessionValue,
    responses,
    clearHandForStudent: mockClearHand,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClearHand.mockResolvedValue(undefined);
});

describe('RemoteQuizControl', () => {
  it('renders raised hands and idle students', () => {
    mockSession(session, [handStudent, idleStudent, busyStudent]);
    render(<RemoteQuizControl widget={widget} updateWidget={vi.fn()} />);

    expect(screen.getAllByTestId('remote-hand-row')).toHaveLength(1);
    expect(screen.getByText('Hand Kid')).toBeInTheDocument();
    expect(screen.getByText(/Raised hand 3 min ago · Q1/)).toBeInTheDocument();

    expect(screen.getAllByTestId('remote-idle-row')).toHaveLength(1);
    expect(screen.getByText('Idle Kid')).toBeInTheDocument();
    expect(screen.getByText(/5 min/)).toBeInTheDocument();

    expect(screen.queryByText('Busy Kid')).not.toBeInTheDocument();
  });

  it('clears a raised hand via the session helper', async () => {
    mockSession(session, [handStudent]);
    render(<RemoteQuizControl widget={widget} updateWidget={vi.fn()} />);

    await userEvent.click(
      screen.getByRole('button', { name: /clear raised hand for Hand Kid/i })
    );

    await waitFor(() =>
      expect(mockClearHand).toHaveBeenCalledWith('key-uid-hand')
    );
  });

  it('shows the empty state when nobody needs attention', () => {
    mockSession(session, [busyStudent]);
    render(<RemoteQuizControl widget={widget} updateWidget={vi.fn()} />);
    expect(screen.getByText('No hands or idle students')).toBeInTheDocument();
  });

  it('shows a one-line state when there is no live quiz', () => {
    mockSession(null, []);
    render(<RemoteQuizControl widget={widget} updateWidget={vi.fn()} />);
    expect(screen.getByText('No live quiz')).toBeInTheDocument();
  });
});
