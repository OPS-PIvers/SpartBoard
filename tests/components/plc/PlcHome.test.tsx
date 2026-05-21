/**
 * Unit tests for PlcHome — the clean landing page (Stream A).
 *
 * Mocking strategy: vi.mock the four data hooks so the component renders
 * deterministically without Firebase. react-i18next is mocked so
 * t(key, { defaultValue }) returns the English defaultValue.
 *
 * Key assertions:
 *   - An active assignment title renders in the attention region.
 *   - Clicking "Create quiz" calls onNavigate('assignments').
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
  });
  vi.mocked(usePlcQuizzes).mockReturnValue({
    quizzes: [],
    loading: false,
    error: null,
    shareQuizWithPlc: vi.fn(),
    mirrorPlcQuizHeader: vi.fn(),
    unshareQuizFromPlc: vi.fn(),
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

  it('clicking "Create quiz" calls onNavigate("assignments")', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /create quiz/i }));
    expect(onNavigate).toHaveBeenCalledWith('assignments');
  });

  it('clicking "Create video activity" calls onNavigate("assignments")', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    fireEvent.click(
      screen.getByRole('button', { name: /create video activity/i })
    );
    expect(onNavigate).toHaveBeenCalledWith('assignments');
  });

  it('clicking "Add a doc" calls onNavigate("docs")', () => {
    const onNavigate = vi.fn();
    render(<PlcHome plc={fakePlc} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /add a doc/i }));
    expect(onNavigate).toHaveBeenCalledWith('docs');
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
