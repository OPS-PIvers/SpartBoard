/**
 * Tests for AttentionCard — focus on the load-error path (review fix #7).
 *
 * Before the fix, AttentionCard ignored the hooks' `error` state and rendered
 * the "No active assignments" empty state on any read failure — misleading,
 * because an empty entries array on error doesn't mean there are no
 * assignments. The card must now distinguish error from empty.
 *
 * Mocking: the two data hooks are mocked so no Firebase is touched;
 * react-i18next returns the English defaultValue.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AttentionCard } from '@/components/plc/home/cards/AttentionCard';
import type { Plc } from '@/types';

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

const fakePlc: Plc = {
  id: 'plc-1',
  name: '5th Grade Math',
  leadUid: 'uid-a',
  members: {},
  memberUids: ['uid-a'],
  memberEmails: { 'uid-a': 'alice@school.edu' },
  createdAt: 1000,
  updatedAt: 2000,
};

describe('AttentionCard', () => {
  beforeEach(() => {
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
  });

  it('shows the empty state when there are no assignments and no error', () => {
    render(<AttentionCard plc={fakePlc} onNavigate={vi.fn()} />);
    expect(screen.getByText(/no active assignments/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load assignments/i)).toBeNull();
  });

  it('shows an error indicator (not the empty state) when the index errors', () => {
    vi.mocked(usePlcAssignmentIndex).mockReturnValue({
      entries: [],
      loading: false,
      error: new Error('permission-denied'),
    });
    render(<AttentionCard plc={fakePlc} onNavigate={vi.fn()} />);
    expect(screen.getByText(/couldn't load assignments/i)).toBeInTheDocument();
    // The misleading empty-state copy must NOT show on error.
    expect(screen.queryByText(/no active assignments/i)).toBeNull();
  });

  it('shows an error indicator when the contributions hook errors', () => {
    vi.mocked(usePlcContributions).mockReturnValue({
      contributions: [],
      loading: false,
      error: new Error('snapshot failed'),
    });
    render(<AttentionCard plc={fakePlc} onNavigate={vi.fn()} />);
    expect(screen.getByText(/couldn't load assignments/i)).toBeInTheDocument();
    expect(screen.queryByText(/no active assignments/i)).toBeNull();
  });
});
