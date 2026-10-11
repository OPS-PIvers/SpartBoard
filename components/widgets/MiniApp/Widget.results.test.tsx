// Mini App results v2 at assign (docs/plans/MINI_APP_RESULTS.md D18): only the preview flag plus
// Mini App submissions on in Organization settings creates a v2 session; otherwise nothing changes.
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiniAppWidget } from './Widget';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useSavedWidgets } from '@/context/useSavedWidgets';
import { useMiniAppSessionTeacher } from '@/hooks/useMiniAppSession';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';
import { useFolders } from '@/hooks/useFolders';
import { useMiniAppSync } from './hooks/useMiniAppSync';
import type { AssignmentMode, MiniAppItem, WidgetData } from '@/types';

const loadKey = vi.fn();
vi.mock('@/utils/miniAppResults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/miniAppResults')>()),
  loadMiniAppKey: (...args: unknown[]) => loadKey(...args) as unknown,
}));
vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/hooks/useClaudeReview', () => ({
  useClaudeReview: () => ({
    needsReview: () => false,
    badge: () => null,
    confirmUse: () => Promise.resolve(true),
    markReviewed: () => undefined,
    whenReviewed: (_item: unknown, go: () => void) => go(),
  }),
}));
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/context/useSavedWidgets', () => ({ useSavedWidgets: vi.fn() }));
vi.mock('@/hooks/useMiniAppSession', () => ({
  useMiniAppSessionTeacher: vi.fn(),
}));
vi.mock('@/hooks/useMiniAppAssignments', () => ({
  useMiniAppAssignments: vi.fn(),
}));
vi.mock('@/hooks/useFolders', () => ({ useFolders: vi.fn() }));
vi.mock('./hooks/useMiniAppSync', () => ({ useMiniAppSync: vi.fn() }));
vi.mock('@/hooks/useTeacherBellPeriods', () => ({
  useAssignPeriodAccess: () => undefined,
}));

const activeApp: MiniAppItem = {
  id: 'app-1',
  title: 'Fractions Practice',
  html: '<html>app</html>',
  createdAt: 1,
};

const createSession = vi.fn();
const createAssignment = vi.fn();
const KEY = { questions: { q1: { correct: 'B' } } };

function setup(mode: AssignmentMode, flags: string[]) {
  vi.mocked(useDashboard).mockReturnValue({
    updateWidget: vi.fn(),
    addToast: vi.fn(),
    rosters: [],
    updateRoster: vi.fn(),
    addWidget: vi.fn(),
    selectedWidgetId: 'widget-1',
    isActiveBoardReadOnly: false,
  } as unknown as ReturnType<typeof useDashboard>);
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'teacher-1' },
    getAssignmentMode: () => mode,
    canAccessFeature: (id: string) => flags.includes(id),
  } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useSavedWidgets).mockReturnValue({
    saveSavedWidget: vi.fn(),
  } as unknown as ReturnType<typeof useSavedWidgets>);
  vi.mocked(useMiniAppSessionTeacher).mockReturnValue({
    createSession,
    sessions: [],
    sessionsLoading: false,
    subscribeToAppSessions: vi.fn(),
    unsubscribeFromAppSessions: vi.fn(),
    renameSession: vi.fn(),
    endSession: vi.fn(),
  });
  vi.mocked(useMiniAppAssignments).mockReturnValue({
    assignments: [],
    loading: false,
    error: null,
    createAssignment,
  } as unknown as ReturnType<typeof useMiniAppAssignments>);
  vi.mocked(useFolders).mockReturnValue({
    folders: [],
    moveItem: vi.fn(),
  } as unknown as ReturnType<typeof useFolders>);
  vi.mocked(useMiniAppSync).mockReturnValue({
    library: [activeApp],
    globalLibrary: [],
  });
  const viewOnly = mode === 'view-only';
  // View-only hides the toolbar Assign, so the share starts from the library card.
  const widget = {
    id: 'widget-1',
    type: 'miniApp',
    config: viewOnly ? {} : { activeApp },
  } as unknown as WidgetData;
  render(
    <div data-widget-id="widget-1">
      <MiniAppWidget widget={widget} />
    </div>
  );
  if (viewOnly)
    fireEvent.click(screen.getAllByRole('button', { name: /share link/i })[0]);
  else fireEvent.click(screen.getByTitle('Assign (copy student link)'));
  fireEvent.click(
    screen.getByRole('button', {
      name: viewOnly ? /create share link/i : /create assignment link/i,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createSession.mockResolvedValue('session-1');
  createAssignment.mockResolvedValue('assignment-1');
  loadKey.mockResolvedValue(KEY);
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(() => Promise.resolve()) },
  });
});

describe('MiniAppWidget assign — results v2 gate', () => {
  it('creates a v2 session with the key when the flag is on and submissions are on', async () => {
    setup('submissions', ['mini-app-results']);
    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(createSession.mock.calls[0][3]).toMatchObject({
      results: { attemptLimit: 1, showCorrectAnswers: true, key: KEY },
    });
    expect(loadKey).toHaveBeenCalledWith('teacher-1', 'app-1');
  });

  it('changes nothing when Mini App assignments are view-only, even with the flag on', async () => {
    setup('view-only', ['mini-app-results']);
    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(createSession.mock.calls[0][3]).not.toHaveProperty('results');
    expect(createSession.mock.calls[0][3]).toMatchObject({ mode: 'view-only' });
    expect(loadKey).not.toHaveBeenCalled();
  });

  it('changes nothing when the flag is off', async () => {
    setup('submissions', []);
    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(createSession.mock.calls[0][3]).not.toHaveProperty('results');
    expect(loadKey).not.toHaveBeenCalled();
  });
});
