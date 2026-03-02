import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardView } from '../../../components/layout/DashboardView';
import { useDashboard } from '../../../context/useDashboard';
import { useAuth } from '../../../context/useAuth';
import { useLiveSession } from '../../../hooks/useLiveSession';
import { Dashboard } from '../../../types';

// Mock context
vi.mock('../../../context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('../../../context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../hooks/useLiveSession', () => ({
  useLiveSession: vi.fn(),
}));

// Mock child components
vi.mock('../../../components/announcements/AnnouncementOverlay', () => ({
  AnnouncementOverlay: () => null,
}));
vi.mock('../../../components/layout/sidebar/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));
vi.mock('../../../components/layout/Dock', () => ({
  Dock: () => <div data-testid="dock">Dock</div>,
}));
vi.mock('../../../components/widgets/WidgetRenderer', () => ({
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
      deleteAllWidgets: vi.fn(),
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
      loadDashboard: mockLoadDashboard,
      toasts: [],
    });

    render(<DashboardView />);
    fireEvent.keyDown(window, { key: 'Escape', shiftKey: true });
    expect(mockMinimizeAll).toHaveBeenCalled();
  });

  it('triggers delete all on Shift + Delete', () => {
    const mockDeleteAll = vi.fn();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: mockDashboards[1],
      dashboards: mockDashboards,
      deleteAllWidgets: mockDeleteAll,
      loadDashboard: mockLoadDashboard,
      toasts: [],
    });

    render(<DashboardView />);
    fireEvent.keyDown(window, { key: 'Delete', shiftKey: true });
    expect(mockDeleteAll).toHaveBeenCalled();
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
      deleteAllWidgets: vi.fn(),
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
      deleteAllWidgets: vi.fn(),
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
});
