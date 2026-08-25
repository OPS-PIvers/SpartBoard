import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiniAppWidget } from './Widget';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useSavedWidgets } from '@/context/useSavedWidgets';
import { useMiniAppSessionTeacher } from '@/hooks/useMiniAppSession';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';
import { useFolders } from '@/hooks/useFolders';
import { useMiniAppSync } from './hooks/useMiniAppSync';
import { WidgetData, MiniAppItem } from '@/types';

vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
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

const activeApp: MiniAppItem = {
  id: 'app-1',
  title: 'Fractions Practice',
  html: '<html><body>Untrusted app content</body></html>',
  createdAt: 1712000000000,
};

const widget: WidgetData = {
  id: 'widget-1',
  type: 'miniApp',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  config: { activeApp },
} as unknown as WidgetData;

describe('MiniAppWidget — runtime iframe sandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDashboard).mockReturnValue({
      updateWidget: vi.fn(),
      addToast: vi.fn(),
      rosters: [],
      addWidget: vi.fn(),
      selectedWidgetId: null,
      isActiveBoardReadOnly: false,
    } as unknown as ReturnType<typeof useDashboard>);
    vi.mocked(useAuth).mockReturnValue({
      user: { uid: 'teacher-1' },
      getAssignmentMode: () => 'submissions',
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(useSavedWidgets).mockReturnValue({
      saveSavedWidget: vi.fn(),
    } as unknown as ReturnType<typeof useSavedWidgets>);
    vi.mocked(useMiniAppSessionTeacher).mockReturnValue({
      createSession: vi.fn(),
      sessions: [],
      sessionsLoading: false,
      subscribeToAppSessions: vi.fn(),
      unsubscribeFromAppSessions: vi.fn(),
      renameSession: vi.fn(),
      endSession: vi.fn(),
    } as unknown as ReturnType<typeof useMiniAppSessionTeacher>);
    vi.mocked(useMiniAppAssignments).mockReturnValue({
      assignments: [],
      loading: false,
      error: null,
      createAssignment: vi.fn(),
      renameAssignment: vi.fn(),
      endAssignment: vi.fn(),
      reactivateAssignment: vi.fn(),
      deleteAssignment: vi.fn(),
    } as unknown as ReturnType<typeof useMiniAppAssignments>);
    vi.mocked(useFolders).mockReturnValue({
      folders: [],
      moveItem: vi.fn(),
    } as unknown as ReturnType<typeof useFolders>);
    vi.mocked(useMiniAppSync).mockReturnValue({
      library: [],
      globalLibrary: [],
    } as unknown as ReturnType<typeof useMiniAppSync>);
  });

  it('never grants allow-same-origin to untrusted srcDoc app content', () => {
    render(<MiniAppWidget widget={widget} />);

    const frame = screen.getByTitle('Fractions Practice');
    const sandbox = frame.getAttribute('sandbox') ?? '';
    const tokens = sandbox.split(/\s+/).filter(Boolean);

    // allow-scripts + allow-same-origin together on a srcDoc iframe lets the
    // untrusted app's JS inherit the PARENT document's origin (DOM/localStorage
    // access to the teacher's live SpartBoard session) instead of a sandboxed
    // opaque origin. The SPART_MINIAPP_INIT/RESULT protocol is postMessage-only
    // and needs no same-origin grant (see MiniAppStudentApp.tsx / CustomWidget).
    expect(tokens).not.toContain('allow-same-origin');
    // Sanity: the app still runs — scripts/forms/popups/modals stay granted.
    expect(tokens).toEqual(
      expect.arrayContaining([
        'allow-scripts',
        'allow-forms',
        'allow-popups',
        'allow-modals',
      ])
    );
  });
});
