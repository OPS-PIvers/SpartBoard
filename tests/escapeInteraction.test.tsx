import React from 'react';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DashboardView } from '@/components/layout/DashboardView';
import {
  DashboardContext,
  DashboardContextValue,
} from '@/context/DashboardContextValue';
import { Dashboard, WidgetData, GlobalStyle } from '@/types';

// Mock child components to simplify testing
vi.mock('@/components/announcements/AnnouncementOverlay', () => ({
  AnnouncementOverlay: () => <div data-testid="announcement-overlay" />,
}));
vi.mock('@/components/layout/sidebar/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('@/components/layout/Dock', () => ({
  Dock: () => <div data-testid="dock" />,
}));
vi.mock('@/components/widgets/WidgetRenderer', () => ({
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
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    isAdmin: false,
    canAccessFeature: vi.fn().mockReturnValue(true),
  }),
}));
vi.mock('@/hooks/useLiveSession', () => ({
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
vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    importSharedQuiz: vi.fn().mockResolvedValue(undefined),
    shareQuiz: vi.fn().mockResolvedValue(''),
    createQuizTemplate: vi.fn().mockResolvedValue(''),
    saveQuiz: vi.fn().mockResolvedValue({ id: 'q1', driveFileId: 'drive-1' }),
  }),
}));
vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: () => ({
    assignments: [],
    loading: false,
    error: null,
    importSharedAssignment: vi.fn().mockResolvedValue('a1'),
  }),
}));
vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: () => ({
    activities: [],
    loading: false,
    error: null,
    saveActivity: vi.fn().mockResolvedValue({ id: 'va1', driveFileId: 'd-1' }),
    deleteActivity: vi.fn().mockResolvedValue(undefined),
    attachSyncLinkage: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: () => ({
    assignments: [],
    loading: false,
    error: null,
    importSharedAssignment: vi
      .fn()
      .mockResolvedValue({ assignmentId: 'a1', activityId: 'va1' }),
  }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
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

vi.mock('@/hooks/useSharedCollection', () => ({
  useSharedCollection: () => ({
    shareCollection: vi.fn().mockResolvedValue('mock-collection-share-id'),
    shareSubstituteCollection: vi
      .fn()
      .mockResolvedValue('mock-collection-sub-share-id'),
    loadSharedCollection: vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'not-found' }),
    loadSharedCollectionBoards: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('@/components/boardsModal/BoardsModal', () => ({
  BoardsModal: () => null,
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
    gradeFilter: 'all',
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

  /**
   * Regression: the global Delete key handler in DashboardView called
   * e.preventDefault() before checking whether the active element was an
   * input/textarea/contentEditable. This silently swallowed Delete keystrokes
   * in any text field on the board (widget settings inputs, title editors, etc.),
   * because the window-level native listener fired even when the user was typing.
   *
   * Fix: added an `isTypingField` guard that returns early (without preventDefault)
   * when Delete is pressed while a form field has focus, matching the pattern
   * already used for the Escape key handler above it.
   */
  it('does not call preventDefault when Delete is pressed while a text input is focused', () => {
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
        <input data-testid="text-input" />
      </DashboardContext.Provider>
    );

    const input = screen.getByTestId('text-input');
    input.focus();
    expect(document.activeElement).toBe(input);

    // Fire Delete from the window (as the global keydown handler receives it).
    const deleteEvent = new KeyboardEvent('keydown', {
      key: 'Delete',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(deleteEvent);
    });

    // The global handler must NOT call preventDefault while an input is focused —
    // doing so blocks the browser from deleting the character the user intended.
    expect(deleteEvent.defaultPrevented).toBe(false);
  });

  it('does call preventDefault and dispatch widget-keyboard-action when Delete is pressed outside a text input', () => {
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
      </DashboardContext.Provider>
    );

    // No input focused — focus is on document.body.
    expect(document.activeElement).toBe(document.body);

    const deleteEvent = new KeyboardEvent('keydown', {
      key: 'Delete',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(deleteEvent);
    });

    // The handler should prevent default (browser may otherwise navigate back).
    expect(deleteEvent.defaultPrevented).toBe(true);

    // And it should dispatch a widget-keyboard-action for the top widget.
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'widget-keyboard-action',
        detail: expect.objectContaining({ key: 'Delete', widgetId: 'w1' }),
      })
    );
  });

  /**
   * Regression: the global Alt+ArrowLeft / Alt+ArrowRight board-navigation
   * shortcuts called e.preventDefault() before checking whether a text field
   * was focused. Alt+Arrow is the standard macOS / Linux shortcut for
   * word-by-word cursor navigation inside text inputs. When a teacher pressed
   * Alt+ArrowLeft to move the cursor back one word in a widget settings input,
   * the global handler swallowed the event and switched to the previous board
   * instead of performing text navigation.
   *
   * Fix: added an `isTypingField` guard (matching the Escape / Delete handlers)
   * that returns early — without calling preventDefault — when either
   * Alt+ArrowLeft or Alt+ArrowRight is fired while a form field has focus.
   */
  it('does not call preventDefault on Alt+ArrowLeft when a text input is focused', () => {
    const dashboard = createMockDashboard([]);
    const mockDashboards: Dashboard[] = [
      createMockDashboard([]),
      createMockDashboard([]),
    ];
    mockDashboards[0].id = 'dash-a';
    mockDashboards[1].id = 'dash-b';
    const mockLoadDashboard = vi.fn();

    render(
      <DashboardContext.Provider
        value={
          {
            ...mockContextValue,
            activeDashboard: dashboard,
            dashboards: mockDashboards,
            loadDashboard: mockLoadDashboard,
          } as DashboardContextValue
        }
      >
        <DashboardView />
        <input data-testid="nav-input" />
      </DashboardContext.Provider>
    );

    const input = screen.getByTestId('nav-input');
    input.focus();
    expect(document.activeElement).toBe(input);

    const altLeftEvent = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(altLeftEvent);
    });

    // Must NOT preventDefault (would block word-navigation in the input).
    expect(altLeftEvent.defaultPrevented).toBe(false);
    // Must NOT navigate to a different board.
    expect(mockLoadDashboard).not.toHaveBeenCalled();
  });

  it('does not call preventDefault on Alt+ArrowRight when a text input is focused', () => {
    const dashboard = createMockDashboard([]);
    const mockDashboards: Dashboard[] = [
      createMockDashboard([]),
      createMockDashboard([]),
    ];
    mockDashboards[0].id = 'dash-a';
    mockDashboards[1].id = 'dash-b';
    const mockLoadDashboard = vi.fn();

    render(
      <DashboardContext.Provider
        value={
          {
            ...mockContextValue,
            activeDashboard: dashboard,
            dashboards: mockDashboards,
            loadDashboard: mockLoadDashboard,
          } as DashboardContextValue
        }
      >
        <DashboardView />
        <input data-testid="nav-input-right" />
      </DashboardContext.Provider>
    );

    const input = screen.getByTestId('nav-input-right');
    input.focus();
    expect(document.activeElement).toBe(input);

    const altRightEvent = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(altRightEvent);
    });

    // Must NOT preventDefault (would block word-navigation in the input).
    expect(altRightEvent.defaultPrevented).toBe(false);
    // Must NOT navigate to a different board.
    expect(mockLoadDashboard).not.toHaveBeenCalled();
  });

  it('does call preventDefault and loadDashboard on Alt+ArrowLeft when no text input is focused', () => {
    const mockDashboards: Dashboard[] = [
      createMockDashboard([]),
      createMockDashboard([]),
    ];
    mockDashboards[0].id = 'dash-a';
    mockDashboards[1].id = 'dash-b';
    const mockLoadDashboard = vi.fn();

    render(
      <DashboardContext.Provider
        value={
          {
            ...mockContextValue,
            activeDashboard: mockDashboards[1],
            dashboards: mockDashboards,
            loadDashboard: mockLoadDashboard,
          } as DashboardContextValue
        }
      >
        <DashboardView />
      </DashboardContext.Provider>
    );

    // No input focused.
    expect(document.activeElement).toBe(document.body);

    const altLeftEvent = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(altLeftEvent);
    });

    // Should prevent default and navigate to the previous board.
    expect(altLeftEvent.defaultPrevented).toBe(true);
    expect(mockLoadDashboard).toHaveBeenCalledWith('dash-a');
  });

  it('does not call preventDefault on Alt+P when a textarea is focused', () => {
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
        <textarea data-testid="pin-textarea" />
      </DashboardContext.Provider>
    );

    const textarea = screen.getByTestId('pin-textarea');
    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    const altPEvent = new KeyboardEvent('keydown', {
      key: 'p',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(altPEvent);
    });

    // Must NOT preventDefault (let the browser handle the key in the textarea).
    expect(altPEvent.defaultPrevented).toBe(false);
  });
});
