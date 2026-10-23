// Flashcards results on the monitor-parity layout: Quiz-style counts, class picker and footer.
import '@testing-library/jest-dom';
import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
  parity: true,
  confirm: vi.fn(() => Promise.resolve(true)),
  resolveFlag: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/utils/serverTime', () => ({ getServerNow: () => 1_000 }));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  FieldPath: class {},
  getDocs: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { fromMillis: vi.fn() },
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn() })),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    orgId: null,
    canAccessFeature: (id: string) => h.parity && id === 'monitor-parity',
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    rosters: [
      { classlinkClassId: 'cl-1', name: 'Period 1' },
      { classlinkClassId: 'cl-3', name: 'Period 3' },
    ],
    addToast: vi.fn(),
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: h.confirm }),
}));
vi.mock('@/hooks/useFlashcardResults', () => ({
  useFlashcardResults: () => ({
    session: h.session,
    results: h.results,
    loading: false,
    error: null,
    resetStudent: vi.fn(),
    resolveFlag: h.resolveFlag,
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useMinuteClock', () => ({ useMinuteClock: () => 0 }));

import { FlashcardResultsView } from './FlashcardResultsView';

const cards = [
  { id: 'c1', term: 'uno', definition: 'one' },
  { id: 'c2', term: 'dos', definition: 'two' },
];

const session = (over: Partial<FlashcardSession> = {}): FlashcardSession =>
  ({
    id: 'fc-1',
    title: 'Spanish',
    kind: 'study',
    status: 'active',
    teacherUid: 'teacher-1',
    termLanguage: 'es-ES',
    definitionLanguage: 'en-US',
    classIds: ['cl-1', 'cl-3'],
    cards,
    ...over,
  }) as FlashcardSession;

const assignment = (
  over: Partial<FlashcardAssignment> = {}
): FlashcardAssignment => ({
  id: 'fc-1',
  sessionId: 'fc-1',
  setId: 'set-1',
  setTitle: 'Spanish',
  teacherUid: 'teacher-1',
  kind: 'study',
  status: 'active',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const mastered = { s: 5, c: 5, w: 0 };
const show = (onEnd?: () => Promise<void>, over = {}) =>
  render(
    <FlashcardResultsView
      assignment={assignment(over)}
      onBack={vi.fn()}
      onPublishScores={vi.fn()}
      onUnpublishScores={vi.fn()}
      onEnd={onEnd}
    />
  );

const bucket = (label: string) =>
  screen.getByRole('button', { name: new RegExp(label) });

beforeEach(() => {
  vi.clearAllMocks();
  h.parity = true;
  h.session = session();
  h.results = [
    { studentUid: 'fresh-1', classId: 'cl-1' },
    {
      studentUid: 'midway-1',
      classId: 'cl-1',
      studyMs: 60_000,
      cards: { c1: mastered },
    },
    {
      studentUid: 'allset-3',
      classId: 'cl-3',
      studyMs: 60_000,
      cards: { c1: mastered, c2: mastered },
    },
  ];
});

describe('FlashcardResultsView — monitor-parity layout', () => {
  it('keeps the old layout while the flag is off', () => {
    h.parity = false;
    show();
    expect(screen.queryByRole('button', { name: /Card results/ })).toBeNull();
    expect(screen.getByText('Average mastered')).toBeInTheDocument();
  });

  it('counts study students as Not started, In progress and Mastered', () => {
    show();
    expect(bucket('Not started')).toHaveTextContent('1');
    expect(bucket('In progress')).toHaveTextContent('1');
    expect(bucket('Mastered')).toHaveTextContent('1');
    fireEvent.click(bucket('Mastered'));
    expect(screen.getByText('Student allset')).toBeInTheDocument();
    expect(screen.queryByText('Student midway')).toBeNull();
  });

  it('narrows the counts to the class picked in the Class dropdown', () => {
    show();
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: 'cl-3' },
    });
    expect(bucket('Not started')).toHaveTextContent('0');
    expect(bucket('Mastered')).toHaveTextContent('1');
    expect(
      screen.getByRole('option', { name: 'Period 3 · Live' })
    ).toBeInTheDocument();
  });

  it('falls back to All classes when the picked class leaves the list', () => {
    const { rerender } = show();
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: 'cl-3' },
    });
    h.results = h.results.filter((r) => r.classId !== 'cl-3');
    h.results.push({ studentUid: 'other-2', classId: 'cl-2' });
    rerender(
      <FlashcardResultsView
        assignment={assignment()}
        onBack={vi.fn()}
        onPublishScores={vi.fn()}
        onUnpublishScores={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox', { name: 'Class' })).toHaveValue('');
    expect(bucket('Not started')).toHaveTextContent('2');
  });

  it('opens Card results with the hardest cards', () => {
    h.results = [
      {
        studentUid: 'midway-1',
        classId: 'cl-1',
        studyMs: 1,
        cards: { c2: { s: 0, c: 0, w: 3 } },
      },
    ];
    show();
    fireEvent.click(screen.getByRole('button', { name: /Card results/ }));
    expect(screen.getByText('dos')).toBeInTheDocument();
    expect(screen.getByText('3 misses')).toBeInTheDocument();
  });

  it('closes the assignment for every class after confirming', async () => {
    const onEnd = vi.fn(() => Promise.resolve());
    show(onEnd);
    fireEvent.click(screen.getByRole('button', { name: /Close all/ }));
    await waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
    expect(h.confirm).toHaveBeenCalledWith(
      expect.stringContaining('for every class'),
      expect.objectContaining({ confirmLabel: 'Close all' })
    );
  });

  it('hides Close all once the assignment has ended', () => {
    h.session = session({ status: 'ended' });
    show(vi.fn(), { status: 'ended' });
    expect(screen.queryByRole('button', { name: /Close all/ })).toBeNull();
    expect(screen.getAllByText('Ended').length).toBeGreaterThan(0);
  });

  it('shows Check counts with flagged answers and Publish scores in the footer', async () => {
    h.session = session({ kind: 'check', checkMode: 'write' });
    h.results = [
      { studentUid: 'fresh-1', classId: 'cl-1' },
      { studentUid: 'midway-1', classId: 'cl-1', studyMs: 5 },
      {
        studentUid: 'flagger-3',
        classId: 'cl-3',
        submittedAt: 5,
        score: 1,
        total: 2,
        flags: [{ cardId: 'c2', response: 'dose' }],
      },
    ];
    show(undefined, { kind: 'check' });
    expect(bucket('Not started')).toHaveTextContent('1');
    expect(bucket('In progress')).toHaveTextContent('1');
    expect(bucket('Submitted')).toHaveTextContent('1 flagged');
    expect(
      screen.getByRole('button', { name: /Publish scores/ })
    ).toBeInTheDocument();
    fireEvent.click(bucket('Submitted'));
    const flagRow = screen.getByText(/Wrote “dose”/).parentElement
      ?.parentElement as HTMLElement;
    fireEvent.click(within(flagRow).getByRole('button', { name: 'Accept' }));
    await waitFor(() =>
      expect(h.resolveFlag).toHaveBeenCalledWith('flagger-3', 'c2', true)
    );
  });

  it('uses the period bar for per-period classes', () => {
    const period = (over: Partial<PeriodAccess>): PeriodAccess => ({
      state: 'closed',
      openAt: null,
      closeAt: null,
      bellPeriodId: null,
      verified: true,
      label: 'P',
      ...over,
    });
    h.session = session({
      accessMode: 'assessment',
      periodAccess: {
        'cl-1': period({ label: 'P1' }),
        'cl-3': period({ label: 'P3', state: 'open' }),
      },
    });
    show();
    expect(screen.queryByRole('button', { name: 'Start all' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: 'cl-1' },
    });
    expect(screen.getByRole('button', { name: /Start/ })).toBeInTheDocument();
    expect(bucket('Not started')).toHaveTextContent('1');
  });
});
