import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardView } from '@/components/layout/DashboardView';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { useLiveSession } from '@/hooks/useLiveSession';
import { Dashboard } from '@/types';

// The canvas hot path (BoardCanvas's group overlay, DraggableWindow) reads
// the hot slice via useDashboardCanvasSelector, which without
// DashboardProvider's store falls back to the legacy DashboardContext — so
// every render mounts under a bare provider, the same alternate-host
// pattern as SubsDashboardProvider/StudentContexts.
const legacyCtxValue = {
  activeDashboard: null,
  selectedWidgetId: null,
  selectedWidgetIds: [],
  groupBuildMode: false,
  zoom: 1,
  isActiveBoardReadOnly: false,
} as unknown as DashboardContextValue;

const renderView = () =>
  render(
    <DashboardContext.Provider value={legacyCtxValue}>
      <DashboardView />
    </DashboardContext.Provider>
  );

type DashboardGestureHandlers = {
  onDrag?: (state: {
    first: boolean;
    last: boolean;
    swipe: [number, number?];
    direction: [number, number?];
    delta: [number, number];
    movement: [number, number];
    touches: number;
    initial: [number, number?];
    event: Event;
  }) => void;
};

const { mockUseGesture, gestureState } = vi.hoisted(() => ({
  mockUseGesture: vi.fn(),
  gestureState: { handlers: {} as DashboardGestureHandlers },
}));

// Mock context
vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useLiveSession', () => ({
  useLiveSession: vi.fn(),
}));

vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: vi.fn().mockReturnValue({
    importSharedQuiz: vi.fn().mockResolvedValue(undefined),
    shareQuiz: vi.fn().mockResolvedValue(''),
    createQuizTemplate: vi.fn().mockResolvedValue(''),
    saveQuiz: vi.fn().mockResolvedValue({ id: 'q1', driveFileId: 'drive-1' }),
  }),
}));

vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: vi.fn().mockReturnValue({
    assignments: [],
    loading: false,
    error: null,
    importSharedAssignment: vi.fn().mockResolvedValue('a1'),
  }),
}));

vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: vi.fn().mockReturnValue({
    activities: [],
    loading: false,
    error: null,
    saveActivity: vi.fn().mockResolvedValue({ id: 'va1', driveFileId: 'd-1' }),
    deleteActivity: vi.fn().mockResolvedValue(undefined),
    attachSyncLinkage: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: vi.fn().mockReturnValue({
    assignments: [],
    loading: false,
    error: null,
    importSharedAssignment: vi
      .fn()
      .mockResolvedValue({ assignmentId: 'a1', activityId: 'va1' }),
  }),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: vi.fn().mockReturnValue({
    plcs: [],
    loading: false,
    createPlc: vi.fn(),
    renamePlc: vi.fn(),
    removeMember: vi.fn(),
    leavePlc: vi.fn(),
    deletePlc: vi.fn(),
    setPlcSharedSheetUrl: vi.fn(),
    clearPlcSharedSheetUrl: vi.fn(),
    getPlcSharedSheetUrl: vi.fn(),
  }),
}));

vi.mock('@use-gesture/react', () => ({
  useGesture: mockUseGesture,
}));

// Mock child components
vi.mock('@/components/layout/sidebar/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));
vi.mock('@/components/layout/Dock', () => ({
  Dock: () => <div data-testid="dock">Dock</div>,
}));
vi.mock('@/components/announcements/AnnouncementOverlay', () => ({
  AnnouncementOverlay: () => <div data-testid="announcement-overlay" />,
}));
vi.mock('@/components/widgets/WidgetRenderer', () => ({
  WidgetRenderer: () => <div data-testid="widget">Widget</div>,
}));

vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => ({
    collections: [],
    loading: false,
    error: null,
    createCollection: vi.fn(),
    renameCollection: vi.fn(),
    moveCollection: vi.fn(),
    deleteCollection: vi.fn(),
    reorderSiblings: vi.fn(),
    setCollectionMetadata: vi.fn(),
    setCollectionDefaultBoard: vi.fn(),
  }),
}));

vi.mock('@/components/boardsModal/BoardsModal', () => ({
  BoardsModal: () => null,
}));

