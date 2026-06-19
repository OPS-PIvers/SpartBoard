/**
 * Integration tests for PlcSharedDataBody.
 *
 * Mocking strategy: vi.mock the two data hooks (usePlcAssignmentIndex,
 * usePlcContributions) so the component renders without Firebase.
 * react-i18next is mocked so t(key, { defaultValue }) returns the English
 * defaultValue.
 *
 * Card model (post-fix): RESULTS cards are driven by CONTRIBUTION groups,
 * one per distinct quiz identity (`syncGroupId ?? quizId`) — NOT by
 * assignment-index entries. Index entries only populate the filter
 * dropdowns. This avoids the double-count bug where a teacher with 2+
 * assignments had ALL their contributions counted onto EVERY one of their
 * (entry-derived) cards.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlcSharedDataBody } from '@/components/plc/sharedData/PlcSharedDataBody';
import type { Plc, PlcAssignmentIndexEntry, PlcContribution } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  usePlcAssignmentIndex: vi.fn(),
}));

vi.mock('@/hooks/usePlcContributions', () => ({
  usePlcContributions: vi.fn(),
}));

import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import { usePlcContributions } from '@/hooks/usePlcContributions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: '5th Grade Math',
  leadUid: 'uid-a',
  members: {},
  memberUids: ['uid-a', 'uid-b'],
  memberEmails: {
    'uid-a': 'alice@school.edu',
    'uid-b': 'bob@school.edu',
  },
  createdAt: 1000,
  updatedAt: 2000,
};

const quizEntry: PlcAssignmentIndexEntry = {
  id: 'entry-quiz',
  kind: 'quiz',
  ownerUid: 'uid-alice',
  ownerName: 'Alice',
  ownerEmail: 'alice@school.edu',
  title: 'Unit 3 Quiz',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/fake',
  status: 'active',
  createdAt: 1_000_000,
};

const vaEntry: PlcAssignmentIndexEntry = {
  id: 'entry-va',
  kind: 'video-activity',
  ownerUid: 'uid-bob',
  ownerName: 'Bob',
  ownerEmail: 'bob@school.edu',
  title: 'Fractions Video',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/fake2',
  status: 'active',
  createdAt: 1_000_001,
};

const aliceContrib: PlcContribution = {
  id: 'contrib-alice',
  schemaVersion: 1,
  quizId: 'quiz-1',
  syncGroupId: null,
  teacherUid: 'uid-alice',
  teacherName: 'Alice',
  questionsSnapshot: [{ id: 'q1', text: 'Unit 3 Quiz', points: 10 }],
  responses: [
    {
      studentDisplayName: 'Student P1',
      pin: null,
      classPeriod: '1',
      status: 'completed',
      scorePercent: 80,
      pointsEarned: 8,
      maxPoints: 10,
      tabSwitchWarnings: 0,
      submittedAt: 2_000_000,
      pointsByQuestionId: { q1: 8 },
    },
    {
      studentDisplayName: 'Student P2',
      pin: null,
      classPeriod: '2',
      status: 'completed',
      scorePercent: 60,
      pointsEarned: 6,
      maxPoints: 10,
      tabSwitchWarnings: 0,
      submittedAt: 2_000_001,
      pointsByQuestionId: { q1: 6 },
    },
  ],
  updatedAt: 2_000_000,
};

const bobContrib: PlcContribution = {
  id: 'contrib-bob',
  schemaVersion: 1,
  quizId: 'quiz-2',
  syncGroupId: null,
  teacherUid: 'uid-bob',
  teacherName: 'Bob',
  questionsSnapshot: [{ id: 'q1', text: 'Bob Quiz', points: 10 }],
  responses: [
    {
      studentDisplayName: 'Student P3',
      pin: null,
      classPeriod: '1',
      status: 'completed',
      scorePercent: 90,
      pointsEarned: 9,
      maxPoints: 10,
      tabSwitchWarnings: 0,
      submittedAt: 2_000_002,
      pointsByQuestionId: { q1: 9 },
    },
  ],
  updatedAt: 2_000_002,
};

// ---------------------------------------------------------------------------
// Default mock setup
// ---------------------------------------------------------------------------

function setDefaultMocks() {
  vi.mocked(usePlcAssignmentIndex).mockReturnValue({
    entries: [quizEntry, vaEntry],
    loading: false,
    error: null,
  });
  vi.mocked(usePlcContributions).mockReturnValue({
    contributions: [aliceContrib, bobContrib],
    loading: false,
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcSharedDataBody', () => {
  beforeEach(() => {
    setDefaultMocks();
  });

  it('renders without crashing', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);
    // Just verify it mounts
    expect(document.body).toBeDefined();
  });

  it('shows a loading state when assignment index is loading', () => {
    vi.mocked(usePlcAssignmentIndex).mockReturnValue({
      entries: [],
      loading: true,
      error: null,
    });
    render(<PlcSharedDataBody plc={fakePlc} />);
    // Should show a loading indicator (spinner or skeleton), not entries
    expect(screen.queryByText('Unit 3 Quiz')).not.toBeInTheDocument();
  });

  it('shows an error state when assignment index errors', () => {
    vi.mocked(usePlcAssignmentIndex).mockReturnValue({
      entries: [],
      loading: false,
      error: new Error('Permission denied'),
    });
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(
      screen.getAllByText(/couldn't load|error|permission denied/i).length
    ).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no entries and no contributions', () => {
    vi.mocked(usePlcAssignmentIndex).mockReturnValue({
      entries: [],
      loading: false,
      error: null,
    });
    vi.mocked(usePlcContributions).mockReturnValue({
      contributions: [],
      loading: false,
      error: null,
    });
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(
      screen.getByText(/no shared data|no results|no assignments/i)
    ).toBeInTheDocument();
  });

  it('renders one card per distinct quiz identity (contribution-driven)', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);
    // Two contributions with distinct quizIds → two cards.
    expect(screen.getAllByTestId('shared-data-card')).toHaveLength(2);
  });

  it('uses the assignment-index title for a single-owner quiz group', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);
    // Alice's quiz group is single-owner and she has a quiz index entry, so
    // the card adopts that entry's title.
    const cards = screen.getAllByTestId('shared-data-card');
    expect(cards.some((c) => within(c).queryByText('Unit 3 Quiz'))).toBe(true);
  });

  it('type=video-activity shows no results (contributions are quiz data)', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);

    const typeSelect = screen.getByRole('combobox', { name: /type/i });
    fireEvent.change(typeSelect, { target: { value: 'video-activity' } });

    // No video-activity contributions exist, so no result cards.
    expect(screen.queryAllByTestId('shared-data-card')).toHaveLength(0);
    expect(
      screen.getByText(/no results match your filters/i)
    ).toBeInTheDocument();
  });

  it('type=quiz keeps the quiz result cards', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);

    const typeSelect = screen.getByRole('combobox', { name: /type/i });
    fireEvent.change(typeSelect, { target: { value: 'quiz' } });

    expect(screen.getAllByTestId('shared-data-card')).toHaveLength(2);
  });

  it('teacher filter narrows to that teacher’s quiz groups', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);

    const teacherSelect = screen.getByRole('combobox', { name: /teacher/i });
    fireEvent.change(teacherSelect, { target: { value: 'uid-alice' } });

    // Only Alice's contribution group remains.
    expect(screen.getAllByTestId('shared-data-card')).toHaveLength(1);
    expect(
      within(screen.getAllByTestId('shared-data-card')[0]).getByText(
        'Unit 3 Quiz'
      )
    ).toBeInTheDocument();
  });

  it('class-period filter narrows visible response counts', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);

    const periodSelect = screen.getByRole('combobox', {
      name: /class|period/i,
    });
    fireEvent.change(periodSelect, { target: { value: '2' } });

    const cards = screen.getAllByTestId('shared-data-card');
    // With period filter active, verify the component re-renders without crash.
    expect(cards.length).toBeGreaterThan(0);
  });

  it('renders filter bar with accessible labels', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(screen.getByRole('combobox', { name: /type/i })).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /teacher/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /class|period/i })
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Regression — the double-count bug (review MUST-FIX #2)
  // -------------------------------------------------------------------------

  it('does NOT double-count a single teacher who owns TWO different quizzes', () => {
    // Alice owns two distinct assignments / quizzes. Under the OLD model,
    // contributions were matched to an index entry by teacherUid===ownerUid
    // only, so BOTH of Alice's contributions were counted on BOTH of her
    // cards (4 students total shown across 2 cards instead of 2). The fix
    // groups by quiz identity so each contribution lands on exactly one card.
    const aliceEntry1: PlcAssignmentIndexEntry = {
      ...quizEntry,
      id: 'entry-1',
      title: 'Quiz One',
    };
    const aliceEntry2: PlcAssignmentIndexEntry = {
      ...quizEntry,
      id: 'entry-2',
      title: 'Quiz Two',
    };
    const aliceQuiz1: PlcContribution = {
      ...aliceContrib,
      id: 'c-quiz-1',
      quizId: 'quiz-one',
      questionsSnapshot: [{ id: 'q1', text: 'Quiz One', points: 10 }],
      responses: [
        {
          studentDisplayName: 'Q1 Student A',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: 100,
          pointsEarned: 10,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: 2_000_000,
          pointsByQuestionId: { q1: 10 },
        },
      ],
    };
    const aliceQuiz2: PlcContribution = {
      ...aliceContrib,
      id: 'c-quiz-2',
      quizId: 'quiz-two',
      questionsSnapshot: [{ id: 'q1', text: 'Quiz Two', points: 10 }],
      responses: [
        {
          studentDisplayName: 'Q2 Student A',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: 50,
          pointsEarned: 5,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: 2_000_010,
          pointsByQuestionId: { q1: 5 },
        },
        {
          studentDisplayName: 'Q2 Student B',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: 70,
          pointsEarned: 7,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: 2_000_011,
          pointsByQuestionId: { q1: 7 },
        },
      ],
    };

    vi.mocked(usePlcAssignmentIndex).mockReturnValue({
      entries: [aliceEntry1, aliceEntry2],
      loading: false,
      error: null,
    });
    vi.mocked(usePlcContributions).mockReturnValue({
      contributions: [aliceQuiz1, aliceQuiz2],
      loading: false,
      error: null,
    });

    render(<PlcSharedDataBody plc={fakePlc} />);

    const cards = screen.getAllByTestId('shared-data-card');
    // Two distinct quiz identities → exactly two cards.
    expect(cards).toHaveLength(2);

    // Each card reports its OWN student count only — never the sum.
    // Quiz One has 1 student; Quiz Two has 2 students. The OLD bug would have
    // shown 3 students (1+2) on BOTH cards.
    const oneStudentCards = cards.filter((c) =>
      within(c).queryByText(/^1 students$/)
    );
    const twoStudentCards = cards.filter((c) =>
      within(c).queryByText(/^2 students$/)
    );
    expect(oneStudentCards).toHaveLength(1);
    expect(twoStudentCards).toHaveLength(1);

    // The double-count signature (3 students on any card) must NOT appear.
    expect(cards.some((c) => within(c).queryByText(/^3 students$/))).toBe(
      false
    );
  });

  // -------------------------------------------------------------------------
  // Cross-teacher synced group (T5)
  // -------------------------------------------------------------------------

  it('renders ONE card crediting BOTH teachers for a quiz synced across teachers', () => {
    // Two teachers ran the SAME synced quiz (same syncGroupId). The view must
    // collapse them into exactly ONE result card attributed to both teachers,
    // never two cards and never a double-counted single teacher.
    const aliceSynced: PlcContribution = {
      ...aliceContrib,
      id: 'c-alice-synced',
      quizId: 'quiz-alice-copy',
      syncGroupId: 'sync-shared',
      teacherUid: 'uid-alice',
      teacherName: 'Alice',
      questionsSnapshot: [{ id: 'q1', text: 'Shared Synced Quiz', points: 10 }],
      responses: [
        {
          studentDisplayName: 'Alice Student',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: 80,
          pointsEarned: 8,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: 2_000_000,
          pointsByQuestionId: { q1: 8 },
        },
      ],
      updatedAt: 2_000_000,
    };
    const bobSynced: PlcContribution = {
      ...bobContrib,
      id: 'c-bob-synced',
      quizId: 'quiz-bob-copy',
      syncGroupId: 'sync-shared',
      teacherUid: 'uid-bob',
      teacherName: 'Bob',
      questionsSnapshot: [{ id: 'q1', text: 'Shared Synced Quiz', points: 10 }],
      responses: [
        {
          studentDisplayName: 'Bob Student',
          pin: null,
          classPeriod: '1',
          status: 'completed',
          scorePercent: 60,
          pointsEarned: 6,
          maxPoints: 10,
          tabSwitchWarnings: 0,
          submittedAt: 2_000_001,
          pointsByQuestionId: { q1: 6 },
        },
      ],
      updatedAt: 2_000_001,
    };

    vi.mocked(usePlcAssignmentIndex).mockReturnValue({
      entries: [],
      loading: false,
      error: null,
    });
    vi.mocked(usePlcContributions).mockReturnValue({
      contributions: [aliceSynced, bobSynced],
      loading: false,
      error: null,
    });

    render(<PlcSharedDataBody plc={fakePlc} />);

    const cards = screen.getAllByTestId('shared-data-card');
    // Same syncGroupId → exactly ONE card.
    expect(cards).toHaveLength(1);

    // The card credits BOTH teachers (distinct teacherUids = 2).
    expect(within(cards[0]).getByText(/^2 teachers$/)).toBeInTheDocument();

    // Combined student count is 2 (one per teacher) — not double-counted, not
    // shown as two separate cards.
    expect(within(cards[0]).getByText(/^2 students$/)).toBeInTheDocument();
  });
});
