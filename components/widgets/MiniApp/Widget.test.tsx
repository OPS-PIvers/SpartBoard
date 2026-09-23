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
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { noSubShareKey } from '@/tests/testHelpers/subShareContent';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

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
vi.mock('@/hooks/useTeacherBellPeriods', () => ({
  useAssignPeriodAccess: () => undefined,
}));
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

function mockHooks() {
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
}

describe('MiniAppWidget — runtime iframe sandbox', () => {
  beforeEach(mockHooks);

  it('never grants allow-same-origin to untrusted srcDoc app content', () => {
    render(<MiniAppWidget widget={widget} />);

    const frame = screen.getByTitle('Fractions Practice');
    const sandbox = frame.getAttribute('sandbox') ?? '';
    const tokens = sandbox.split(/\s+/).filter(Boolean);

    // allow-scripts + allow-same-origin on a srcDoc iframe would leak the parent origin to untrusted app JS.
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

// `/subs` renders a teacher's board, so a substitute must see the app the
// teacher left open and none of the authoring or launching around it.
describe('MiniAppWidget — inside a sub share', () => {
  beforeEach(mockHooks);

  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={subShareContextValue({
          shareId: 'share-1',
          version: 0,
          loadKey: noSubShareKey,
          load: (() => Promise.resolve(null)) as never,
        })}
      >
        {/* The toolbar only renders once it finds its widget's chrome. */}
        <div data-widget-id="widget-1">{children}</div>
      </SubShareContentContext.Provider>
    );
  }

  function selected() {
    vi.mocked(useDashboard).mockReturnValue({
      updateWidget: vi.fn(),
      addToast: vi.fn(),
      rosters: [],
      addWidget: vi.fn(),
      selectedWidgetId: 'widget-1',
      isActiveBoardReadOnly: true,
    } as unknown as ReturnType<typeof useDashboard>);
  }

  it('still runs the app the teacher left open', () => {
    selected();
    render(
      <InShare>
        <MiniAppWidget widget={widget} />
      </InShare>
    );

    expect(screen.getByTitle('Fractions Practice')).toBeInTheDocument();
  });

  it('offers no way back to a library', () => {
    selected();
    render(
      <InShare>
        <MiniAppWidget widget={widget} />
      </InShare>
    );

    expect(screen.queryByTitle('Back to library')).not.toBeInTheDocument();
  });

  it('offers no way to assign the app or read its assignments', () => {
    selected();
    render(
      <InShare>
        <MiniAppWidget widget={widget} />
      </InShare>
    );

    expect(
      screen.queryByTitle('Assign (copy student link)')
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle('View assignments')).not.toBeInTheDocument();
  });

  it('shows an empty state, not the substitute’s own library', () => {
    selected();
    render(
      <InShare>
        <MiniAppWidget
          widget={{ ...widget, config: {} } as unknown as WidgetData}
        />
      </InShare>
    );

    expect(screen.getByText('No mini app')).toBeInTheDocument();
    expect(screen.queryByText('Fractions Practice')).not.toBeInTheDocument();
  });

  it('opens no listener against the substitute’s own account', () => {
    selected();
    render(
      <InShare>
        <MiniAppWidget widget={widget} />
      </InShare>
    );

    expect(vi.mocked(useMiniAppSync)).toHaveBeenCalledWith(
      expect.any(Function),
      false
    );
    expect(vi.mocked(useMiniAppAssignments)).toHaveBeenCalledWith(undefined);
  });
});

describe('MiniAppWidget — on the teacher’s own board', () => {
  beforeEach(mockHooks);

  it('still offers the library and the assign flow', () => {
    vi.mocked(useDashboard).mockReturnValue({
      updateWidget: vi.fn(),
      addToast: vi.fn(),
      rosters: [],
      addWidget: vi.fn(),
      selectedWidgetId: 'widget-1',
      isActiveBoardReadOnly: false,
    } as unknown as ReturnType<typeof useDashboard>);
    render(
      <div data-widget-id="widget-1">
        <MiniAppWidget widget={widget} />
      </div>
    );

    expect(screen.getByTitle('Back to library')).toBeInTheDocument();
    expect(screen.getByTitle('Assign (copy student link)')).toBeInTheDocument();
  });
});
