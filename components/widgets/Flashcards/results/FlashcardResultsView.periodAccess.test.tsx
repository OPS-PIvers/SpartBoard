// Per-period Flashcards: the results view carries one chip per period, Start/Pause all,
// and Let in now for a student whose period is shut.
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FlashcardAssignment,
  FlashcardSession,
  PeriodAccess,
} from '@/types';
import type { FlashcardResultRecord } from '@/utils/flashcardResults';

const h = vi.hoisted(() => ({
  session: null as FlashcardSession | null,
  results: [] as FlashcardResultRecord[],
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn((..._args: unknown[]) => Promise.resolve()),
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
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { fromMillis: vi.fn() },
  updateDoc: h.updateDoc,
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ update: h.batchUpdate, commit: h.batchCommit })),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    orgId: null,
    featurePermissions: [],
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ rosters: [], addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/hooks/useFlashcardResults', () => ({
  useFlashcardResults: () => ({
    session: h.session,
    results: h.results,
    loading: false,
    error: null,
    resetStudent: vi.fn(),
    resolveFlag: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useMinuteClock', () => ({ useMinuteClock: () => 0 }));

import { FlashcardResultsView } from './FlashcardResultsView';

const period = (over: Partial<PeriodAccess>): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P',
  ...over,
});

const session = (over: Partial<FlashcardSession> = {}): FlashcardSession =>
  ({
    id: 'fc-1',
    title: 'Spanish',
    kind: 'check',
    checkMode: 'write',
    status: 'active',
    teacherUid: 'teacher-1',
    termLanguage: 'es-ES',
    definitionLanguage: 'en-US',
    classIds: ['cl-1', 'cl-3'],
    cards: [{ id: 'c1', term: 'uno', definition: 'one' }],
    cardsInContent: true,
    accessMode: 'assessment',
    periodAccess: {
      'cl-1': period({ label: 'P1' }),
      'cl-3': period({ label: 'P3', state: 'open' }),
    },
    ...over,
  }) as FlashcardSession;

const assignment = {
  id: 'fc-1',
  sessionId: 'fc-1',
  setId: 'set-1',
  setTitle: 'Spanish',
  teacherUid: 'teacher-1',
  kind: 'check',
  status: 'active',
  createdAt: 0,
  updatedAt: 0,
} as FlashcardAssignment;

const show = () =>
  render(
    <FlashcardResultsView
      assignment={assignment}
      onBack={vi.fn()}
      onPublishScores={vi.fn()}
      onUnpublishScores={vi.fn()}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.session = session();
  h.results = [];
});

describe('FlashcardResultsView — per-period access', () => {
  it('shows a chip per period with Start and Pause all', () => {
    show();
    expect(
      screen.getByRole('button', { name: /Start P1, now Closed/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Pause P3, now Live/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start all' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pause all' })).toBeVisible();
  });

  it('starts a period on the session and its assignment row', async () => {
    show();
    fireEvent.click(
      screen.getByRole('button', { name: /Start P1, now Closed/ })
    );
    await waitFor(() => expect(h.batchCommit).toHaveBeenCalledTimes(1));
    expect(h.batchUpdate.mock.calls.map((c) => c[0] as string)).toEqual([
      'flashcard_sessions/fc-1',
      'users/teacher-1/flashcard_assignments/fc-1',
    ]);
  });

  it('offers Let in now only for an unsubmitted student in a shut period', async () => {
    h.results = [
      { studentUid: 'waiting-1', classId: 'cl-1' },
      { studentUid: 'working-3', classId: 'cl-3' },
      {
        studentUid: 'done-1',
        classId: 'cl-1',
        submittedAt: 5,
        score: 1,
        total: 1,
      },
    ];
    show();
    const openMenu = (uid: string) =>
      fireEvent.click(
        screen.getByRole('button', {
          name: `Actions for Student ${uid.slice(0, 6)}`,
        })
      );

    openMenu('working-3');
    expect(screen.queryByRole('menuitem', { name: 'Let in now' })).toBeNull();
    openMenu('working-3');
    openMenu('done-1');
    expect(screen.queryByRole('menuitem', { name: 'Let in now' })).toBeNull();
    openMenu('done-1');

    openMenu('waiting-1');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Let in now' }));
    await waitFor(() => expect(h.updateDoc).toHaveBeenCalledTimes(1));
    const [ref, field] = h.updateDoc.mock.calls[0] as [
      string,
      { segments: string[] },
    ];
    expect(ref).toBe('flashcard_sessions/fc-1');
    expect(field.segments).toEqual(['studentAccess', 'waiting-1']);
  });

  it('shows no period controls on a legacy or ended session', () => {
    h.session = session({ periodAccess: undefined, accessMode: undefined });
    const { unmount } = show();
    expect(screen.queryByRole('button', { name: 'Start all' })).toBeNull();
    unmount();
    h.session = session({ status: 'ended' });
    show();
    expect(screen.queryByRole('button', { name: 'Start all' })).toBeNull();
  });
});
