import userEvent from '@testing-library/user-event';
import React from 'react';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
  act,
} from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
  type MockInstance,
} from 'vitest';
import { DraggableWindow } from './DraggableWindow';
import { WidgetData, GlobalStyle } from '@/types';
import {
  DashboardContext,
  DashboardContextValue,
} from '@/context/DashboardContextValue';
import {
  incrementOpenModalCount,
  decrementOpenModalCount,
  getOpenModalCount,
} from './modalStore';

// Mock dependencies
const { mockTakeScreenshot } = vi.hoisted(() => ({
  mockTakeScreenshot: vi.fn(),
}));

vi.mock('../../hooks/useScreenshot', () => ({
  useScreenshot: () => ({
    takeScreenshot: mockTakeScreenshot,
    isFlashing: false,
    isCapturing: false,
  }),
}));

vi.mock('../../hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  style?: React.CSSProperties;
}

// Helper for JSDOM missing methods
interface HTMLElementWithCapture extends HTMLDivElement {
  setPointerCapture: (id: number) => void;
  hasPointerCapture: (id: number) => boolean;
  releasePointerCapture: (id: number) => void;
}

vi.mock('./GlassCard', () => {
  const GlassCard = React.forwardRef<
    HTMLDivElement,
    GlassCardProps & { tabIndex?: number }
  >(
    (
      {
        children,
        className,
        onPointerDown,
        onClick,
        onKeyDown,
        onTouchStart,
        onTouchEnd,
        onTouchMove,
        style,
        tabIndex,
      },
      ref
    ) => (
      <div
        ref={ref}
        tabIndex={tabIndex}
        data-testid="draggable-window"
        className={className}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        style={style}
      >
        {children}
      </div>
    )
  );
  GlassCard.displayName = 'GlassCard';
  return { GlassCard };
});

vi.mock('./AnnotationCanvas', () => ({
  AnnotationCanvas: () => <div data-testid="annotation-canvas" />,
}));

const mockWidget: WidgetData = {
  id: 'test-widget',
  type: 'clock',
  x: 100,
  y: 100,
  w: 200,
  h: 200,
  z: 1,
  flipped: false,
  config: {
    format24: true,
    showSeconds: true,
  },
};

const mockGlobalStyle: GlobalStyle = {
  fontFamily: 'sans',
  windowTransparency: 0.8,
  windowBorderRadius: '2xl',
  dockTransparency: 0.4,
  dockBorderRadius: 'full',
  dockTextColor: '#334155',
  dockTextShadow: false,
};

