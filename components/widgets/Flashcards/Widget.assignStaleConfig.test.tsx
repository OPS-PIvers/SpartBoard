import '@testing-library/jest-dom';
import React from 'react';
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FlashcardsWidget } from './Widget';
import type { FlashcardSet, WidgetData } from '@/types';

const h = vi.hoisted(() => ({
  updateWidget: vi.fn(),
  addToast: vi.fn(),
  resolveCreate: null as null | ((id: string) => void),
}));
const set = {
  id: 's-1',
  title: 'Cells',
  termLanguage: 'en',
  definitionLanguage: 'en',
  cards: [{ id: 'c1', term: 'A', definition: 'B' }],
  createdAt: 1,
  updatedAt: 2,
} as FlashcardSet;

vi.mock('@/hooks/useClaudeReview', () => ({
  useClaudeReview: () => ({
    needsReview: () => false,
    badge: () => null,
    confirmUse: () => Promise.resolve(true),
    markReviewed: () => undefined,
    whenReviewed: (_i: unknown, go: () => void) => go(),
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 't1' },
    ensureGoogleScope: vi.fn(),
    canAccessFeature: () => false,
  }),
}));
vi.mock('@/hooks/usePlcs', () => ({ usePlcs: () => ({ plcs: [] }) }));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast: h.addToast,
    updateWidget: h.updateWidget,
    rosters: [{ id: 'r1', classlinkClassId: 'c', name: 'R' }],
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn() }),
}));
vi.mock('@/hooks/useFlashcardSets', () => ({
  useFlashcardSets: () => ({
    sets: [set],
    loading: false,
    error: null,
    saveSet: vi.fn(),
    deleteSet: vi.fn(),
    publishSet: vi.fn(),
    revokeShare: vi.fn(),
    fillSpeakVoices: vi.fn(),
  }),
  FlashcardStudySyncError: class extends Error {},
}));
vi.mock('@/hooks/useFlashcardAssignments', () => ({
  useFlashcardAssignments: () => ({
    assignments: [],
    loading: false,
    error: null,
    createAssignment: () =>
      new Promise<string>((res) => {
        h.resolveCreate = res;
      }),
  }),
}));
vi.mock('@/hooks/useFolders', () => ({ useFolders: () => ({ folders: [] }) }));
vi.mock('@/hooks/useTeacherBellPeriods', () => ({
  useAssignPeriodAccess: () => undefined,
}));
vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  isAuthBypass: false,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
vi.mock('@/components/widgets/WidgetLayout', () => ({
  WidgetLayout: ({ content }: { content: React.ReactNode }) => (
    <div>{content}</div>
  ),
}));
vi.mock('./FlashcardLibrary', () => ({
  FlashcardLibrary: ({ onAssign }: { onAssign: (s: FlashcardSet) => void }) => (
    <button onClick={() => onAssign(set)}>assign</button>
  ),
}));
vi.mock('./FlashcardAssignStepper', async (orig) => ({
  ...(await orig<object>()),
  FlashcardAssignStepper: ({
    onAssign,
  }: {
    onAssign: (s: unknown) => void;
  }) => (
    <button
      onClick={() =>
        onAssign({
          input: { set, kind: 'study', audience: 'students' },
          rosterIds: ['r1'],
          expandedTargeting: {
            targetMode: 'class',
            targetStudents: [],
            targetGroupIds: [],
            overridesByKey: {},
          },
        })
      }
    >
      submit
    </button>
  ),
}));
vi.mock('@/utils/copyText', () => ({ copyText: vi.fn(() => true) }));

const mk = (config: Record<string, unknown>) =>
  ({ id: 'w1', type: 'flashcards', config }) as unknown as WidgetData;

describe('FlashcardsWidget assign keeps config edits made during the await', () => {
  it('does not write back the pre-await config snapshot', async () => {
    const { rerender } = render(
      <FlashcardsWidget widget={mk({ view: 'library', presentSetId: null })} />
    );
    fireEvent.click(screen.getByText('assign'));
    fireEvent.click(screen.getByText('submit'));
    // Board changes while the assignment is being created.
    rerender(
      <FlashcardsWidget widget={mk({ view: 'present', presentSetId: 's-1' })} />
    );
    act(() => {
      h.resolveCreate?.('sess-1');
    });
    await waitFor(() => expect(h.updateWidget).toHaveBeenCalled());
    const writes = h.updateWidget.mock.calls
      .map((c) => (c[1] as { config?: Record<string, unknown> }).config)
      .filter((c): c is Record<string, unknown> => !!c);
    const clobbered = writes.some((c) => 'presentSetId' in c || 'view' in c);
    expect(clobbered).toBe(false);
    expect(writes.some((c) => 'lastRosterIdsBySetId' in c)).toBe(true);
  });
});
