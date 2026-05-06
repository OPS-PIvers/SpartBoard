import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DraggableWindow } from '@/components/common/DraggableWindow';
import { WidgetData, GlobalStyle } from '@/types';
import {
  DashboardContext,
  DashboardContextValue,
} from '@/context/DashboardContextValue';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Settings: () => <span data-testid="settings-icon">Settings</span>,
    X: () => <span data-testid="close-icon">Close</span>,
    ChevronRight: () => <span data-testid="chevron-icon">Chevron</span>,
    Columns: () => <span data-testid="columns-icon" />,
    Grid2x2: () => <span data-testid="grid-icon" />,
    Sidebar: () => <span data-testid="sidebar-icon" />,
    Columns3: () => <span data-testid="columns3-icon" />,
    SquareSplitVertical: () => <span data-testid="split-icon" />,
    LayoutTemplate: () => <span data-testid="layout-template-icon" />,
    Layout: () => <span data-testid="priority-icon" />,
  };
});

// Mock screenshot hook
vi.mock('@/hooks/useScreenshot', () => ({
  useScreenshot: () => ({
    takeScreenshot: vi.fn(),
    isFlashing: false,
    isCapturing: false,
  }),
}));

describe('DraggableWindow (Tests folder)', () => {
  const mockWidget: WidgetData = {
    id: 'test-widget',
    type: 'text',
    x: 100,
    y: 100,
    w: 200,
    h: 200,
    z: 1,
    flipped: false,
    minimized: false,
    maximized: false,
    transparency: 1,
    config: { content: 'test', bgColor: 'white', fontSize: 16 },
  };

  const mockGlobalStyle = {
    fontFamily: 'sans',
    windowTransparency: 1,
    windowBorderRadius: 'md',
    dockTransparency: 0.5,
    dockBorderRadius: 'full',
    dockTextColor: '#000000',
    dockTextShadow: false,
  } as GlobalStyle;

  const mockContext = {
    updateWidget: vi.fn(),
    removeWidget: vi.fn(),
    duplicateWidget: vi.fn(),
    bringToFront: vi.fn(),
    addToast: vi.fn(),
    resetWidgetSize: vi.fn(),
    selectedWidgetId: null,
    setSelectedWidgetId: vi.fn(),
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    setPanOffset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders toolbar buttons in the correct order', () => {
    render(
      <DashboardContext.Provider
        value={
          {
            ...mockContext,
            selectedWidgetId: mockWidget.id,
          } as unknown as DashboardContextValue
        }
      >
        <DraggableWindow
          widget={mockWidget}
          settings={<div>Settings</div>}
          title="Test Widget"
          globalStyle={mockGlobalStyle}
        >
          <div>Content</div>
        </DraggableWindow>
      </DashboardContext.Provider>
    );

    // Toolbar should now be visible because selectedWidgetId matches
    // Check for icons
    const settingsIcon = screen.getByTestId('settings-icon');
    const closeIcon = screen.getByTestId('close-icon');

    expect(settingsIcon).toBeInTheDocument();
    expect(closeIcon).toBeInTheDocument();

    // Verify order: Settings -> Close
    const settingsBtn = settingsIcon.closest('button');
    const closeBtn = closeIcon.closest('button');

    // Due to refactoring into one continuous toolbar, grab all buttons within the tools menu
    const toolbarContainer = screen
      .getByTestId('settings-icon')
      .closest('[data-settings-exclude]');
    const allButtons = Array.from(
      toolbarContainer?.querySelectorAll('button') ?? []
    );

    if (!settingsBtn || !closeBtn) {
      throw new Error('Buttons not found');
    }

    expect(allButtons.indexOf(settingsBtn)).toBeLessThan(
      allButtons.indexOf(closeBtn)
    );
  });

  it('uses portal and correct z-index when maximized', () => {
    const maximizedWidget = { ...mockWidget, maximized: true };

    render(
      <DashboardContext.Provider
        value={mockContext as unknown as DashboardContextValue}
      >
        <div id="dashboard-root">
          <DraggableWindow
            widget={maximizedWidget}
            settings={<div>Settings</div>}
            title="Maximized Widget"
            globalStyle={mockGlobalStyle}
          >
            <div data-testid="maximized-content">Maximized Content</div>
          </DraggableWindow>
        </div>
      </DashboardContext.Provider>
    );

    // When maximized, it should NOT be inside #dashboard-root if it's portalled to body
    const dashboardRoot = document.getElementById('dashboard-root');
    const content = screen.getByTestId('maximized-content');

    expect(dashboardRoot).not.toContainElement(content);
    expect(document.body).toContainElement(content);

    // Check z-index (10500)
    const widgetCard = content.closest('.widget') as HTMLElement;
    expect(widgetCard.style.zIndex).toBe('10500');

    // Check dimensions
    expect(widgetCard.style.width).toBe('100vw');
    expect(widgetCard.style.height).toBe('100vh');
    expect(widgetCard.style.left).toBe('0px');
    expect(widgetCard.style.top).toBe('0px');
  });

  it('applies universal style properties to wrapper and content', () => {
    const styledWidget = {
      ...mockWidget,
      backgroundColor: 'bg-emerald-50' as const,
      fontFamily: 'comic' as const,
      baseTextSize: '2xl' as const,
    };

    render(
      <DashboardContext.Provider
        value={mockContext as unknown as DashboardContextValue}
      >
        <DraggableWindow
          widget={styledWidget}
          globalStyle={mockGlobalStyle}
          title="Test Styled Widget"
          settings={<div>Settings</div>}
        >
          <div data-testid="styled-content">Content</div>
        </DraggableWindow>
      </DashboardContext.Provider>
    );

    const content = screen.getByTestId('styled-content');

    // The surface container should have the text and font classes
    const dragSurface = content.closest(
      '[data-testid="drag-surface"]'
    ) as HTMLElement;
    expect(dragSurface.className).toContain('font-comic');
    expect(dragSurface.className).toContain('text-2xl');

    // The GlassCard root container should have the background class
    const widgetCard = content.closest('.widget') as HTMLElement;
    expect(widgetCard.className).toContain('bg-emerald-50');
  });

  describe('Pin feature', () => {
    const renderWithToolbar = (
      widgetOverrides: Partial<WidgetData> = {},
      contextOverrides: Partial<typeof mockContext> = {}
    ) => {
      const widget = { ...mockWidget, ...widgetOverrides };
      return render(
        <DashboardContext.Provider
          value={
            {
              ...mockContext,
              selectedWidgetId: widget.id,
              ...contextOverrides,
            } as unknown as DashboardContextValue
          }
        >
          <DraggableWindow
            widget={widget}
            settings={<div>Settings</div>}
            title="Test Widget"
            globalStyle={mockGlobalStyle}
          >
            <div data-testid="widget-content">Content</div>
          </DraggableWindow>
        </DashboardContext.Provider>
      );
    };

    it('renders pin button in toolbar when widget is selected', () => {
      renderWithToolbar();

      const pinButton = screen.getByLabelText(/pin position/i);
      expect(pinButton).toBeInTheDocument();
    });

    it('shows unpin label when widget is pinned', () => {
      renderWithToolbar({ isPinned: true });

      const unpinButton = screen.getByLabelText(/unpin position/i);
      expect(unpinButton).toBeInTheDocument();
    });

    it('calls updateWidget with isPinned toggle when pin button is clicked', () => {
      renderWithToolbar();

      const pinButton = screen.getByLabelText(/pin position/i);
      fireEvent.click(pinButton);

      expect(mockContext.updateWidget).toHaveBeenCalledWith('test-widget', {
        isPinned: true,
      });
    });

    it('calls updateWidget to unpin when pinned widget pin button is clicked', () => {
      renderWithToolbar({ isPinned: true });

      const unpinButton = screen.getByLabelText(/unpin position/i);
      fireEvent.click(unpinButton);

      expect(mockContext.updateWidget).toHaveBeenCalledWith('test-widget', {
        isPinned: false,
      });
    });

    it('applies active styling when pinned', () => {
      renderWithToolbar({ isPinned: true });

      const unpinButton = screen.getByLabelText(/unpin position/i);
      expect(unpinButton.className).toContain('bg-amber-500/20');
      expect(unpinButton.className).toContain('text-amber-600');
    });

    it('disables pin button when widget is admin-locked', () => {
      renderWithToolbar({ isLocked: true });

      const pinButton = screen.getByLabelText(/pin position/i);
      expect(pinButton).toBeDisabled();
    });

    it('hides resize handles when pinned', () => {
      renderWithToolbar({ isPinned: true });

      const resizeHandles = document.querySelectorAll('.resize-handle');
      expect(resizeHandles).toHaveLength(0);
    });

    it('shows resize handles when not pinned', () => {
      renderWithToolbar();

      const resizeHandles = document.querySelectorAll('.resize-handle');
      expect(resizeHandles.length).toBeGreaterThan(0);
    });

    it('disables snap layout button when pinned', () => {
      renderWithToolbar({ isPinned: true });

      const snapButton = screen.getByLabelText(/snap layout/i);
      expect(snapButton).toBeDisabled();
    });

    it('does not disable close button when pinned', () => {
      renderWithToolbar({ isPinned: true });

      const closeButton = screen.getByLabelText(/close/i);
      expect(closeButton).not.toBeDisabled();
    });

    it('toggles pin via Alt+P keyboard shortcut (widget-keyboard-action)', () => {
      renderWithToolbar();

      act(() => {
        const event = new CustomEvent('widget-keyboard-action', {
          detail: { widgetId: 'test-widget', key: 'Pin', shiftKey: false },
        });
        window.dispatchEvent(event);
      });

      expect(mockContext.updateWidget).toHaveBeenCalledWith('test-widget', {
        isPinned: true,
      });
    });

    it('does not toggle pin via Alt+P when widget is locked', () => {
      renderWithToolbar({ isLocked: true });

      act(() => {
        const event = new CustomEvent('widget-keyboard-action', {
          detail: { widgetId: 'test-widget', key: 'Pin', shiftKey: false },
        });
        window.dispatchEvent(event);
      });

      expect(mockContext.updateWidget).not.toHaveBeenCalled();
    });
  });

  describe('Pinned visual indicator', () => {
    const renderWidget = (widgetOverrides: Partial<WidgetData> = {}) => {
      const widget = { ...mockWidget, ...widgetOverrides };
      return render(
        <DashboardContext.Provider
          value={mockContext as unknown as DashboardContextValue}
        >
          <DraggableWindow
            widget={widget}
            settings={<div>Settings</div>}
            title="Test Widget"
            globalStyle={mockGlobalStyle}
          >
            <div data-testid="widget-content">Content</div>
          </DraggableWindow>
        </DashboardContext.Provider>
      );
    };

    beforeEach(() => {
      sessionStorage.clear();
    });

    it('renders the corner pin glyph when widget is pinned', () => {
      renderWidget({ isPinned: true });
      expect(screen.getByTestId('pinned-indicator')).toBeInTheDocument();
    });

    it('does not render the corner pin glyph when widget is unpinned', () => {
      renderWidget({ isPinned: false });
      expect(screen.queryByTestId('pinned-indicator')).not.toBeInTheDocument();
    });

    it('does not render the corner pin glyph when pinned widget is maximized', () => {
      renderWidget({ isPinned: true, maximized: true });
      expect(screen.queryByTestId('pinned-indicator')).not.toBeInTheDocument();
    });

    it('renders pinned blocker zones with not-allowed cursor when pinned', () => {
      renderWidget({ isPinned: true });
      const corner = screen.getByTestId('pinned-blocker-se');
      expect(corner.style.cursor).toBe('not-allowed');
    });

    it('does not render pinned blocker zones when unpinned', () => {
      renderWidget({ isPinned: false });
      expect(screen.queryByTestId('pinned-blocker-se')).not.toBeInTheDocument();
    });

    it('brightens the pin glyph on blocker hover', () => {
      renderWidget({ isPinned: true });
      const glyph = screen.getByTestId('pinned-indicator');
      const corner = screen.getByTestId('pinned-blocker-se');

      expect(glyph.style.opacity).toBe('0.4');
      fireEvent.pointerEnter(corner);
      expect(glyph.style.opacity).toBe('1');
      fireEvent.pointerLeave(corner);
      expect(glyph.style.opacity).toBe('0.4');
    });

    it('shows the tooltip on first pointerdown and not on a fresh widget within the same session', () => {
      renderWidget({ isPinned: true });
      const corner = screen.getByTestId('pinned-blocker-se');

      fireEvent.pointerDown(corner, { clientX: 100, clientY: 200 });
      expect(screen.getByTestId('pinned-tooltip')).toBeInTheDocument();
      expect(sessionStorage.getItem('spart_pinned_tip_shown')).toBe('true');

      // Mount a second pinned widget within the same session — the session
      // flag is what suppresses re-showing, not timer dismissal of the first
      // tooltip, so we don't need to advance timers here.
      const second = renderWidget({ isPinned: true });
      const secondCorner = second.getAllByTestId('pinned-blocker-se')[1];
      fireEvent.pointerDown(secondCorner, { clientX: 50, clientY: 50 });
      // Only the first tooltip remains (from the first widget); no new one.
      expect(screen.getAllByTestId('pinned-tooltip')).toHaveLength(1);
    });

    it('auto-dismisses the tooltip after the timeout', () => {
      vi.useFakeTimers();
      try {
        renderWidget({ isPinned: true });
        const corner = screen.getByTestId('pinned-blocker-se');
        fireEvent.pointerDown(corner, { clientX: 100, clientY: 200 });
        expect(screen.getByTestId('pinned-tooltip')).toBeInTheDocument();

        act(() => {
          vi.advanceTimersByTime(3500);
        });
        expect(screen.queryByTestId('pinned-tooltip')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('resets hover-brighten state when the widget is unpinned mid-hover', () => {
      const { rerender } = renderWidget({ isPinned: true });
      const corner = screen.getByTestId('pinned-blocker-se');
      const glyph = screen.getByTestId('pinned-indicator');

      // Hover, then unpin while still hovering — onPointerLeave never fires
      // because the blocker zones unmount.
      fireEvent.pointerEnter(corner);
      expect(glyph.style.opacity).toBe('1');

      rerender(
        <DashboardContext.Provider
          value={mockContext as unknown as DashboardContextValue}
        >
          <DraggableWindow
            widget={{ ...mockWidget, isPinned: false }}
            settings={<div>Settings</div>}
            title="Test Widget"
            globalStyle={mockGlobalStyle}
          >
            <div data-testid="widget-content">Content</div>
          </DraggableWindow>
        </DashboardContext.Provider>
      );
      expect(screen.queryByTestId('pinned-indicator')).not.toBeInTheDocument();

      // Re-pin — glyph should be back at 0.4, not stuck at 1.
      rerender(
        <DashboardContext.Provider
          value={mockContext as unknown as DashboardContextValue}
        >
          <DraggableWindow
            widget={{ ...mockWidget, isPinned: true }}
            settings={<div>Settings</div>}
            title="Test Widget"
            globalStyle={mockGlobalStyle}
          >
            <div data-testid="widget-content">Content</div>
          </DraggableWindow>
        </DashboardContext.Provider>
      );
      const reGlyph = screen.getByTestId('pinned-indicator');
      expect(reGlyph.style.opacity).toBe('0.4');
    });

    it('does not call updateWidget when blocker zones receive pointerdown', () => {
      renderWidget({ isPinned: true });
      const corner = screen.getByTestId('pinned-blocker-se');
      fireEvent.pointerDown(corner, { clientX: 0, clientY: 0 });
      // Pointerdown on blocker should not trigger any drag/resize state change.
      expect(mockContext.updateWidget).not.toHaveBeenCalled();
    });

    it('caps tooltip at one show per mount when sessionStorage is unavailable', () => {
      // Simulate a private-browsing-style sessionStorage that throws.
      const getItemSpy = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('sessionStorage disabled');
        });
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('sessionStorage disabled');
        });

      try {
        renderWidget({ isPinned: true });
        const corner = screen.getByTestId('pinned-blocker-se');

        fireEvent.pointerDown(corner, { clientX: 100, clientY: 200 });
        expect(screen.getByTestId('pinned-tooltip')).toBeInTheDocument();

        // Second attempt against the same mount should NOT add another tooltip.
        fireEvent.pointerDown(corner, { clientX: 50, clientY: 50 });
        expect(screen.getAllByTestId('pinned-tooltip')).toHaveLength(1);
      } finally {
        getItemSpy.mockRestore();
        setItemSpy.mockRestore();
      }
    });
  });
});