describe('DraggableWindow', () => {
  let mockUpdateWidget: Mock<
    (id: string, updates: Partial<WidgetData>) => void
  >;
  let mockRemoveWidget: Mock<(id: string) => void>;
  let mockDuplicateWidget: Mock<(id: string) => void>;
  let mockBringToFront: Mock<(id: string) => void>;
  let mockAddToast: Mock<
    (message: string, type?: 'info' | 'success' | 'error') => void
  >;
  let mockResetWidgetSize: Mock<(id: string) => void>;
  let mockSetSelectedWidgetId: Mock<(id: string | null) => void>;
  let activeElementSpy: MockInstance;

  beforeEach(() => {
    mockUpdateWidget = vi.fn();
    mockRemoveWidget = vi.fn();
    mockDuplicateWidget = vi.fn();
    mockBringToFront = vi.fn();
    mockAddToast = vi.fn();
    mockResetWidgetSize = vi.fn();
    mockSetSelectedWidgetId = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    vi.clearAllMocks();
    // Setup default spy to return null
    activeElementSpy = vi.spyOn(document, 'activeElement', 'get');
    activeElementSpy.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Helper function to render DraggableWindow with common props
  const renderComponent = (
    widgetProps: Partial<WidgetData> = {},
    children: React.ReactNode = <div>Content</div>,
    settings: React.ReactNode = <div>Settings</div>,
    selectedWidgetId: string | null = null
  ) => {
    const widget = { ...mockWidget, ...widgetProps };
    return render(
      <DashboardContext.Provider
        value={
          {
            updateWidget: mockUpdateWidget,
            removeWidget: mockRemoveWidget,
            duplicateWidget: mockDuplicateWidget,
            bringToFront: mockBringToFront,
            addToast: mockAddToast,
            resetWidgetSize: mockResetWidgetSize,
            selectedWidgetId,
            setSelectedWidgetId: mockSetSelectedWidgetId,
            zoom: 1,
            panOffset: { x: 0, y: 0 },
          } as unknown as DashboardContextValue
        }
      >
        <DraggableWindow
          widget={widget}
          title="Test Widget"
          settings={settings}
          globalStyle={mockGlobalStyle}
        >
          {children}
        </DraggableWindow>
      </DashboardContext.Provider>
    );
  };

  it('conditionally loads settings only after flip (optimization)', async () => {
    const SettingsContent = () => (
      <div data-testid="settings-content">Settings Loaded</div>
    );

    const { rerender } = render(
      <DashboardContext.Provider
        value={
          {
            updateWidget: mockUpdateWidget,
            removeWidget: mockRemoveWidget,
            duplicateWidget: mockDuplicateWidget,
            bringToFront: mockBringToFront,
            addToast: mockAddToast,
            resetWidgetSize: mockResetWidgetSize,
            selectedWidgetId: null,
            setSelectedWidgetId: mockSetSelectedWidgetId,
            zoom: 1,
            panOffset: { x: 0, y: 0 },
          } as unknown as DashboardContextValue
        }
      >
        <DraggableWindow
          widget={mockWidget}
          title="Test Widget"
          settings={<SettingsContent />}
          globalStyle={mockGlobalStyle}
        >
          <div>Content</div>
        </DraggableWindow>
      </DashboardContext.Provider>
    );

    // Initially, settings should NOT be in the document because flipped is false
    expect(screen.queryByTestId('settings-content')).not.toBeInTheDocument();

    // Rerender with flipped = true
    const flippedWidget = { ...mockWidget, flipped: true };
    rerender(
      <DashboardContext.Provider
        value={
          {
            updateWidget: mockUpdateWidget,
            removeWidget: mockRemoveWidget,
            duplicateWidget: mockDuplicateWidget,
            bringToFront: mockBringToFront,
            addToast: mockAddToast,
            resetWidgetSize: mockResetWidgetSize,
            selectedWidgetId: null,
            setSelectedWidgetId: mockSetSelectedWidgetId,
            zoom: 1,
            panOffset: { x: 0, y: 0 },
          } as unknown as DashboardContextValue
        }
      >
        <DraggableWindow
          widget={flippedWidget}
          title="Test Widget"
          settings={<SettingsContent />}
          globalStyle={mockGlobalStyle}
        >
          <div>Content</div>
        </DraggableWindow>
      </DashboardContext.Provider>
    );

    // Now settings SHOULD be in the document
    await waitFor(() => {
      expect(screen.getByTestId('settings-content')).toBeInTheDocument();
    });
  });

  it('updates position on pointer drag (using direct DOM manipulation for standard widgets)', async () => {
    renderComponent();

    const dragSurface = screen.getByTestId(
      'drag-surface'
    ) as unknown as HTMLElementWithCapture;
    const windowEl = screen.getByTestId('draggable-window');

    dragSurface.setPointerCapture = vi.fn();
    dragSurface.hasPointerCapture = vi.fn().mockReturnValue(true);
    dragSurface.releasePointerCapture = vi.fn();

    // Start pointer at (110, 110)
    fireEvent.pointerDown(dragSurface, {
      clientX: 110,
      clientY: 110,
      pointerId: 1,
    });

    // Move pointer to (160, 160)
    fireEvent.pointerMove(window, {
      clientX: 160,
      clientY: 160,
      pointerId: 1,
    });

    // Standard widget: should NOT call updateWidget during drag
    expect(mockUpdateWidget).not.toHaveBeenCalled();

    // BUT should update DOM directly
    // New position: 100 + (160 - 110) = 150
    await waitFor(() => {
      expect(windowEl.style.left).toBe('150px');
      expect(windowEl.style.top).toBe('150px');
    });

    // Clean up (Pointer Up)
    fireEvent.pointerUp(window, { pointerId: 1 });

    // NOW updateWidget should be called with final position
    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'test-widget',
        expect.objectContaining({
          x: 150,
          y: 150,
        })
      );
    });
  });

  it('triggers real-time updates for position-aware widgets (e.g. catalyst)', async () => {
    const catalystWidget = {
      ...mockWidget,
      id: 'catalyst-1',
      type: 'catalyst' as const, // Force type
    };

    renderComponent(catalystWidget);

    const dragSurface = screen.getByTestId(
      'drag-surface'
    ) as unknown as HTMLElementWithCapture;
    dragSurface.setPointerCapture = vi.fn();
    dragSurface.hasPointerCapture = vi.fn().mockReturnValue(true);
    dragSurface.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(dragSurface, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });

    fireEvent.pointerMove(window, {
      clientX: 110,
      clientY: 110,
      pointerId: 1,
    });

    // Catalyst should trigger updateWidget immediately during drag
    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'catalyst-1',
        expect.objectContaining({ x: 110, y: 110 })
      );
    });
  });

  it('minimizes on Escape key press', () => {
    renderComponent();
    const windowEl = screen.getByTestId('draggable-window');

    fireEvent.keyDown(windowEl, { key: 'Escape' });

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'test-widget',
      expect.objectContaining({ minimized: true })
    );
  });

  it('shows confirmation on Delete key press', () => {
    renderComponent();
    const windowEl = screen.getByTestId('draggable-window');

    fireEvent.keyDown(windowEl, { key: 'Delete' });

    // Should NOT call removeWidget yet
    expect(mockRemoveWidget).not.toHaveBeenCalled();

    // Should show confirmation overlay
    expect(
      screen.getByText(/Close widget\? Data will be lost\./i)
    ).toBeInTheDocument();
  });

  it('toggles settings on Alt + S', () => {
    renderComponent();
    const windowEl = screen.getByTestId('draggable-window');

    fireEvent.keyDown(windowEl, { key: 's', altKey: true });

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
      flipped: true,
    });
  });

  it('toggles maximize on Alt + M', () => {
    renderComponent();
    const windowEl = screen.getByTestId('draggable-window');

    fireEvent.keyDown(windowEl, { key: 'm', altKey: true });

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'test-widget',
      expect.objectContaining({ maximized: true })
    );
  });

  it('resets size on Alt + R', () => {
    renderComponent();
    const windowEl = screen.getByTestId('draggable-window');

    fireEvent.keyDown(windowEl, { key: 'r', altKey: true });

    expect(mockResetWidgetSize).toHaveBeenCalledWith('test-widget');
  });

  it('settings button toggles flipped to true when closed', () => {
    // Pass test-widget as selected so toolbar shows
    renderComponent({}, <div>Content</div>, <div>Settings</div>, 'test-widget');

    // Click widget to show toolbar
    const widgetEl = screen.getByText('Content').closest('.widget');
    if (!widgetEl) throw new Error('Widget element not found');
    // fireEvent.click(widgetEl); // No longer needed to show toolbar if we pass selectedId

    // Find settings button and click it
    const settingsBtn = screen.getByTitle('Settings (Alt+S)');
    fireEvent.click(settingsBtn);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
      flipped: true,
    });
  });

  it('minimize closes settings panel', () => {
    renderComponent(
      { flipped: true },
      <div>Content</div>,
      <div>Settings</div>,
      'test-widget'
    );

    // Click widget to show toolbar, then minimize
    const widgetEl = screen.getByText('Content').closest('.widget');
    if (!widgetEl) throw new Error('Widget element not found');

    const minimizeBtn = screen.getByTitle('Minimize (Esc)');
    fireEvent.click(minimizeBtn);

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'test-widget',
      expect.objectContaining({ minimized: true, flipped: false })
    );
  });

  it('saves title and resets editing state when clicking outside after editing title', async () => {
    const user = userEvent.setup();
    const { useClickOutside } = await import('../../hooks/useClickOutside');

    // Pass test-widget as selected so toolbar shows
    renderComponent({}, <div>Content</div>, <div>Settings</div>, 'test-widget');

    // Verify title is rendered
    const titleEl = screen.getByText('Test Widget');
    expect(titleEl).toBeInTheDocument();

    // Click title to enter edit mode
    await user.click(titleEl);

    // Verify input appears
    const input = screen.getByDisplayValue('Test Widget');
    expect(input).toBeInTheDocument();

    // Change title
    fireEvent.change(input, { target: { value: 'New Saved Title' } });

    // Simulate clicking outside using the mocked hook's captured callback
    const clickOutsideCall = vi.mocked(useClickOutside).mock.calls[0];

    const clickOutsideCallback = clickOutsideCall[1] as (
      event: MouseEvent | TouchEvent
    ) => void; // the handler is the 2nd arg

    // Call it manually
    act(() => {
      clickOutsideCallback(new MouseEvent('mousedown'));
    });

    // Check if updateWidget was called with the new title
    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'test-widget',

      expect.objectContaining({ customTitle: 'New Saved Title' })
    );

    // The toolbar should close
    await waitFor(() => {
      expect(
        screen.queryByDisplayValue('New Saved Title')
      ).not.toBeInTheDocument();
    });
  });

  it('suppresses the floating toolbar while any Modal is open and restores it on close', async () => {
    // Sanity check: the global modal counter starts at 0 across tests.
    expect(getOpenModalCount()).toBe(0);

    renderComponent({}, <div>Content</div>, <div>Settings</div>, 'test-widget');

    // With the widget selected and no modal open, the toolbar should render
    // its action buttons (Settings / Minimize live only inside the toolbar).
    expect(screen.getByTitle('Settings (Alt+S)')).toBeInTheDocument();
    expect(screen.getByTitle('Minimize (Esc)')).toBeInTheDocument();

    // Simulate a portalled <Modal> mount by incrementing the shared counter.
    // DraggableWindow subscribes via useHasOpenModal / useSyncExternalStore
    // and should re-render with the toolbar hidden.
    act(() => {
      incrementOpenModalCount();
    });

    await waitFor(() => {
      expect(screen.queryByTitle('Settings (Alt+S)')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Minimize (Esc)')).not.toBeInTheDocument();
    });

    // Simulate modal unmount — toolbar should come back.
    act(() => {
      decrementOpenModalCount();
    });

    await waitFor(() => {
      expect(screen.getByTitle('Settings (Alt+S)')).toBeInTheDocument();
      expect(screen.getByTitle('Minimize (Esc)')).toBeInTheDocument();
    });

    // Leave the counter the way we found it.
    expect(getOpenModalCount()).toBe(0);
  });

  it('renders restore FAB when maximized and handles click', () => {
    renderComponent({ maximized: true });

    // The restore FAB should be visible
    const restoreFab = screen.getByLabelText('Restore');
    expect(restoreFab).toBeInTheDocument();

    // Clicking it should toggle maximized state
    fireEvent.click(restoreFab);

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'test-widget',
      expect.objectContaining({ maximized: false })
    );
  });
});
