import '@testing-library/jest-dom';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FlashcardAssignment, FlashcardSession } from '@/types';

const auth = vi.hoisted(() => ({ canSpeak: false }));
const state = vi.hoisted(() => ({ session: null }));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    orgId: null,
    canAccessFeature: (id: string) =>
      auth.canSpeak && id === 'flashcards-speak',
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

import { FlashcardResultsView } from './FlashcardResultsView';

const assignment: FlashcardAssignment = {
  id: 'a1',
  sessionId: 'a1',
  setId: 'set-1',
  setTitle: 'Spanish',
  teacherUid: 'teacher-1',
  kind: 'study',
  status: 'active',
  createdAt: 1,
  updatedAt: 0,
};

const session = (over: Partial<FlashcardSession> = {}): FlashcardSession => ({
  id: 'a1',
  teacherUid: 'teacher-1',
  setId: 'set-1',
  title: 'Spanish',
  kind: 'study',
  termLanguage: 'es-ES',
  definitionLanguage: 'en-US',
  cards: [],
  classIds: [],
  status: 'active',
  createdAt: 1,
  speak: {
    dialects: ['es-ES'],
    preset: 'beginner',
    strict: false,
    groups: {},
    attempts: 3,
    example: true,
    locked: false,
  },
  ...over,
});

const show = () =>
  render(
    <FlashcardResultsView
      assignment={assignment}
      onBack={vi.fn()}
      onPublishScores={vi.fn()}
      onUnpublishScores={vi.fn()}
    />
  );

describe('FlashcardResultsView Speaking view gate', () => {
  beforeEach(() => {
    auth.canSpeak = false;
    state.session = session();
  });

  it('shows the Speaking switch with the flag and a Speak stamp', () => {
    auth.canSpeak = true;
    show();
    expect(screen.getByRole('tab', { name: 'Speaking' })).toBeInTheDocument();
  });

  it('hides it without the flag', () => {
    show();
    expect(screen.queryByRole('tab', { name: 'Speaking' })).toBeNull();
    expect(screen.getByText('Average mastered')).toBeInTheDocument();
  });

  it('hides it without a Speak stamp or a Speak language', () => {
    auth.canSpeak = true;
    state.session = session({ speak: undefined });
    const { unmount } = show();
    expect(screen.queryByRole('tab', { name: 'Speaking' })).toBeNull();
    unmount();
    state.session = session({ termLanguage: 'fr-FR' });
    show();
    expect(screen.queryByRole('tab', { name: 'Speaking' })).toBeNull();
  });
});
