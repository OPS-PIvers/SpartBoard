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
import { Z_INDEX } from '@/config/zIndex';
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

// DashboardView's global Escape/Delete handlers only act on a widget that
// actually holds focus (see resolveTargetWidgetId). Mount a stand-in .widget
// root and focus it so a test can exercise the dispatch branch.
const focusWidgetRoot = (widgetId: string): HTMLDivElement => {
  const root = document.createElement('div');
  root.className = 'widget';
  root.tabIndex = 0;
  root.dataset.widgetId = widgetId;
  document.body.appendChild(root);
  root.focus();
  return root;
};

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
// Its own suite covers the ink surface; here it would only drag in Drive/canvas I/O.
vi.mock('@/components/layout/AnnotationOverlay', () => ({
  AnnotationOverlay: () => null,
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

const mockUploadAndRegisterPdf = vi.fn();
vi.mock('@/hooks/useStorage', () => ({
  MAX_PDF_SIZE_BYTES: 50 * 1024 * 1024,
  useStorage: () => ({ uploadAndRegisterPdf: mockUploadAndRegisterPdf }),
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

  it('renders correctly', async () => {
    renderView();
    // Sidebar and Dock are code-split (React.lazy) out of DashboardView's
    // synchronous mount, so they stream in behind a Suspense boundary on the
    // next microtask — findByTestId waits for that resolution.
    expect(await screen.findByTestId('sidebar')).toBeInTheDocument();
    expect(await screen.findByTestId('dock')).toBeInTheDocument();
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

  it('unprojects the drop point through the current zoom when placing a spart-sticker', () => {
    // The widget surface renders inside translate(pan) scale(zoom) (see
    // DashboardView's "ZOOMABLE WIDGET SURFACE"), so a raw clientX/clientY
    // is a screen point, not the board-space coordinate widgets live in.
    // At zoom=1 the two coincide, which is why every other drop test in
    // this file (all at the default zoom: 1 mock) can't catch a regression
    // here — this test is the one that actually exercises the projection.
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      writable: true,
    });

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
      zoom: 2,
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

    // React's synthetic 'drop' handler doesn't reliably pick up
    // clientX/clientY from fireEvent.drop's plain event-properties object
    // under jsdom, so build the native Event directly and mutate it —
    // matching the pattern the (passing) application/sticker drop tests
    // below already use.
    const dropEvent = Object.assign(new Event('drop', { bubbles: true }), {
      clientX: 500,
      clientY: 500,
      dataTransfer,
    });
    fireEvent(dashboardRoot, dropEvent);

    // vw=1024, vh=768, zoom=2, pan={0,0}, w=h=150:
    //   wx = 512 + (500 − 512) / 2 = 506  →  x = 506 − 75 = 431
    //   wy = 384 + (500 − 384) / 2 = 442  →  y = 442 − 75 = 367
    // (Unfixed code would call addWidget with x: 425, y: 425 — the raw
    // clientX/clientY minus half the sticker size, ignoring zoom entirely.)
    expect(mockAddWidget).toHaveBeenCalledWith(
      'sticker',
      expect.objectContaining({ x: 431, y: 367 })
    );
  });

  it('unprojects the drop point through the current zoom when placing an application/sticker', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      writable: true,
    });

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
      zoom: 2,
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
    const root = document.getElementById('dashboard-root');
    if (!root) throw new Error('Root not found');

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

    // Base size 200, ratio 2 > 1 → w=200, h=100.
    // vw=1024, vh=768, zoom=2, pan={0,0}:
    //   wx = 512 + (500 − 512) / 2 = 506  →  x = 506 − 100 = 406
    //   wy = 384 + (500 − 384) / 2 = 442  →  y = 442 − 50  = 392
    // (Unfixed code would call addWidget with x: 400, y: 450.)
    expect(mockAddWidget).toHaveBeenCalledWith(
      'sticker',
      expect.objectContaining({ x: 406, y: 392, w: 200, h: 100 })
    );
  });

  it('unprojects the drop point through the current zoom when placing a dropped PDF', async () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      writable: true,
    });
    mockUploadAndRegisterPdf.mockResolvedValue({
      id: 'pdf-1',
      storageUrl: 'https://example.com/doc.pdf',
      name: 'doc.pdf',
    });

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
      zoom: 2,
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

    const { container } = renderView();
    const dashboardRoot = container.querySelector('#dashboard-root');
    if (!dashboardRoot) throw new Error('Dashboard root not found');

    const pdfFile = new File(['%PDF-1.4'], 'doc.pdf', {
      type: 'application/pdf',
    });
    const dataTransfer = { files: [pdfFile], getData: vi.fn(() => '') };
    const dropEvent = Object.assign(new Event('drop', { bubbles: true }), {
      clientX: 500,
      clientY: 500,
      dataTransfer,
    });
    fireEvent(dashboardRoot, dropEvent);

    // vw=1024, vh=768, zoom=2, pan={0,0}, w=600, h=750:
    //   wx = 512 + (500 − 512) / 2 = 506  →  x = max(0, 506 − 300) = 206
    //   wy = 384 + (500 − 384) / 2 = 442  →  y = max(0, 442 − 375) = 67
    // (Unfixed code would call addWidget with x: 200, y: 125.)
    await waitFor(() =>
      expect(mockAddWidget).toHaveBeenCalledWith(
        'pdf',
        expect.objectContaining({ x: 206, y: 67, w: 600, h: 750 })
      )
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

  // Regression: a two-finger swipe down minimized the widget under the fingers
  // (or every widget, over the background). On a touchscreen that is just an
  // ordinary two-finger scroll, so teachers saw Notes and Timers vanish
  // mid-lesson — a minimized widget renders at opacity 0. Gated off behind
  // SWIPE_MINIMIZE_ENABLED until the interaction is visible and undoable.
  describe('two-finger swipe-down no longer minimizes (SWIPE_MINIMIZE_ENABLED)', () => {
    const mockUpdateWidget = vi.fn();
    const mockMinimizeAllWidgets = vi.fn();

    const swipeDown = (target: EventTarget | null) => {
      const moveEvent = new PointerEvent('pointermove', { bubbles: true });
      Object.defineProperty(moveEvent, 'target', { value: target });
      gestureState.handlers.onDrag?.({
        first: true,
        last: false,
        swipe: [0, 0],
        direction: [0, 1],
        delta: [0, 20],
        movement: [0, 20],
        touches: 2,
        initial: [100, 100],
        event: moveEvent,
      });

      const endEvent = new PointerEvent('pointerup', { bubbles: true });
      Object.defineProperty(endEvent, 'target', { value: target });
      gestureState.handlers.onDrag?.({
        first: false,
        last: true,
        swipe: [0, 0],
        direction: [0, 1],
        delta: [0, 60],
        movement: [0, 120],
        touches: 0,
        initial: [100, 100],
        event: endEvent,
      });
    };

    const mockCtx = (maximized: boolean) => ({
      activeDashboard: {
        ...mockDashboards[1],
        widgets: [{ id: 'widget-1', type: 'clock', maximized }],
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

    beforeEach(() => {
      mockUpdateWidget.mockClear();
      mockMinimizeAllWidgets.mockClear();
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockCtx(false)
      );
    });

    it('does not minimize the widget the swipe lands on', () => {
      renderView();
      mockUpdateWidget.mockClear();

      const widget = document.createElement('div');
      widget.className = 'widget';
      widget.dataset.widgetId = 'widget-1';
      swipeDown(widget);

      expect(mockUpdateWidget).not.toHaveBeenCalled();
    });

    it('does not minimize every widget when the swipe lands on the background', () => {
      const { container } = renderView();
      mockMinimizeAllWidgets.mockClear();

      swipeDown(container.querySelector('#dashboard-root'));

      expect(mockMinimizeAllWidgets).not.toHaveBeenCalled();
    });

    it('still restores a maximized widget on swipe down', () => {
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockCtx(true)
      );
      renderView();
      mockUpdateWidget.mockClear();

      const widget = document.createElement('div');
      widget.className = 'widget';
      widget.dataset.widgetId = 'widget-1';
      swipeDown(widget);

      expect(mockUpdateWidget).toHaveBeenCalledWith('widget-1', {
        maximized: false,
      });
    });
  });

  describe('touch-origin tracking resets between gestures', () => {
    const touch = (
      el: HTMLElement,
      type: string,
      touchCount: number,
      target: HTMLElement
    ) => {
      const evt = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(evt, 'touches', {
        value: new Array(touchCount).fill({}),
      });
      Object.defineProperty(evt, 'target', { value: target });
      el.dispatchEvent(evt);
      return evt;
    };

    it('does not inherit a scrollable origin from the previous gesture', () => {
      const { container } = renderView();
      const root = container.querySelector('#dashboard-root') as HTMLElement;

      const scrollable = document.createElement('div');
      scrollable.style.overflowY = 'auto';
      Object.defineProperty(scrollable, 'scrollHeight', { value: 500 });
      Object.defineProperty(scrollable, 'clientHeight', { value: 100 });
      root.appendChild(scrollable);

      // Gesture 1 starts inside the scrollable widget — the browser scrolls it.
      touch(root, 'touchstart', 1, scrollable);
      expect(touch(root, 'touchmove', 1, scrollable).defaultPrevented).toBe(
        false
      );
      touch(root, 'touchend', 0, scrollable);

      // Gesture 2 begins with two fingers on the board itself.
      touch(root, 'touchstart', 2, root);
      expect(touch(root, 'touchmove', 2, root).defaultPrevented).toBe(true);
    });
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

    // Regression: Alt+P must fire even when CapsLock is active (e.key === 'P').
    // Previously the guard used a case-sensitive `e.key === 'p'` comparison, so
    // the shortcut was silently swallowed whenever CapsLock was on and no widget
    // held keyboard focus (the DraggableWindow path was unaffected because it
    // uses e.key.toLowerCase()).  Fix: normalize the key with .toLowerCase()
    // before comparing.
    it('dispatches Pin action with correct widgetId when Alt+P is pressed with CapsLock active (e.key === "P")', () => {
      renderView();

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      try {
        expect(document.activeElement).toBe(childButton);

        // Simulate CapsLock-active Alt+P: browsers produce key === 'P' (uppercase).
        fireEvent.keyDown(window, { key: 'P', altKey: true });
      } finally {
        window.removeEventListener('widget-keyboard-action', handler);
      }

      expect(dispatched).toHaveLength(1);
      const detail = (
        dispatched[0] as CustomEvent<{ widgetId: string; key: string }>
      ).detail;
      expect(detail.widgetId).toBe(WIDGET_ID);
      expect(detail.key).toBe('Pin');
    });
  });

  // Regression: SettingsPanel is portalled to document.body via
  // createPortal, tagged data-widget-portal="" but (until this fix) with no
  // data-widget-id — so focus landing on a non-form control inside an open
  // settings panel (a Toggle/SegmentedControl button, not an INPUT/
  // TEXTAREA/SELECT) can't be resolved back to its owning widget via
  // closest('.widget'). The fallback silently targets whatever widget is
  // topmost by z-index instead — which is a DIFFERENT widget than the one
  // whose settings panel is actually open whenever that widget isn't also
  // the top one. Escape then dispatches to the wrong widget (e.g. silently
  // minimizing an unrelated widget instead of just closing the settings
  // panel already closing via SettingsPanel's own document-level handler).
  describe('widget-keyboard-action targets the owning widget when focus is inside a settings-panel portal', () => {
    const TOP_WIDGET_ID = 'widget-topmost';
    const SETTINGS_WIDGET_ID = 'widget-settings-open';

    let portalRoot: HTMLDivElement;
    let portalButton: HTMLButtonElement;

    beforeEach(() => {
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: {
          ...mockDashboards[1],
          widgets: [
            {
              id: TOP_WIDGET_ID,
              type: 'clock',
              x: 0,
              y: 0,
              w: 200,
              h: 200,
              z: 2,
              flipped: false,
              config: {},
            },
            {
              id: SETTINGS_WIDGET_ID,
              type: 'clock',
              x: 300,
              y: 0,
              w: 200,
              h: 200,
              z: 1,
              flipped: true,
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

      // Simulate SettingsPanel's portal: appended directly to document.body
      // (outside any .widget ancestor), tagged data-widget-portal="" like
      // the real component, holding a non-form control (e.g. a Toggle) that
      // receives focus when the teacher interacts with a setting.
      portalRoot = document.createElement('div');
      portalRoot.setAttribute('data-widget-portal', '');
      portalRoot.setAttribute('data-widget-id', SETTINGS_WIDGET_ID);

      portalButton = document.createElement('button');
      portalButton.setAttribute('type', 'button');
      portalButton.textContent = 'Show seconds';
      portalRoot.appendChild(portalButton);

      document.body.appendChild(portalRoot);
      portalButton.focus();
    });

    afterEach(() => {
      if (portalRoot.parentNode) {
        portalRoot.parentNode.removeChild(portalRoot);
      }
    });

    it('dispatches Escape to the widget whose settings panel owns the focused control, not the topmost widget', () => {
      renderView();

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      expect(document.activeElement).toBe(portalButton);

      fireEvent.keyDown(window, { key: 'Escape' });

      window.removeEventListener('widget-keyboard-action', handler);

      expect(dispatched).toHaveLength(1);
      const detail = (
        dispatched[0] as CustomEvent<{ widgetId: string; key: string }>
      ).detail;
      expect(detail.widgetId).toBe(SETTINGS_WIDGET_ID);
    });

    it('dispatches Delete to the widget whose settings panel owns the focused control, not the topmost widget', () => {
      renderView();

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      fireEvent.keyDown(window, { key: 'Delete' });

      window.removeEventListener('widget-keyboard-action', handler);

      expect(dispatched).toHaveLength(1);
      const detail = (
        dispatched[0] as CustomEvent<{ widgetId: string; key: string }>
      ).detail;
      expect(detail.widgetId).toBe(SETTINGS_WIDGET_ID);
    });

    it('dispatches Pin (Alt+P) to the widget whose settings panel owns the focused control, not the topmost widget', () => {
      renderView();

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      fireEvent.keyDown(window, { key: 'p', altKey: true });

      window.removeEventListener('widget-keyboard-action', handler);

      expect(dispatched).toHaveLength(1);
      const detail = (
        dispatched[0] as CustomEvent<{ widgetId: string; key: string }>
      ).detail;
      expect(detail.widgetId).toBe(SETTINGS_WIDGET_ID);
    });
  });

  describe('widget-keyboard-action falls back to the topmost widget when focus is inside a portal with no data-widget-id', () => {
    const TOP_WIDGET_ID = 'widget-topmost';

    let portalRoot: HTMLDivElement;
    let portalButton: HTMLButtonElement;

    beforeEach(() => {
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: {
          ...mockDashboards[1],
          widgets: [
            {
              id: TOP_WIDGET_ID,
              type: 'clock',
              x: 0,
              y: 0,
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

      // Simulate a non-SettingsPanel [data-widget-portal] consumer (e.g. a
      // Drawing tool popover or TextWidget formatting toolbar) — these carry
      // the portal marker but no data-widget-id, unlike SettingsPanel.
      portalRoot = document.createElement('div');
      portalRoot.setAttribute('data-widget-portal', '');

      portalButton = document.createElement('button');
      portalButton.setAttribute('type', 'button');
      portalButton.textContent = 'Bold';
      portalRoot.appendChild(portalButton);

      document.body.appendChild(portalRoot);
      portalButton.focus();
    });

    afterEach(() => {
      if (portalRoot.parentNode) {
        portalRoot.parentNode.removeChild(portalRoot);
      }
    });

    // Regression: teachers reported the Timer and Note widgets "disappearing
    // while being used". resolveTargetWidgetId fell back to the topmost widget
    // whenever focus was nowhere near one — and bringToFront makes the topmost
    // widget the one the teacher just clicked. So a stray Escape (e.g. the
    // second of two presses, after the first blurred a Note's editor back to
    // <body>) minimized it to opacity 0, and a stray Delete opened its
    // close-confirm. Focus outside every widget must now be a no-op.
    it('REGRESSION: Escape with focus outside any widget dispatches nothing', () => {
      renderView();
      portalButton.blur();
      document.body.focus();
      expect(document.activeElement).not.toBe(portalButton);

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      fireEvent.keyDown(window, { key: 'Escape' });

      window.removeEventListener('widget-keyboard-action', handler);
      expect(dispatched).toHaveLength(0);
    });

    it('REGRESSION: Delete with focus outside any widget dispatches nothing', () => {
      renderView();
      portalButton.blur();
      document.body.focus();

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      fireEvent.keyDown(window, { key: 'Delete' });

      window.removeEventListener('widget-keyboard-action', handler);
      expect(dispatched).toHaveLength(0);
    });

    it('Alt+P with focus outside any widget still pins the topmost widget', () => {
      renderView();
      portalButton.blur();
      document.body.focus();

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      fireEvent.keyDown(window, { key: 'p', altKey: true });

      window.removeEventListener('widget-keyboard-action', handler);
      expect(dispatched).toHaveLength(1);
      const detail = (
        dispatched[0] as CustomEvent<{ widgetId: string; key: string }>
      ).detail;
      expect(detail.widgetId).toBe(TOP_WIDGET_ID);
      expect(detail.key).toBe('Pin');
    });

    it('REGRESSION: still dispatches Delete to the topmost widget instead of silently no-oping', () => {
      renderView();

      const dispatched: CustomEvent[] = [];
      const handler = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('widget-keyboard-action', handler);

      expect(document.activeElement).toBe(portalButton);

      fireEvent.keyDown(window, { key: 'Delete' });

      window.removeEventListener('widget-keyboard-action', handler);

      expect(dispatched).toHaveLength(1);
      const detail = (
        dispatched[0] as CustomEvent<{ widgetId: string; key: string }>
      ).detail;
      expect(detail.widgetId).toBe(TOP_WIDGET_ID);
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

  // Regression: the global Escape handler's widget-minimize fallback fired
  // even when a portalled `Modal` (or anything nested inside one — a
  // confirm/prompt dialog, an in-modal dropdown) was open. `Modal` and
  // `DashboardView` both register plain bubble-phase `keydown` listeners on
  // `window`; since `DashboardView`'s listener mounts once at teacher-app
  // start (always first) and `Modal`'s mounts later (whenever a modal opens),
  // same-phase-same-target listeners fire in registration order — so
  // `DashboardView`'s fallback always ran BEFORE the modal's own Escape
  // handler had a chance to run, minimizing the topmost widget on every
  // Escape press meant to dismiss (or interact with something inside) a
  // modal. Fix: `DashboardView` now bails via `useHasOpenModal()` (the
  // `Modal` component's own open-count tracker in
  // `components/common/modalStore.ts`) before touching any widget.
  describe('global Escape defers to an open Modal', () => {
    beforeEach(() => {
      // A widget must exist for the dispatch branch to have a target at all
      // (mirrors the "widget-keyboard-action dispatches..." describe above).
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: {
          ...mockDashboards[1],
          widgets: [
            {
              id: 'widget-1',
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
        minimizeAllWidgets: vi.fn(),
        restoreAllWidgets: vi.fn(),
        loadDashboard: mockLoadDashboard,
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

    it('does not dispatch a widget-keyboard-action Escape while a Modal is open', async () => {
      const { incrementOpenModalCount, decrementOpenModalCount } =
        await import('@/components/common/modalStore');
      const handler = vi.fn();
      window.addEventListener('widget-keyboard-action', handler);
      incrementOpenModalCount();
      try {
        renderView();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(handler).not.toHaveBeenCalled();
      } finally {
        decrementOpenModalCount();
        window.removeEventListener('widget-keyboard-action', handler);
      }
    });

    it('still dispatches a widget-keyboard-action Escape when no Modal is open', () => {
      const handler = vi.fn();
      window.addEventListener('widget-keyboard-action', handler);
      const root = focusWidgetRoot('widget-1');
      try {
        renderView();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(handler).toHaveBeenCalled();
      } finally {
        root.remove();
        window.removeEventListener('widget-keyboard-action', handler);
      }
    });
  });

  // Regression history (#2430): SettingsPanel.tsx's own document-level
  // Escape handler already closes an open settings panel (document fires
  // before window in the bubble phase). An earlier fix attempt called
  // stopPropagation() inside SettingsPanel to stop DashboardView's
  // window-level fallback from ALSO dispatching a redundant
  // widget-keyboard-action Escape at the same widget — but that also
  // silenced Shift+Escape (minimize all), group-build mode exit, and
  // AnnotationOverlay's own Escape handler whenever a settings panel
  // happened to be open. A second attempt skipped the dispatch here in
  // DashboardView specifically when the target widget was flipped — but
  // DashboardView can't see DraggableWindow's local `showConfirm` state, so
  // that also left an open delete-confirm dialog on a flipped widget stuck
  // (Escape blocked before it could reach handleCustomKeyboard's
  // showConfirm branch). The correct fix: DashboardView ALWAYS dispatches;
  // DraggableWindow avoids the redundant write itself via a ref set
  // synchronously by SettingsPanel's onClose (see
  // justClosedSettingsRef in DraggableWindow.tsx, and
  // "handleCustomKeyboard Escape priority" in DraggableWindow.test.tsx for
  // that side of the fix).
  describe('global Escape always dispatches widget-keyboard-action, even when a widget is flipped (settings open)', () => {
    const widgetsWithFlipped = (flipped: boolean) => [
      {
        id: 'widget-1',
        type: 'clock',
        x: 100,
        y: 100,
        w: 200,
        h: 200,
        z: 1,
        flipped,
        config: {},
      },
    ];

    const mockReturnWithWidget = (flipped: boolean, extra = {}) => ({
      activeDashboard: {
        ...mockDashboards[1],
        widgets: widgetsWithFlipped(flipped),
      },
      dashboards: mockDashboards,
      toasts: [],
      addWidget: vi.fn(),
      minimizeAllWidgets: vi.fn(),
      restoreAllWidgets: vi.fn(),
      loadDashboard: mockLoadDashboard,
      zoom: 1,
      setZoom: vi.fn(),
      removeToast: vi.fn(),
      updateWidget: vi.fn(),
      removeWidget: vi.fn(),
      duplicateWidget: vi.fn(),
      bringToFront: vi.fn(),
      addToast: vi.fn(),
      deleteAllWidgets: vi.fn(),
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
      ...extra,
    });

    it('still dispatches a widget-keyboard-action Escape when the target widget is already flipped (settings open)', () => {
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockReturnWithWidget(true)
      );
      const handler = vi.fn();
      window.addEventListener('widget-keyboard-action', handler);
      const root = focusWidgetRoot('widget-1');
      try {
        renderView();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(handler).toHaveBeenCalled();
      } finally {
        root.remove();
        window.removeEventListener('widget-keyboard-action', handler);
      }
    });

    it('still dispatches a widget-keyboard-action Escape when the target widget is not flipped', () => {
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockReturnWithWidget(false)
      );
      const handler = vi.fn();
      window.addEventListener('widget-keyboard-action', handler);
      const root = focusWidgetRoot('widget-1');
      try {
        renderView();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(handler).toHaveBeenCalled();
      } finally {
        root.remove();
        window.removeEventListener('widget-keyboard-action', handler);
      }
    });

    it('Shift+Escape still minimizes all widgets even when the top widget is flipped (settings open)', () => {
      const minimizeAllWidgets = vi.fn();
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        mockReturnWithWidget(true, { minimizeAllWidgets })
      );
      renderView();
      fireEvent.keyDown(window, { key: 'Escape', shiftKey: true });
      expect(minimizeAllWidgets).toHaveBeenCalledTimes(1);
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

  describe('annotation overlay integration', () => {
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

    const annotationCtx = (annotationActive: boolean) => {
      const undoWidgets = vi.fn();
      const redoWidgets = vi.fn();
      const undoAnnotation = vi.fn();
      const redoAnnotation = vi.fn();
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: mockDashboards[1],
        dashboards: mockDashboards,
        toasts: [],
        loadDashboard: mockLoadDashboard,
        removeToast: vi.fn(),
        addToast: vi.fn(),
        setSelectedWidgetId: vi.fn(),
        zoom: 1,
        setZoom: vi.fn(),
        annotationActive,
        undoWidgets,
        redoWidgets,
        undoAnnotation,
        redoAnnotation,
        canUndoAnnotation: true,
        canRedoAnnotation: true,
        collectionsApi: collectionsStub,
      });
      return { undoWidgets, redoWidgets, undoAnnotation, redoAnnotation };
    };

    // Regression: Ctrl+Z while the annotation toolbar was open ran the board's
    // widget undo, so a teacher correcting a stroke lost a widget instead.
    it('REGRESSION: Ctrl+Z undoes ink, not widgets, while annotating', () => {
      const { undoWidgets, undoAnnotation } = annotationCtx(true);
      renderView();
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      expect(undoAnnotation).toHaveBeenCalledTimes(1);
      expect(undoWidgets).not.toHaveBeenCalled();
    });

    it('Ctrl+Shift+Z and Ctrl+Y redo ink while annotating', () => {
      const { redoWidgets, redoAnnotation } = annotationCtx(true);
      renderView();
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
      fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
      expect(redoAnnotation).toHaveBeenCalledTimes(2);
      expect(redoWidgets).not.toHaveBeenCalled();
    });

    it('Ctrl+Z still undoes widgets when the toolbar is closed', () => {
      const { undoWidgets, undoAnnotation } = annotationCtx(false);
      renderView();
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      expect(undoWidgets).toHaveBeenCalledTimes(1);
      expect(undoAnnotation).not.toHaveBeenCalled();
    });

    // Regression: lifting the whole zoom surface over the fixed chrome put the
    // world-sized, pointer-events-auto ink canvas on top of the Dock, Sidebar
    // pill and FAB, so nothing in the chrome could be clicked all session.
    // Ink now lives in its own sibling layer and the surface stays unlayered.
    it('REGRESSION: the ink layer is a sibling of the zoom surface, not the surface itself', () => {
      annotationCtx(true);
      const { container } = renderView();
      const surface = container.querySelector<HTMLElement>(
        '#dashboard-zoom-surface'
      );
      const ink = container.querySelector<HTMLElement>('#dashboard-ink-layer');
      expect(surface).not.toBeNull();
      expect(ink).not.toBeNull();
      expect(ink?.parentElement).toBe(surface?.parentElement);
      expect(surface?.style.zIndex).toBe('');
      expect(Number(ink?.style.zIndex)).toBe(Z_INDEX.annotationSurface);
    });

    it('the ink layer carries the same camera transform as the widget surface', () => {
      annotationCtx(true);
      const { container } = renderView();
      const surface = container.querySelector<HTMLElement>(
        '#dashboard-zoom-surface'
      );
      const ink = container.querySelector<HTMLElement>('#dashboard-ink-layer');
      expect(ink?.style.transform).toBe(surface?.style.transform);
      expect(ink?.style.transformOrigin).toBe(surface?.style.transformOrigin);
      expect(surface?.style.transform).toContain('scale(');
    });

    // A maximized widget carries Z_INDEX.maximized, a bigger number than the
    // ink layer's — but it is trapped inside the zoom surface's transform
    // (its own stacking context), so the later sibling still paints above it.
    it('the ink layer paints over maximized widgets and under modals', () => {
      annotationCtx(true);
      const { container } = renderView();
      const surface = container.querySelector<HTMLElement>(
        '#dashboard-zoom-surface'
      );
      const ink = container.querySelector<HTMLElement>('#dashboard-ink-layer');
      if (!surface || !ink) throw new Error('zoom surface and ink layer');
      expect(surface.style.transform).not.toBe('');
      expect(
        surface.compareDocumentPosition(ink) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(Number(ink?.style.zIndex)).toBeLessThan(Z_INDEX.modal);
    });

    it('the ink layer never takes the pointer itself', () => {
      annotationCtx(true);
      const { container } = renderView();
      const ink = container.querySelector<HTMLElement>('#dashboard-ink-layer');
      expect(ink?.className).toContain('pointer-events-none');
    });

    it('leaves the zoom surface unlayered when not annotating', () => {
      annotationCtx(false);
      const { container } = renderView();
      const surface = container.querySelector<HTMLElement>(
        '#dashboard-zoom-surface'
      );
      expect(surface?.style.zIndex).toBe('');
    });

    // Regression: the ink layer kept annotationSurface with the toolbar closed
    // while the chrome lift did not, so a board's saved ink painted over the
    // Dock, Sidebar pill and FABs. Both now share one condition.
    it('REGRESSION: the ink layer is unlayered when the toolbar is closed', () => {
      annotationCtx(false);
      const { container } = renderView();
      const ink = container.querySelector<HTMLElement>('#dashboard-ink-layer');
      expect(ink).not.toBeNull();
      expect(ink?.style.zIndex).toBe('');
    });
  });

  describe('Help Center wiring', () => {
    const selectedTab = () =>
      screen
        .getAllByRole('tab')
        .find((el) => el.getAttribute('aria-selected') === 'true')?.id;

    it('opens Help on the Shortcuts tab for Ctrl+/', async () => {
      renderView();
      fireEvent.keyDown(window, { key: '/', ctrlKey: true });
      await waitFor(() => expect(selectedTab()).toBe('help-tab-shortcuts'));
    });

    // Regression: Help autofocuses its search box, so the typing-field guard on
    // Ctrl+/ made the shortcut one-way — it could open Help but never close it.
    it('closes Help with Ctrl+/ while the Help search box holds focus', async () => {
      renderView();
      fireEvent.keyDown(window, { key: '/', ctrlKey: true });
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('searchbox'))
      );

      fireEvent.keyDown(window, { key: '/', ctrlKey: true });
      await waitFor(() =>
        expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
      );
    });

    it('opens Help on the requested tab for the spart:open-help event', async () => {
      renderView();
      fireEvent(
        window,
        new CustomEvent('spart:open-help', {
          detail: { tab: 'guides', widgetType: 'clock' },
        })
      );
      await waitFor(() => expect(selectedTab()).toBe('help-tab-guides'));
    });
  });
});