describe('DashboardView Gestures & Navigation', () => {
  const mockLoadDashboard = vi.fn();
  const mockAddWidget = vi.fn();
  const mockDashboards: Dashboard[] = [
    {
      id: 'db-1',
      name: 'Board 1',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 1000,
    },
    {
      id: 'db-2',
      name: 'Board 2',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 2000,
    },
    {
      id: 'db-3',
      name: 'Board 3',
      background: 'bg-slate-900',
      widgets: [],
      createdAt: 3000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    gestureState.handlers = {};
    mockUseGesture.mockImplementation((handlers: DashboardGestureHandlers) => {
      gestureState.handlers = handlers;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { uid: 'teacher-1' },
      canAccessFeature: vi.fn().mockReturnValue(true),
    });
    (useLiveSession as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: null,
      students: [],
      startSession: vi.fn(),
      updateSessionConfig: vi.fn(),
      updateSessionBackground: vi.fn(),
      endSession: vi.fn(),
      removeStudent: vi.fn(),
      toggleFreezeStudent: vi.fn(),
      toggleGlobalFreeze: vi.fn(),
    });
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: mockDashboards[1], // Start at middle board
      dashboards: mockDashboards,
      toasts: [],
      addWidget: mockAddWidget,
      loadDashboard: mockLoadDashboard,
      removeToast: vi.fn(),
      updateWidget: vi.fn(),
      removeWidget: vi.fn(),
      duplicateWidget: vi.fn(),
      bringToFront: vi.fn(),
      addToast: vi.fn(),
      minimizeAllWidgets: vi.fn(),
      restoreAllWidgets: vi.fn(),
      deleteAllWidgets: vi.fn(),
      zoom: 1,
      setZoom: vi.fn(),
      collectionsApi: {
        collections: [],
        loading: false,
        error: null,
        createCollection: vi.fn(),
        renameCollection: vi.fn(),
        moveCollection: vi.fn(),
        deleteCollection: vi.fn(),
        reorderSiblings: vi.fn(),
        setCollectionMetadata: vi.fn(),
        setCollectionDefaultBoard: vi.fn(),
      },
    });
  });

  it('renders correctly', () => {
    renderView();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('dock')).toBeInTheDocument();
  });

  it('does NOT toggle minimize on Alt + M (now handled by widgets)', () => {
    renderView();

    // Fire Alt+M
    fireEvent.keyDown(window, { key: 'm', altKey: true });

    // Let's verify loadDashboard is NOT called (indirect check)
    expect(mockLoadDashboard).not.toHaveBeenCalled();
  });

  it('navigates to previous board on Alt + Left', () => {
    renderView();
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    expect(mockLoadDashboard).toHaveBeenCalledWith('db-1');
  });

  it('navigates to next board on Alt + Right', () => {
    renderView();
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    expect(mockLoadDashboard).toHaveBeenCalledWith('db-3');
  });

  it('triggers minimize all on Shift + Escape', () => {
    const mockMinimizeAll = vi.fn();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: mockDashboards[1],
      dashboards: mockDashboards,
      minimizeAllWidgets: mockMinimizeAll,
      restoreAllWidgets: vi.fn(),
      loadDashboard: mockLoadDashboard,
      toasts: [],
      zoom: 1,
      setZoom: vi.fn(),
      collectionsApi: {
        collections: [],
        loading: false,
        error: null,
        createCollection: vi.fn(),
        renameCollection: vi.fn(),
        moveCollection: vi.fn(),
        deleteCollection: vi.fn(),
        reorderSiblings: vi.fn(),
        setCollectionMetadata: vi.fn(),
        setCollectionDefaultBoard: vi.fn(),
      },
    });

    renderView();
    fireEvent.keyDown(window, { key: 'Escape', shiftKey: true });
    expect(mockMinimizeAll).toHaveBeenCalled();
  });

  it('triggers delete all on Shift + Delete', async () => {
    const mockDeleteAll = vi.fn();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: mockDashboards[1],
      dashboards: mockDashboards,
      deleteAllWidgets: mockDeleteAll,
      loadDashboard: mockLoadDashboard,
      toasts: [],
      zoom: 1,
      setZoom: vi.fn(),
      collectionsApi: {
        collections: [],
        loading: false,
        error: null,
        createCollection: vi.fn(),
        renameCollection: vi.fn(),
        moveCollection: vi.fn(),
        deleteCollection: vi.fn(),
        reorderSiblings: vi.fn(),
        setCollectionMetadata: vi.fn(),
        setCollectionDefaultBoard: vi.fn(),
      },
    });

    renderView();
    fireEvent.keyDown(window, { key: 'Delete', shiftKey: true });
    await waitFor(() => expect(mockDeleteAll).toHaveBeenCalled());
  });

  it('wraps around when navigating at boundaries', () => {
    const collectionsStub = {
      collections: [],
      loading: false,
      error: null,
      createCollection: vi.fn(),
      renameCollection: vi.fn(),
      moveCollection: vi.fn(),
      deleteCollection: vi.fn(),
      reorderSiblings: vi.fn(),
      setCollectionMetadata: vi.fn(),
      setCollectionDefaultBoard: vi.fn(),
    };
    // Case 1: First board, navigate left -> should go to last board
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: mockDashboards[0],
      dashboards: mockDashboards,
      toasts: [],
      addWidget: mockAddWidget,
      loadDashboard: mockLoadDashboard,
      removeToast: vi.fn(),
      minimizeAllWidgets: vi.fn(),
      restoreAllWidgets: vi.fn(),
      deleteAllWidgets: vi.fn(),
      zoom: 1,
      setZoom: vi.fn(),
      collectionsApi: collectionsStub,
    });

    const { unmount } = renderView();
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    expect(mockLoadDashboard).toHaveBeenCalledWith('db-3');
    unmount();

    // Case 2: Last board, navigate right -> should go to first board
    mockLoadDashboard.mockClear();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: mockDashboards[2],
      dashboards: mockDashboards,
      toasts: [],
      addWidget: mockAddWidget,
      loadDashboard: mockLoadDashboard,
      removeToast: vi.fn(),
      minimizeAllWidgets: vi.fn(),
      restoreAllWidgets: vi.fn(),
      deleteAllWidgets: vi.fn(),
      zoom: 1,
      setZoom: vi.fn(),
      collectionsApi: collectionsStub,
    });

    renderView();
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    expect(mockLoadDashboard).toHaveBeenCalledWith('db-1');
  });

  it('calls addWidget with correct config when spart-sticker with url is dropped', () => {
    const { container } = renderView();

    const dashboardRoot = container.querySelector('#dashboard-root');
    if (!dashboardRoot) throw new Error('Dashboard root not found');

    const spartStickerData = JSON.stringify({
      icon: 'Share2',
      color: 'green',
      label: 'SHARE',
      url: 'https://example.com/custom-sticker.png',
    });

    const dataTransfer = {
      getData: vi.fn((type: string) => {
        if (type === 'application/spart-sticker') return spartStickerData;
        return '';
      }),
    };

    fireEvent.drop(dashboardRoot, {
      clientX: 500,
      clientY: 500,
      dataTransfer,
    });

    expect(mockAddWidget).toHaveBeenCalledWith(
      'sticker',
      expect.objectContaining({
        config: expect.objectContaining({
          icon: undefined,
          url: 'https://example.com/custom-sticker.png',
          color: 'green',
          label: 'SHARE',
        }),
      })
    );
  });

  it('calls addWidget with icon when spart-sticker WITHOUT url is dropped', () => {
    const { container } = renderView();

    const dashboardRoot = container.querySelector('#dashboard-root');
    if (!dashboardRoot) throw new Error('Dashboard root not found');

    const spartStickerData = JSON.stringify({
      icon: 'Share2',
      color: 'green',
      label: 'SHARE',
    });

    const dataTransfer = {
      getData: vi.fn((type: string) => {
        if (type === 'application/spart-sticker') return spartStickerData;
        return '';
      }),
    };

    fireEvent.drop(dashboardRoot, {
      clientX: 500,
      clientY: 500,
      dataTransfer,
    });

    expect(mockAddWidget).toHaveBeenCalledWith(
      'sticker',
      expect.objectContaining({
        config: expect.objectContaining({
          icon: 'Share2',
          url: undefined,
          color: 'green',
          label: 'SHARE',
        }),
      })
    );
  });

  it('calls addWidget with correct config when application/sticker is dropped with valid ratio', () => {
    renderView();
    const root = document.getElementById('dashboard-root');
    if (!root) throw new Error('Root not found');
    expect(root).toBeInTheDocument();

    const dataTransfer = {
      types: ['application/sticker'],
      getData: vi.fn((type) => {
        if (type === 'application/sticker')
          return JSON.stringify({
            url: 'https://example.com/sticker.png',
            ratio: 2,
          });
        return '';
      }),
    };

    const dropEvent = Object.assign(new Event('drop', { bubbles: true }), {
      clientX: 500,
      clientY: 500,
      dataTransfer,
    });
    fireEvent(root, dropEvent);

    // Base size is 200. Ratio = 2 > 1, so h = 200 / 2 = 100, w = 200.
    expect(mockAddWidget).toHaveBeenCalledWith(
      'sticker',
      expect.objectContaining({
        x: 500 - 200 / 2, // 400
        y: 500 - 100 / 2, // 450
        w: 200,
        h: 100,
        config: expect.objectContaining({
          url: 'https://example.com/sticker.png',
          rotation: 0,
        }),
      })
    );
  });

  it('calls addWidget with fallback ratio when application/sticker is dropped with missing/null ratio', () => {
    renderView();
    const root = document.getElementById('dashboard-root');
    if (!root) throw new Error('Root not found');

    const dataTransfer = {
      types: ['application/sticker'],
      getData: vi.fn((type) => {
        if (type === 'application/sticker')
          return JSON.stringify({
            url: 'https://example.com/sticker2.png',
            ratio: null,
          });
        return '';
      }),
    };

    const dropEvent = Object.assign(new Event('drop', { bubbles: true }), {
      clientX: 500,
      clientY: 500,
      dataTransfer,
    });
    fireEvent(root, dropEvent);

    // Base size is 200. Fallback ratio = 1, so w = 200, h = 200.
    expect(mockAddWidget).toHaveBeenCalledWith(
      'sticker',
      expect.objectContaining({
        x: 500 - 200 / 2, // 400
        y: 500 - 200 / 2, // 400
        w: 200,
        h: 200,
        config: expect.objectContaining({
          url: 'https://example.com/sticker2.png',
          rotation: 0,
        }),
      })
    );
  });

  it('calls addWidget with fallback ratio when application/sticker is dropped with invalid ratio (e.g. 0)', () => {
    renderView();
    const root = document.getElementById('dashboard-root');
    if (!root) throw new Error('Root not found');

    const dataTransfer = {
      types: ['application/sticker'],
      getData: vi.fn((type) => {
        if (type === 'application/sticker')
          return JSON.stringify({
            url: 'https://example.com/sticker3.png',
            ratio: 0,
          });
        return '';
      }),
    };

    const dropEvent = Object.assign(new Event('drop', { bubbles: true }), {
      clientX: 500,
      clientY: 500,
      dataTransfer,
    });
    fireEvent(root, dropEvent);

    // Base size is 200. Invalid ratio defaults to 1, so w = 200, h = 200.
    expect(mockAddWidget).toHaveBeenCalledWith(
      'sticker',
      expect.objectContaining({
        x: 500 - 200 / 2, // 400
        y: 500 - 200 / 2, // 400
        w: 200,
        h: 200,
        config: expect.objectContaining({
          url: 'https://example.com/sticker3.png',
          rotation: 0,
        }),
      })
    );
  });

  it('ignores swipe gestures that occur while a widget drag is active', () => {
    const mockUpdateWidget = vi.fn();
    const mockMinimizeAllWidgets = vi.fn();

    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: {
        ...mockDashboards[1],
        widgets: [
          {
            id: 'widget-1',
            type: 'clock',
            maximized: false,
          },
        ],
      },
      dashboards: mockDashboards,
      toasts: [],
      addWidget: mockAddWidget,
      loadDashboard: mockLoadDashboard,
      removeToast: vi.fn(),
      updateWidget: mockUpdateWidget,
      removeWidget: vi.fn(),
      duplicateWidget: vi.fn(),
      bringToFront: vi.fn(),
      addToast: vi.fn(),
      minimizeAllWidgets: mockMinimizeAllWidgets,
      restoreAllWidgets: vi.fn(),
      deleteAllWidgets: vi.fn(),
      setSelectedWidgetId: vi.fn(),
      updateDashboardSettings: vi.fn(),
      updateDashboard: vi.fn(),
      zoom: 1,
      setZoom: vi.fn(),
      collectionsApi: {
        collections: [],
        loading: false,
        error: null,
        createCollection: vi.fn(),
        renameCollection: vi.fn(),
        moveCollection: vi.fn(),
        deleteCollection: vi.fn(),
        reorderSiblings: vi.fn(),
        setCollectionMetadata: vi.fn(),
        setCollectionDefaultBoard: vi.fn(),
      },
    });

    renderView();
    mockUpdateWidget.mockClear();
    mockMinimizeAllWidgets.mockClear();
    mockLoadDashboard.mockClear();
    const widget = document.createElement('div');
    widget.className = 'widget';
    widget.dataset.widgetId = 'widget-1';

    document.body.classList.add('is-dragging-widget');
    gestureState.handlers.onDrag?.({
      first: true,
      last: false,
      swipe: [0, 0],
      direction: [0, 1],
      delta: [0, 20],
      movement: [0, 20],
      touches: 2,
      initial: [100, 100],
      event: new PointerEvent('pointermove', { bubbles: true }),
    });
    document.body.classList.remove('is-dragging-widget');

    const gestureEndEvent = new PointerEvent('pointerup', { bubbles: true });
    Object.defineProperty(gestureEndEvent, 'target', {
      value: widget,
    });

    gestureState.handlers.onDrag?.({
      first: false,
      last: true,
      swipe: [0, 0],
      direction: [0, 1],
      delta: [0, 60],
      movement: [0, 120],
      touches: 0,
      initial: [100, 100],
      event: gestureEndEvent,
    });

    expect(mockUpdateWidget).not.toHaveBeenCalled();
    expect(mockMinimizeAllWidgets).not.toHaveBeenCalled();
    expect(mockLoadDashboard).not.toHaveBeenCalled();
  });

  // Regression: when focus is on a child element inside a widget (e.g., a
  // button rendered inside a widget's content area), the global Escape/Delete/
  // Alt+P keyboard handlers in DashboardView must still resolve the containing
  // widget's id and dispatch a widget-keyboard-action event with the correct
  // widgetId.
  //
  // Bug: the original code called
  //   (document.activeElement as HTMLElement).getAttribute('data-widget-id')
  // after confirming the element is inside a .widget ancestor.  data-widget-id
  // lives on the .widget root (GlassCard), NOT on every child button/input, so
  // getAttribute always returned null for focused child elements, silently
  // dropping the keyboard action.
  //
  // Fix: call getAttribute on closest('.widget') — the ancestor that actually
  // carries the attribute.
  describe('widget-keyboard-action dispatches correct widgetId when a child element is focused', () => {
    const WIDGET_ID = 'widget-focused-child';

    let widgetRoot: HTMLDivElement;
    let childButton: HTMLButtonElement;

    beforeEach(() => {
      // Set up an active dashboard with one widget so the handler has a target.
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: {
          ...mockDashboards[1],
          widgets: [
            {
              id: WIDGET_ID,
              type: 'clock',
              x: 100,
              y: 100,
              w: 200,
              h: 200,
              z: 1,
              flipped: false,
              config: {},
            },
          ],
        },
        dashboards: mockDashboards,
        toasts: [],
        addWidget: mockAddWidget,
        loadDashboard: mockLoadDashboard,
        removeToast: vi.fn(),
        updateWidget: vi.fn(),
        removeWidget: vi.fn(),
        duplicateWidget: vi.fn(),
        bringToFront: vi.fn(),
        addToast: vi.fn(),
        minimizeAllWidgets: vi.fn(),
        restoreAllWidgets: vi.fn(),
        deleteAllWidgets: vi.fn(),
        setSelectedWidgetId: vi.fn(),
        updateDashboardSettings: vi.fn(),
        zoom: 1,
        setZoom: vi.fn(),
        collectionsApi: {
          collections: [],
          loading: false,
          error: null,
          createCollection: vi.fn(),
          renameCollection: vi.fn(),
          moveCollection: vi.fn(),
          deleteCollection: vi.fn(),
          reorderSiblings: vi.fn(),
          setCollectionMetadata: vi.fn(),
          setCollectionDefaultBoard: vi.fn(),
        },
      });

      // Simulate a widget root with class "widget" and data-widget-id, plus a
      // child button that is what actually gets keyboard focus (e.g., a
      // settings button inside the widget content area).
      widgetRoot = document.createElement('div');
      widgetRoot.className = 'widget';
      widgetRoot.setAttribute('data-widget-id', WIDGET_ID);
      widgetRoot.setAttribute('tabindex', '0');

      childButton = document.createElement('button');
      childButton.setAttribute('type', 'button');
      childButton.textContent = 'Widget Action';
      widgetRoot.appendChild(childButton);

      document.body.appendChild(widgetRoot);

      // Focus the child button — document.activeElement is now the button,
      // NOT the widget root that carries data-widget-id.
      childButton.focus();
    });

    afterEach(() => {
      if (widgetRoot.parentNode) {
        widgetRoot.parentNode.removeChild(widgetRoot);
      }
    });

    it('dispatches Escape action with correct widgetId when child is focused', () => {
      renderView();

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      // Sanity: the focused element is the child button, not the widget root.
      expect(document.activeElement).toBe(childButton);
      // And the child button itself does NOT carry data-widget-id.
      expect(childButton.getAttribute('data-widget-id')).toBeNull();

      fireEvent.keyDown(window, { key: 'Escape' });

      window.removeEventListener('widget-keyboard-action', handler);

      // Must have dispatched exactly one event with the correct widgetId.
      expect(dispatched).toHaveLength(1);
      const detail0 = (
        dispatched[0] as CustomEvent<{ widgetId: string; key: string }>
      ).detail;
      expect(detail0.widgetId).toBe(WIDGET_ID);
      expect(detail0.key).toBe('Escape');
    });

    it('dispatches Delete action with correct widgetId when child is focused', () => {
      renderView();

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      expect(document.activeElement).toBe(childButton);
      expect(childButton.getAttribute('data-widget-id')).toBeNull();

      fireEvent.keyDown(window, { key: 'Delete' });

      window.removeEventListener('widget-keyboard-action', handler);

      expect(dispatched).toHaveLength(1);
      const detail1 = (
        dispatched[0] as CustomEvent<{ widgetId: string; key: string }>
      ).detail;
      expect(detail1.widgetId).toBe(WIDGET_ID);
      expect(detail1.key).toBe('Delete');
    });

    it('dispatches Pin action with correct widgetId when child is focused (Alt+P)', () => {
      renderView();

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      expect(document.activeElement).toBe(childButton);
      expect(childButton.getAttribute('data-widget-id')).toBeNull();

      fireEvent.keyDown(window, { key: 'p', altKey: true });

      window.removeEventListener('widget-keyboard-action', handler);

      expect(dispatched).toHaveLength(1);
      const detail2 = (
        dispatched[0] as CustomEvent<{ widgetId: string; key: string }>
      ).detail;
      expect(detail2.widgetId).toBe(WIDGET_ID);
      expect(detail2.key).toBe('Pin');
    });
  });

  // Toast accessibility: the ToastContainer must expose live-region roles so
  // screen readers announce toasts (assertive for errors, polite otherwise) and
  // provide an explicit Dismiss control so SR/keyboard users can close a toast
  // before it auto-dismisses.
  describe('ToastContainer accessibility', () => {
    const collectionsStub = {
      collections: [],
      loading: false,
      error: null,
      createCollection: vi.fn(),
      renameCollection: vi.fn(),
      moveCollection: vi.fn(),
      deleteCollection: vi.fn(),
      reorderSiblings: vi.fn(),
      setCollectionMetadata: vi.fn(),
      setCollectionDefaultBoard: vi.fn(),
    };

    it('sets role="status" + aria-live="polite" on normal toasts and role="alert" on error toasts', () => {
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: mockDashboards[1],
        dashboards: mockDashboards,
        toasts: [
          { id: 'toast-info', message: 'Saved', type: 'info' },
          { id: 'toast-error', message: 'Save failed', type: 'error' },
        ],
        loadDashboard: mockLoadDashboard,
        removeToast: vi.fn(),
        zoom: 1,
        setZoom: vi.fn(),
        collectionsApi: collectionsStub,
      });

      renderView();

      // Normal toast announces politely via its own role="status".
      const statusToast = screen.getByText('Saved').closest('[role="status"]');
      expect(statusToast).not.toBeNull();
      expect(statusToast).toHaveAttribute('aria-live', 'polite');

      // Error toast announces assertively via role="alert".
      const alertToast = screen
        .getByText('Save failed')
        .closest('[role="alert"]');
      expect(alertToast).not.toBeNull();
    });

    it('closes a toast when its Dismiss control is activated', () => {
      const mockRemoveToast = vi.fn();
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: mockDashboards[1],
        dashboards: mockDashboards,
        toasts: [{ id: 'toast-1', message: 'Heads up', type: 'info' }],
        loadDashboard: mockLoadDashboard,
        removeToast: mockRemoveToast,
        zoom: 1,
        setZoom: vi.fn(),
        collectionsApi: collectionsStub,
      });

      renderView();

      const dismiss = screen.getByRole('button', { name: 'Dismiss' });
      fireEvent.click(dismiss);

      expect(mockRemoveToast).toHaveBeenCalledTimes(1);
      expect(mockRemoveToast).toHaveBeenCalledWith('toast-1');
    });
  });

  // Regression: groupBuildMode Escape handler lacked a typing-field guard.
  //
  // Bug: when groupBuildMode was active, the first `if (e.key === 'Escape' &&
  // groupBuildMode)` branch ran unconditionally — it called e.preventDefault()
  // and setGroupBuildMode(false) even when the user had an INPUT/TEXTAREA/SELECT
  // focused and was pressing Escape intending only to dismiss/blur that field.
  // The "blur the input" path in the second `if (e.key === 'Escape')` block was
  // never reached because the first branch returned early, so the input kept
  // focus and the user was left with group-build mode silently cancelled.
  //
  // Fix: add a typing-field guard at the top of the groupBuildMode branch so
  // that Escape inside a form field blurs the field and leaves groupBuildMode
  // active, consistent with all other keyboard shortcut branches.
  describe('groupBuildMode Escape does not exit group-build when a typing field is focused', () => {
    const collectionsStub = {
      collections: [],
      loading: false,
      error: null,
      createCollection: vi.fn(),
      renameCollection: vi.fn(),
      moveCollection: vi.fn(),
      deleteCollection: vi.fn(),
      reorderSiblings: vi.fn(),
      setCollectionMetadata: vi.fn(),
      setCollectionDefaultBoard: vi.fn(),
    };

    let inputEl: HTMLInputElement;
    const mockSetGroupBuildMode = vi.fn();
    const mockSetSelectedWidgetIds = vi.fn();

    beforeEach(() => {
      mockSetGroupBuildMode.mockClear();
      mockSetSelectedWidgetIds.mockClear();

      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: mockDashboards[1],
        dashboards: mockDashboards,
        toasts: [],
        addWidget: mockAddWidget,
        loadDashboard: mockLoadDashboard,
        removeToast: vi.fn(),
        updateWidget: vi.fn(),
        removeWidget: vi.fn(),
        duplicateWidget: vi.fn(),
        bringToFront: vi.fn(),
        addToast: vi.fn(),
        minimizeAllWidgets: vi.fn(),
        restoreAllWidgets: vi.fn(),
        deleteAllWidgets: vi.fn(),
        setSelectedWidgetId: vi.fn(),
        zoom: 1,
        setZoom: vi.fn(),
        // group-build state
        groupBuildMode: true,
        setGroupBuildMode: mockSetGroupBuildMode,
        selectedWidgetIds: [],
        setSelectedWidgetIds: mockSetSelectedWidgetIds,
        collectionsApi: collectionsStub,
      });

      // Create and focus an input element so document.activeElement is an INPUT.
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      document.body.appendChild(inputEl);
      inputEl.focus();
    });

    afterEach(() => {
      if (inputEl.parentNode) {
        inputEl.parentNode.removeChild(inputEl);
      }
    });

    it('should NOT call setGroupBuildMode when Escape is pressed inside an input', () => {
      // renderView (not bare render): groupBuildMode=true mounts BoardCanvas's
      // GroupBoundingBoxLayer, whose canvas-store selector needs the legacy
      // DashboardContext provider the helper supplies.
      renderView();

      // Sanity: the focused element is our input.
      expect(document.activeElement).toBe(inputEl);

      fireEvent.keyDown(window, { key: 'Escape' });

      // The typing-field guard must prevent group-build exit.
      expect(mockSetGroupBuildMode).not.toHaveBeenCalled();
      expect(mockSetSelectedWidgetIds).not.toHaveBeenCalled();
    });

    it('should NOT call setGroupBuildMode when Escape is pressed inside a textarea', () => {
      // Replace the input with a textarea.
      if (inputEl.parentNode) inputEl.parentNode.removeChild(inputEl);
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      renderView();

      expect(document.activeElement).toBe(textarea);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(mockSetGroupBuildMode).not.toHaveBeenCalled();

      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    });

    it('DOES call setGroupBuildMode when Escape is pressed with no typing field focused', () => {
      // Move focus away from the input (to body or a non-typing element).
      inputEl.blur();

      renderView();

      // document.activeElement is now body (not a typing field).
      expect(
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (document.activeElement as HTMLElement)?.tagName || ''
        )
      ).toBe(false);

      fireEvent.keyDown(window, { key: 'Escape' });

      // Without a focused typing field, group-build mode should exit.
      expect(mockSetGroupBuildMode).toHaveBeenCalledWith(false);
      expect(mockSetSelectedWidgetIds).toHaveBeenCalledWith([]);
    });
  });

  // Regression: Ctrl+/ (Open Cheat Sheet) lacked a typing-field guard.
  //
  // Bug: the `if ((e.ctrlKey || e.metaKey) && e.key === '/')` branch in the
  // global keydown handler unconditionally called e.preventDefault() and
  // toggled the Cheat Sheet even when the user had focus inside an INPUT,
  // TEXTAREA, SELECT, or contentEditable element.  Ctrl+/ is a common
  // "comment/uncomment" shortcut in code editors and rich-text widgets, so
  // typing it inside any text field was silently hijacked: the browser's
  // default action was suppressed and the Cheat Sheet opened instead.
  //
  // Fix: add the same isTypingField guard that every other shortcut branch
  // (Escape, Delete/Backspace, Alt+P, Alt+Left/Right) already carries.
  describe('Ctrl+/ does not open Cheat Sheet when a typing field is focused', () => {
    const collectionsStub = {
      collections: [],
      loading: false,
      error: null,
      createCollection: vi.fn(),
      renameCollection: vi.fn(),
      moveCollection: vi.fn(),
      deleteCollection: vi.fn(),
      reorderSiblings: vi.fn(),
      setCollectionMetadata: vi.fn(),
      setCollectionDefaultBoard: vi.fn(),
    };

    let focusedEl: HTMLElement;

    afterEach(() => {
      if (focusedEl?.parentNode) focusedEl.parentNode.removeChild(focusedEl);
    });

    const setupTypingField = (el: HTMLElement) => {
      focusedEl = el;
      document.body.appendChild(el);
      el.focus();
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: mockDashboards[1],
        dashboards: mockDashboards,
        toasts: [],
        addWidget: mockAddWidget,
        loadDashboard: mockLoadDashboard,
        removeToast: vi.fn(),
        updateWidget: vi.fn(),
        removeWidget: vi.fn(),
        duplicateWidget: vi.fn(),
        bringToFront: vi.fn(),
        addToast: vi.fn(),
        minimizeAllWidgets: vi.fn(),
        restoreAllWidgets: vi.fn(),
        deleteAllWidgets: vi.fn(),
        setSelectedWidgetId: vi.fn(),
        updateDashboardSettings: vi.fn(),
        zoom: 1,
        setZoom: vi.fn(),
        collectionsApi: collectionsStub,
      });
    };

    it('does NOT dispatch spart:cheatsheet-opened when Ctrl+/ is pressed inside an INPUT', () => {
      const input = document.createElement('input');
      input.type = 'text';
      setupTypingField(input);
      renderView();

      expect(document.activeElement).toBe(input);

      const openedEvents: Event[] = [];
      const spy = (e: Event) => openedEvents.push(e);
      window.addEventListener('spart:cheatsheet-opened', spy);

      fireEvent.keyDown(window, { key: '/', ctrlKey: true });

      window.removeEventListener('spart:cheatsheet-opened', spy);

      // The typing-field guard must prevent the Cheat Sheet from opening —
      // no spart:cheatsheet-opened event should have been dispatched.
      expect(openedEvents).toHaveLength(0);
    });

    it('does NOT dispatch spart:cheatsheet-opened when Ctrl+/ is pressed inside a TEXTAREA', () => {
      const textarea = document.createElement('textarea');
      setupTypingField(textarea);
      renderView();

      expect(document.activeElement).toBe(textarea);

      const openedEvents: Event[] = [];
      const spy = (e: Event) => openedEvents.push(e);
      window.addEventListener('spart:cheatsheet-opened', spy);

      fireEvent.keyDown(window, { key: '/', ctrlKey: true });

      window.removeEventListener('spart:cheatsheet-opened', spy);
      expect(openedEvents).toHaveLength(0);
    });

    it('does NOT dispatch spart:cheatsheet-opened when Ctrl+/ is pressed inside a SELECT', () => {
      const select = document.createElement('select');
      setupTypingField(select);
      renderView();

      expect(document.activeElement).toBe(select);

      const openedEvents: Event[] = [];
      const spy = (e: Event) => openedEvents.push(e);
      window.addEventListener('spart:cheatsheet-opened', spy);

      fireEvent.keyDown(window, { key: '/', ctrlKey: true });

      window.removeEventListener('spart:cheatsheet-opened', spy);
      expect(openedEvents).toHaveLength(0);
    });

    it('DOES dispatch spart:cheatsheet-opened when Ctrl+/ is pressed with no typing field focused', async () => {
      // Make sure no typing field holds focus — body is the default.
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: mockDashboards[1],
        dashboards: mockDashboards,
        toasts: [],
        addWidget: mockAddWidget,
        loadDashboard: mockLoadDashboard,
        removeToast: vi.fn(),
        updateWidget: vi.fn(),
        removeWidget: vi.fn(),
        duplicateWidget: vi.fn(),
        bringToFront: vi.fn(),
        addToast: vi.fn(),
        minimizeAllWidgets: vi.fn(),
        restoreAllWidgets: vi.fn(),
        deleteAllWidgets: vi.fn(),
        setSelectedWidgetId: vi.fn(),
        updateDashboardSettings: vi.fn(),
        zoom: 1,
        setZoom: vi.fn(),
        collectionsApi: collectionsStub,
      });

      renderView();

      // Ensure no typing field is active.
      expect(
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (document.activeElement as HTMLElement)?.tagName || ''
        )
      ).toBe(false);
      expect(
        (document.activeElement as HTMLElement)?.isContentEditable
      ).toBeFalsy();

      const openedEvents: Event[] = [];
      const spy = (e: Event) => openedEvents.push(e);
      window.addEventListener('spart:cheatsheet-opened', spy);

      fireEvent.keyDown(window, { key: '/', ctrlKey: true });

      // Allow useEffects (the CheatSheetModal's open-notification effect) to flush.
      await waitFor(() => expect(openedEvents).toHaveLength(1));

      window.removeEventListener('spart:cheatsheet-opened', spy);
    });
  });
});
