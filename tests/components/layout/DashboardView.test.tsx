import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardView } from '@/components/layout/DashboardView';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useLiveSession } from '@/hooks/useLiveSession';
import { Dashboard } from '@/types';

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
    });
  });

  it('renders correctly', () => {
    render(<DashboardView />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('dock')).toBeInTheDocument();
  });

  it('does NOT toggle minimize on Alt + M (now handled by widgets)', () => {
    render(<DashboardView />);

    // Fire Alt+M
    fireEvent.keyDown(window, { key: 'm', altKey: true });

    // Let's verify loadDashboard is NOT called (indirect check)
    expect(mockLoadDashboard).not.toHaveBeenCalled();
  });

  it('navigates to previous board on Alt + Left', () => {
    render(<DashboardView />);
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    expect(mockLoadDashboard).toHaveBeenCalledWith('db-1');
  });

  it('navigates to next board on Alt + Right', () => {
    render(<DashboardView />);
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
    });

    render(<DashboardView />);
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
    });

    render(<DashboardView />);
    fireEvent.keyDown(window, { key: 'Delete', shiftKey: true });
    await waitFor(() => expect(mockDeleteAll).toHaveBeenCalled());
  });

  it('wraps around when navigating at boundaries', () => {
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
    });

    const { unmount } = render(<DashboardView />);
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
    });

    render(<DashboardView />);
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    expect(mockLoadDashboard).toHaveBeenCalledWith('db-1');
  });

  it('calls addWidget with correct config when spart-sticker with url is dropped', () => {
    const { container } = render(<DashboardView />);

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    const { container } = render(<DashboardView />);

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    render(<DashboardView />);
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          url: 'https://example.com/sticker.png',
          rotation: 0,
        }),
      })
    );
  });

  it('calls addWidget with fallback ratio when application/sticker is dropped with missing/null ratio', () => {
    render(<DashboardView />);
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          url: 'https://example.com/sticker2.png',
          rotation: 0,
        }),
      })
    );
  });

  it('calls addWidget with fallback ratio when application/sticker is dropped with invalid ratio (e.g. 0)', () => {
    render(<DashboardView />);
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          url: 'https://example.com/sticker3.png',
          rotation: 0,
        }),
      })
    );
  });
});
