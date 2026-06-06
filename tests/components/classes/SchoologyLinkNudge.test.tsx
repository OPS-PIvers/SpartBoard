import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SchoologySeenSection } from '@/hooks/useSchoologySeenSections';

let seen: SchoologySeenSection[] = [];
let rosters: { id: string; ltiContextId?: string }[] = [];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    rosters,
    updateRoster: vi.fn(),
    addToast: vi.fn(),
  }),
}));
vi.mock('@/hooks/useSchoologySeenSections', () => ({
  useSchoologySeenSections: () => seen,
}));
// Stub the modal so the nudge test stays free of the modal's firebase deps;
// surface its open state as a marker.
vi.mock('@/components/classes/LinkSchoologyModal', () => ({
  LinkSchoologyModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="link-modal-open" /> : null,
}));

import { SchoologyLinkNudge } from '@/components/classes/SchoologyLinkNudge';

const section = (contextId: string): SchoologySeenSection => ({
  contextId,
  contextTitle: `Title ${contextId}`,
  sessionId: `sess-${contextId}`,
  kind: 'quiz',
});

beforeEach(() => {
  seen = [];
  rosters = [];
  localStorage.clear();
  vi.clearAllMocks();
});

describe('SchoologyLinkNudge', () => {
  it('nudges when there are unlinked seen sections and opens the modal', () => {
    seen = [section('ctx-1'), section('ctx-2')];
    render(<SchoologyLinkNudge />);
    expect(
      screen.getByText(/2 Schoology sections to link/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Review & link/i }));
    expect(screen.getByTestId('link-modal-open')).toBeInTheDocument();
  });

  it('does not nudge for sections already linked to a roster', () => {
    seen = [section('ctx-1')];
    rosters = [{ id: 'r1', ltiContextId: 'ctx-1' }];
    render(<SchoologyLinkNudge />);
    expect(screen.queryByText(/Schoology section/i)).not.toBeInTheDocument();
  });

  it('stays dismissed (persisted) once waved off', () => {
    seen = [section('ctx-1')];
    const { unmount } = render(<SchoologyLinkNudge />);
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
    expect(screen.queryByText(/Schoology section/i)).not.toBeInTheDocument();
    unmount();
    // A remount re-reads the persisted dismissal → still quiet for ctx-1.
    render(<SchoologyLinkNudge />);
    expect(screen.queryByText(/Schoology section/i)).not.toBeInTheDocument();
  });
});
