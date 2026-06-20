/**
 * Tests for RecentDocsCard — focus on the load-error path (silent-failure
 * audit C2).
 *
 * Before the fix, RecentDocsCard destructured only `{ docs, loading }` from
 * usePlcDocs, so a load error rendered the "No shared docs yet" empty state —
 * misleading, because an empty docs array on error doesn't mean there are no
 * docs. The card must now distinguish error from empty.
 *
 * Mocking: usePlcDocs is mocked so no Firebase is touched; react-i18next
 * returns the English defaultValue.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RecentDocsCard } from '@/components/plc/home/cards/RecentDocsCard';
import type { Plc, PlcDoc } from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

vi.mock('@/hooks/usePlcDocs', () => ({
  usePlcDocs: vi.fn(),
}));

import { usePlcDocs } from '@/hooks/usePlcDocs';

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

const fakeDoc: PlcDoc = {
  id: 'doc-1',
  title: 'Math Standards Notes',
  url: 'https://docs.google.com/document/d/abc123/edit',
  createdBy: 'uid-a',
  createdByName: 'Alice',
  createdAt: 1000,
  updatedAt: 2000,
};

const createDocMock = vi.fn();
const updateDocMock = vi.fn();
const deleteDocMock = vi.fn();

function setMocks(over: {
  docs?: PlcDoc[];
  loading?: boolean;
  error?: Error | null;
}) {
  vi.mocked(usePlcDocs).mockReturnValue({
    docs: over.docs ?? [],
    loading: over.loading ?? false,
    error: over.error ?? null,
    createDoc: createDocMock,
    updateDoc: updateDocMock,
    deleteDoc: deleteDocMock,
    restoreDoc: vi.fn(),
  });
}

describe('RecentDocsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMocks({});
  });

  it('shows the empty state when there are no docs and no error', () => {
    render(<RecentDocsCard plc={fakePlc} onNavigate={vi.fn()} />);
    expect(screen.getByText(/no shared docs yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load docs/i)).toBeNull();
  });

  it('shows an error indicator (not the empty state) when usePlcDocs errors', () => {
    setMocks({ error: new Error('permission-denied') });
    render(<RecentDocsCard plc={fakePlc} onNavigate={vi.fn()} />);
    expect(screen.getByText(/couldn't load docs/i)).toBeInTheDocument();
    // The misleading "No shared docs yet" empty-state copy must NOT show.
    expect(screen.queryByText(/no shared docs yet/i)).toBeNull();
  });

  it('renders the doc list when docs are present', () => {
    setMocks({ docs: [fakeDoc] });
    render(<RecentDocsCard plc={fakePlc} onNavigate={vi.fn()} />);
    expect(screen.getByText('Math Standards Notes')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load docs/i)).toBeNull();
  });
});
