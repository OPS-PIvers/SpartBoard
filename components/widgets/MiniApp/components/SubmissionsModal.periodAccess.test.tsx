// Per-period Mini-app sessions: the submissions view carries one chip per period plus
// Start/Pause all, writing through to the session and its archive row (a distinct id).
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiniAppSession, PeriodAccess } from '@/types';
import { SubmissionsModal } from './SubmissionsModal';

const { batchUpdate, batchCommit } = vi.hoisted(() => ({
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/utils/serverTime', () => ({ getServerNow: () => 1_000 }));
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
  getDocs: vi.fn(),
  onSnapshot: vi.fn((_q: unknown, next: (s: unknown) => void) => {
    next({ docs: [] });
    return () => undefined;
  }),
  orderBy: vi.fn(),
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
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byAssignmentPseudonym: new Map() }),
  formatStudentName: () => '',
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

const session = (over: Partial<MiniAppSession> = {}): MiniAppSession => ({
  id: 's1',
  appId: 'app-1',
  appTitle: 'Fractions',
  appHtml: '',
  teacherUid: 'teacher-1',
  assignmentName: 'Fractions',
  status: 'active',
  createdAt: 0,
  assignmentId: 'asg-1',
  appInContent: true,
  accessMode: 'assessment',
  periodAccess: {
    'cl-1': period({ label: 'P1' }),
    'cl-3': period({ label: 'P3', state: 'open' }),
  },
  ...over,
});

const renderModal = (s: MiniAppSession) =>
  render(
    <SubmissionsModal
      sessionId={s.id}
      assignmentName={s.assignmentName}
      session={s}
      onClose={vi.fn()}
    />
  );

beforeEach(() => vi.clearAllMocks());

describe('SubmissionsModal — per-period access', () => {
  it('shows a chip per period with Start and Pause all', () => {
    renderModal(session());
    expect(
      screen.getByRole('button', { name: /Start P1, now Closed/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Pause P3, now Live/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start all' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pause all' })).toBeVisible();
  });

  it('starts a period on the session and on the archive row by its own id', async () => {
    renderModal(session());
    fireEvent.click(
      screen.getByRole('button', { name: /Start P1, now Closed/ })
    );
    await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
    expect(batchUpdate.mock.calls.map((c) => c[0] as string)).toEqual([
      'mini_app_sessions/s1',
      'users/teacher-1/miniapp_assignments/asg-1',
    ]);
    expect(
      (batchUpdate.mock.calls[0][1] as { segments: string[] }).segments
    ).toEqual(['periodAccess', 'cl-1', 'state']);
  });

  it('pauses every period at once', async () => {
    renderModal(session());
    fireEvent.click(screen.getByRole('button', { name: 'Pause all' }));
    await waitFor(() => expect(batchCommit).toHaveBeenCalledTimes(1));
    expect(batchUpdate).toHaveBeenCalledTimes(4);
  });

  it('shows no chips on a legacy or ended session', () => {
    const { unmount } = renderModal(
      session({ periodAccess: undefined, accessMode: undefined })
    );
    expect(screen.queryByRole('group', { name: 'Class periods' })).toBeNull();
    unmount();
    renderModal(session({ status: 'ended' }));
    expect(screen.queryByRole('group', { name: 'Class periods' })).toBeNull();
  });
});
