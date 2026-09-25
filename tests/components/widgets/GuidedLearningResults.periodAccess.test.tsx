// Per-period GL sessions: the results view carries one chip per period plus Start/Pause all,
// kept live from the session doc, and writes through to the session and its hub mirror.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import type { GuidedLearningSet, PeriodAccess } from '@/types';
import { GuidedLearningResults } from '@/components/widgets/GuidedLearning/components/GuidedLearningResults';

const NOW = new Date(2026, 8, 29, 10, 50).getTime();

const { sessionData, batchUpdate, batchCommit } = vi.hoisted(() => ({
  sessionData: { current: {} as Record<string, unknown> },
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/utils/serverTime', () => ({ getServerNow: () => NOW }));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  FieldPath: class {
    segments: string[];
    constructor(...segments: string[]) {
      this.segments = segments;
    }
  },
  getDoc: vi.fn(() =>
    Promise.resolve({ exists: () => true, data: () => sessionData.current })
  ),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { fromMillis: vi.fn() },
  updateDoc: vi.fn(() => Promise.resolve()),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ update: batchUpdate, commit: batchCommit })),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn(), rosters: [] }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    orgId: 'org',
    featurePermissions: [],
  }),
}));
vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionTeacher: () => ({
    responses: [],
    responsesLoading: false,
    subscribeToResponses: () => () => undefined,
    exportResponsesAsCSV: vi.fn(),
  }),
  isAnswerCorrect: () => false,
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: null }),
}));

const period = (over: Partial<PeriodAccess>): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P',
  ...over,
});

const PERIODS = {
  'cl-1': period({ label: 'P1' }),
  'cl-3': period({ label: 'P3', state: 'open' }),
};

const SET = {
  id: 'set-1',
  title: 'Cells',
  imageUrls: [],
  steps: [],
  mode: 'guided',
  createdAt: 0,
  updatedAt: 0,
} as GuidedLearningSet;

const renderResults = () =>
  render(<GuidedLearningResults set={SET} sessionId="s1" onClose={vi.fn()} />);

beforeEach(() => {
  vi.clearAllMocks();
  sessionData.current = {
    teacherUid: 'teacher-1',
    classIds: ['cl-1', 'cl-3'],
    accessMode: 'assessment',
    periodAccess: PERIODS,
  };
});

describe('GuidedLearningResults — per-period access', () => {
  it('shows a chip per period with Start and Pause all', async () => {
    renderResults();
    expect(
      await screen.findByRole('button', { name: /Start P1, now Closed/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Pause P3, now Live/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start all' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pause all' })).toBeVisible();
  });

  it('starts one period on the session and its hub mirror', async () => {
    renderResults();
    fireEvent.click(
      await screen.findByRole('button', { name: /Start P1, now Closed/ })
    );
    await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
    const refs = batchUpdate.mock.calls.map((c) => c[0] as string);
    expect(refs).toEqual([
      'guided_learning_sessions/s1',
      'users/teacher-1/guided_learning_assignments/s1',
    ]);
    expect(
      (batchUpdate.mock.calls[0][1] as { segments: string[] }).segments
    ).toEqual(['periodAccess', 'cl-1', 'state']);
    expect(batchUpdate.mock.calls[0][2]).toBe('open');
  });

  it('follows the session live', async () => {
    renderResults();
    await screen.findByRole('group', { name: 'Class periods' });
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    const listener = (onSnapshot as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, (s: { data: () => unknown }) => void];
    expect(listener[0]).toBe('guided_learning_sessions/s1');
    act(() =>
      listener[1]({
        data: () => ({
          ...sessionData.current,
          periodAccess: {
            ...PERIODS,
            'cl-1': period({ label: 'P1', state: 'open' }),
          },
        }),
      })
    );
    expect(
      screen.getByRole('button', { name: /Pause P1, now Live/ })
    ).toBeInTheDocument();
  });

  it('shows no chips and opens no listener on a legacy session', async () => {
    sessionData.current = { teacherUid: 'teacher-1', classIds: ['cl-1'] };
    renderResults();
    await screen.findByText(/No responses yet/);
    expect(screen.queryByRole('group', { name: 'Class periods' })).toBeNull();
    expect(onSnapshot).not.toHaveBeenCalled();
  });
});
