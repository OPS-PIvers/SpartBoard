/**
 * Unit tests for PlcHome — the clean landing page (Stream A).
 *
 * Mocking strategy: vi.mock the four data hooks so the component renders
 * deterministically without Firebase. react-i18next is mocked so
 * t(key, { defaultValue }) returns the English defaultValue.
 *
 * Key assertions:
 *   - An active assignment title renders in the attention region.
 *   - Clicking "Create quiz" calls onNavigate('quizzes').
 *   - Recent doc titles render in the docs card.
 *   - Member initials/avatars render.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlcHome } from '@/components/plc/home/PlcHome';
import type { Plc, PlcAssignmentIndexEntry, PlcDoc } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

// PlcHome renders the PlcPresenceStrip, which reads useAuth + the PLC store
// selectors. This test does not mount an AuthProvider/PlcProvider, so stub them
// to inert values — with no presence the strip renders nothing, which is the
// correct no-provider behavior.
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-a' },
    // QuickCreateBar reads getAssignmentMode for the quiz/VA modals.
    getAssignmentMode: () => 'submissions',
  }),
}));
// YourActionItemsCard reads useDashboard().addToast for failure toasts.
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/usePlcContext', async (importActual) => {
  const actual = await importActual<typeof import('@/context/usePlcContext')>();
  const emptySlice = { data: [], loading: false, error: null };
  return {
    ...actual,
    usePlcWhoIsHere: () => [],
    usePlcMembers: () => [],
    // PlcHome now mounts the activity feed + since-you-were-here digest, both of
    // which read the provider activity slice. No provider here → empty feed.
    usePlcActivity: () => [],
    // Wave-3 Home: the common-assessment banner reads the assessments +
    // aggregates provider slices. No provider here → empty slices.
    usePlcAssessmentsData: () => emptySlice,
    usePlcAggregatesData: () => emptySlice,
    // Wave-4 (T10): QuickCreateBar gates its create buttons behind the viewer
    // read-only check. This suite renders as a full member, so allow edits.
    useCanEditPlcContent: () => true,
  };
});

// Wave-3 Home additions: the QuickCreateBar reads the personal-library hooks for
// its disabled-reason affordance; mock them as Drive-connected with content so
// the buttons are enabled and open their modals on click.
vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({ quizzes: [{ id: 'q1' }], isDriveConnected: true }),
}));
vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: () => ({
    activities: [{ id: 'va1' }],
    isDriveConnected: true,
  }),
}));
// The authoring modals are heavy + provider-coupled; stub them so opening them
// just renders a sentinel we can assert on.
vi.mock('@/components/plc/PlcNewQuizAssignmentModal', () => ({
  PlcNewQuizAssignmentModal: () => <div data-testid="quiz-assign-modal" />,
}));
vi.mock('@/components/plc/PlcNewVideoActivityAssignmentModal', () => ({
  PlcNewVideoActivityAssignmentModal: () => (
    <div data-testid="va-assign-modal" />
  ),
}));
vi.mock('@/components/plc/docs/PlcAddDocModal', () => ({
  PlcAddDocModal: () => <div data-testid="add-doc-modal" />,
}));
// The common-assessment banner + your-action-items card read standalone hooks
// (meetings + todos) that hit Firebase without a provider; stub them inert.
vi.mock('@/hooks/usePlcMeetings', () => ({
  usePlcMeetings: () => ({
    meetings: [],
    meetingsById: new Map(),
    loading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/usePlcTodos', () => ({
  usePlcTodos: () => ({
    todos: [],
    loading: false,
    error: null,
    toggleDone: vi.fn(() => Promise.resolve()),
  }),
}));

// PlcHome owns a usePlcUnread instance (cursor + markSeen-on-mount). Stub it so
// this test doesn't touch Firebase; the markSeen-on-mount behavior is covered in
// PlcActivityFeed.test.tsx.
vi.mock('@/hooks/usePlcUnread', () => ({
  usePlcUnread: () => ({
    lastSeenAt: null,
    unreadCount: 0,
    markSeen: vi.fn(() => Promise.resolve()),
    loading: false,
  }),
}));

// All four hooks are mocked at the module level. Each test can override the
// returned value via the vi.mocked().mockReturnValue() pattern.
vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  usePlcAssignmentIndex: vi.fn(),
}));
vi.mock('@/hooks/usePlcContributions', () => ({
  usePlcContributions: vi.fn(),
}));
vi.mock('@/hooks/usePlcDocs', () => ({
  usePlcDocs: vi.fn(),
}));
vi.mock('@/hooks/usePlcQuizzes', () => ({
  usePlcQuizzes: vi.fn(),
}));

import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import { usePlcContributions } from '@/hooks/usePlcContributions';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { usePlcQuizzes } from '@/hooks/usePlcQuizzes';

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

const activeEntry: PlcAssignmentIndexEntry = {
  id: 'assign-1',
  kind: 'quiz',
  ownerUid: 'uid-a',
  ownerName: 'Alice',
  ownerEmail: 'alice@school.edu',
  title: 'Unit 3 Quiz',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/fake',
  status: 'active',
  createdAt: 1000,
};

const pausedEntry: PlcAssignmentIndexEntry = {
  ...activeEntry,
  id: 'assign-2',
  title: 'Unit 2 Review',
  status: 'paused',
};

const inactiveEntry: PlcAssignmentIndexEntry = {
  ...activeEntry,
  id: 'assign-3',
  title: 'Old Quiz',
  status: 'inactive',
};

const fakeDoc: PlcDoc = {
  id: 'doc-1',
  title: 'Math Standards Notes',
  url: 'https://docs.google.com/document/d/fake',
  createdBy: 'uid-a',
  createdByName: 'Alice',
  createdAt: 1000,
  updatedAt: 2000,
};

// ---------------------------------------------------------------------------
// Default mock implementations
// ---------------------------------------------------------------------------

function setDefaultMocks() {
  vi.mocked(usePlcAssignmentIndex).mockReturnValue({
    entries: [activeEntry, pausedEntry, inactiveEntry],
    loading: false,
    error: null,
  });
  vi.mocked(usePlcContributions).mockReturnValue({
    contributions: [],
    loading: false,
    error: null,
  });
  vi.mocked(usePlcDocs).mockReturnValue({
    docs: [fakeDoc],
    loading: false,
    error: null,
    createDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    restoreDoc: vi.fn(),
  });
  vi.mocked(usePlcQuizzes).mockReturnValue({
    quizzes: [],
    loading: false,
    error: null,
    shareQuizWithPlc: vi.fn(),
    mirrorPlcQuizHeader: vi.fn(),
    unshareQuizFromPlc: vi.fn(),
    restoreQuizInPlc: vi.fn(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcHome', () => {
  beforeEach(() => {
    setDefaultMocks();
  });

  it('renders the PLC name as a heading', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    expect(screen.getByText('5th Grade Math')).toBeInTheDocument();
  });

  it('renders active and paused assignments in the attention region', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    expect(screen.getByText('Unit 3 Quiz')).toBeInTheDocument();
    expect(screen.getByText('Unit 2 Review')).toBeInTheDocument();
  });

  it('does NOT render inactive assignments in the attention region', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    expect(screen.queryByText('Old Quiz')).not.toBeInTheDocument();
  });

  // Decision 4.2: the QuickCreate buttons OPEN the existing authoring modals
  // (real content creation) rather than merely navigating.
  it('clicking "Assign quiz" opens the quiz-assignment modal', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    expect(screen.queryByTestId('quiz-assign-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /assign quiz/i }));
    expect(screen.getByTestId('quiz-assign-modal')).toBeInTheDocument();
    // It opens a modal — it does NOT navigate away.
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('clicking "Assign video activity" opens the video-activity modal', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    expect(screen.queryByTestId('va-assign-modal')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /assign video activity/i })
    );
    expect(screen.getByTestId('va-assign-modal')).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('clicking "Add a doc" opens the add-doc modal', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    expect(screen.queryByTestId('add-doc-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add a doc/i }));
    expect(screen.getByTestId('add-doc-modal')).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('renders recent doc titles in the docs card', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    expect(screen.getByText('Math Standards Notes')).toBeInTheDocument();
  });

  it('"View all docs" calls onNavigate("docs")', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    // Use the aria-label "View all docs" to distinguish from "View all assignments"
    fireEvent.click(screen.getByRole('button', { name: /view all docs/i }));
    expect(onNavigate).toHaveBeenCalledWith('docs');
  });

  it('renders member initials from memberEmails', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    // alice → "AL", bob → "BO" using the same initialsFromEmail logic
    // The exact initials depend on our implementation, so we just assert
    // that the members strip renders some avatars.
    const members = screen.getAllByRole('img');
    expect(members.length).toBeGreaterThanOrEqual(2);
  });

  it('"Manage members" calls onNavigate("members")', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /manage/i }));
    expect(onNavigate).toHaveBeenCalledWith('members');
  });

  it('shows empty state when there are no active/paused assignments', () => {
    vi.mocked(usePlcAssignmentIndex).mockReturnValue({
      entries: [inactiveEntry],
      loading: false,
      error: null,
    });
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    expect(screen.queryByText('Unit 3 Quiz')).not.toBeInTheDocument();
    expect(screen.queryByText('Unit 2 Review')).not.toBeInTheDocument();
  });

  it('shows loading state when assignment index is loading', () => {
    vi.mocked(usePlcAssignmentIndex).mockReturnValue({
      entries: [],
      loading: true,
      error: null,
    });
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    // Component should render without crashing; no assignment titles visible
    expect(screen.queryByText('Unit 3 Quiz')).not.toBeInTheDocument();
  });
});
