import React from 'react';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DashboardView } from '../components/layout/DashboardView';
import {
  DashboardContext,
  DashboardContextValue,
} from '../context/DashboardContextValue';
import { Dashboard, WidgetData, GlobalStyle } from '../types';

// Mock child components to simplify testing
vi.mock('../components/announcements/AnnouncementOverlay', () => ({
  AnnouncementOverlay: () => null,
}));
vi.mock('../components/layout/sidebar/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('../components/layout/Dock', () => ({
  Dock: () => <div data-testid="dock" />,
}));
vi.mock('../components/widgets/WidgetRenderer', () => ({
  WidgetRenderer: ({
    widget,
    updateWidget,
  }: {
    widget: WidgetData;
    updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  }) => (
    <div
      data-testid={`widget-${widget.id}`}
      data-z={widget.z}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          updateWidget(widget.id, { minimized: true });
        }
      }}
    >
      {widget.type}
    </div>
  ),
}));
vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    isAdmin: false,
    canAccessFeature: vi.fn().mockReturnValue(true),
  }),
}));
vi.mock('../hooks/useLiveSession', () => ({
  useLiveSession: () => ({
    session: null,
    students: [],
    startSession: vi.fn(),
    updateSessionConfig: vi.fn(),
    updateSessionBackground: vi.fn(),
    endSession: vi.fn(),
    removeStudent: vi.fn(),
    toggleFreezeStudent: vi.fn(),
    toggleGlobalFreeze: vi.fn(),
  }),
}));

const mockGlobalStyle: GlobalStyle = {
  fontFamily: 'sans',
  windowTransparency: 0.8,
  windowBorderRadius: '2xl',
  dockTransparency: 0.4,
  dockBorderRadius: 'full',
  dockTextColor: '#334155',
  dockTextShadow: false,
};

const createMockDashboard = (widgets: WidgetData[]): Dashboard => ({
  id: 'dash-1',
  name: 'Test Board',
  background: 'bg-slate-900',
  widgets,
  createdAt: Date.now(),
  globalStyle: mockGlobalStyle,
});

describe('Global Escape Interaction', () => {
  const mockContextValue: Partial<DashboardContextValue> = {
    activeDashboard: null as Dashboard | null,
    dashboards: [] as Dashboard[],
    addWidget: vi.fn(),
    updateWidget: vi.fn(),
    removeWidget: vi.fn(),
    duplicateWidget: vi.fn(),
    bringToFront: vi.fn(),
    addToast: vi.fn(),
    loadDashboard: vi.fn(),
    toasts: [],
    removeToast: vi.fn(),
    loading: false,
    isSaving: false,
    visibleTools: [],
    dockItems: [],
    gradeFilter: 'all',
  };

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('blurs a focused input on Escape press', () => {
    const dashboard = createMockDashboard([]);
    render(
      <DashboardContext.Provider
        value={
          {
            ...mockContextValue,
            activeDashboard: dashboard,
          } as DashboardContextValue
        }
      >
        <DashboardView />
        <input data-testid="test-input" />
      </DashboardContext.Provider>
    );

    const input = screen.getByTestId('test-input');
    input.focus();
    expect(document.activeElement).toBe(input);

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(document.activeElement).not.toBe(input);
    expect(document.activeElement).toBe(document.body);
  });

  it('dispatches widget-escape-press for the top-most widget', () => {
    const widgets: WidgetData[] = [
      {
        id: 'w1',
        type: 'clock',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        z: 1,
        flipped: false,
        config: {},
      } as unknown as WidgetData,
      {
        id: 'w2',
        type: 'text',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        z: 10,
        flipped: false,
        config: {},
      } as unknown as WidgetData,
      {
        id: 'w3',
        type: 'dice',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        z: 5,
        flipped: false,
        config: {},
      } as unknown as WidgetData,
    ];
    const dashboard = createMockDashboard(widgets);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <DashboardContext.Provider
        value={
          {
            ...mockContextValue,
            activeDashboard: dashboard,
          } as DashboardContextValue
        }
      >
        <DashboardView />
      </DashboardContext.Provider>
    );

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    // Should target w2 (z=10)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'widget-keyboard-action',
        detail: { widgetId: 'w2', key: 'Escape', shiftKey: false },
      })
    );
  });

  it('minimizes a focused widget on Escape press', () => {
    const widgets: WidgetData[] = [
      {
        id: 'w1',
        type: 'clock',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        z: 1,
        flipped: false,
        config: {},
      } as unknown as WidgetData,
    ];
    const dashboard = createMockDashboard(widgets);
    const mockUpdateWidget = vi.fn();

    render(
      <DashboardContext.Provider
        value={
          {
            ...mockContextValue,
            activeDashboard: dashboard,
            updateWidget: mockUpdateWidget,
          } as DashboardContextValue
        }
      >
        <DashboardView />
      </DashboardContext.Provider>
    );

    const widget = screen.getByTestId('widget-w1');
    widget.focus();

    fireEvent.keyDown(widget, { key: 'Escape' });

    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', { minimized: true });
  });

  it('does not dispatch event if an input was just blurred', () => {
    const widgets: WidgetData[] = [
      {
        id: 'w1',
        type: 'clock',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        z: 1,
        flipped: false,
        config: {},
      } as unknown as WidgetData,
    ];
    const dashboard = createMockDashboard(widgets);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <DashboardContext.Provider
        value={
          {
            ...mockContextValue,
            activeDashboard: dashboard,
          } as DashboardContextValue
        }
      >
        <DashboardView />
        <input data-testid="test-input" />
      </DashboardContext.Provider>
    );

    const input = screen.getByTestId('test-input');
    input.focus();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    // Input should be blurred, but event should NOT be dispatched yet
    expect(document.activeElement).not.toBe(input);
    expect(dispatchSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'widget-escape-press' })
    );

    // Second press should dispatch
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'widget-keyboard-action',
        detail: { widgetId: 'w1', key: 'Escape', shiftKey: false },
      })
    );
  });
});
