// flashcards-assign-v2: Results opens a Check's Results screen; Monitor and study assignments keep the monitor.
import '@testing-library/jest-dom';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FlashcardAssignment, FlashcardSession } from '@/types';

const auth = vi.hoisted(() => ({ v2: true }));
const state = vi.hoisted((): { session: unknown } => ({ session: null }));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    orgId: null,
    user: { uid: 'teacher-1' },
    isExternalUser: false,
    ensureGoogleScope: vi.fn(),
    canAccessFeature: (id: string) => auth.v2 && id === 'flashcards-assign-v2',
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
    session: state.session,
    results: [],
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
vi.mock('@/hooks/useViewAsOutward', () => ({
  useViewAsOutward: () => ({ active: false, locked: false, confirm: vi.fn() }),
  VIEW_AS_WRITES: { exportSheets: [] },
}));

import { FlashcardResultsView } from './FlashcardResultsView';

const assignment = {
  id: 'a1',
  sessionId: 'a1',
  setId: 'set-1',
  setTitle: 'Spanish',
  teacherUid: 'teacher-1',
  kind: 'check',
  status: 'ended',
  createdAt: 1,
  updatedAt: 0,
} as FlashcardAssignment;

const session = (over: Partial<FlashcardSession> = {}) =>
  ({
    id: 'a1',
    teacherUid: 'teacher-1',
    setId: 'set-1',
    title: 'Spanish',
    kind: 'check',
    checkMode: 'write',
    termLanguage: 'es-ES',
    definitionLanguage: 'en-US',
    cards: [],
    classIds: [],
    status: 'ended',
    createdAt: 1,
    ...over,
  }) as FlashcardSession;

const show = (screenName?: 'monitor' | 'results') =>
  render(
    <FlashcardResultsView
      assignment={assignment}
      onBack={vi.fn()}
      onPublishScores={vi.fn()}
      onUnpublishScores={vi.fn()}
      screen={screenName}
    />
  );

describe('FlashcardResultsView screens', () => {
  beforeEach(() => {
    auth.v2 = true;
    state.session = session();
  });

  it('opens the Results screen for a Check', () => {
    show('results');
    expect(screen.getByText('No data available yet')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('keeps the monitor for Monitor, study assignments and the flag off', () => {
    const { unmount } = show('monitor');
    expect(
      screen.getByRole('button', { name: /Card results/ })
    ).toBeInTheDocument();
    unmount();
    state.session = session({ kind: 'study' });
    const second = show('results');
    expect(screen.queryByText('No data available yet')).toBeNull();
    second.unmount();
    auth.v2 = false;
    state.session = session();
    show('results');
    expect(screen.queryByText('No data available yet')).toBeNull();
  });
});
