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

// Spy wrapper for SettingsPanel — records every props object passed to the
// component so regression tests can inspect the shouldRenderSettings value
// that arrives on the FIRST mount when the widget transitions to flipped=true.
// The actual SettingsPanel uses createPortal and heavy hooks; the spy renders
// a lightweight stand-in that exposes just enough to check the key prop.
const { settingsPanelRenderProps } = vi.hoisted(() => ({
  settingsPanelRenderProps: [] as Array<{ shouldRenderSettings: boolean }>,
}));

vi.mock('./SettingsPanel', () => ({
  SettingsPanel: (props: {
    shouldRenderSettings: boolean;
    settings: React.ReactNode;
  }) => {
    settingsPanelRenderProps.push({
      shouldRenderSettings: props.shouldRenderSettings,
    });
    return props.shouldRenderSettings && props.settings ? (
      <div data-testid="settings-spy-content">{props.settings}</div>
    ) : (
      <div data-testid="settings-spy-placeholder" className="italic">
        Standard settings available.
      </div>
    );
  },
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
    // Reset SettingsPanel render spy before each test
    settingsPanelRenderProps.length = 0;
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

  it('SettingsPanel receives shouldRenderSettings=true on its very first render when widget flips open', () => {
    // Regression test for: "shouldRenderSettings useEffect latch causes one-frame
    // placeholder flash on slow hardware/projectors"
    //
    // Root cause (dev-paul): DraggableWindow used a useEffect to latch
    // shouldRenderSettings=true when widget.flipped became true. In a real browser
    // (not JSDOM) useEffect fires AFTER paint, so SettingsPanel's first commit
    // received shouldRenderSettings=false and briefly rendered the placeholder
    // "Standard settings available." before the effect re-rendered with true.
    //
    // Fix: Replace the useEffect with React's "adjust state while rendering"
    // pattern — the inline `if (widget.flipped && !shouldRenderSettings)`
    // assignment fires in the same synchronous render pass, so SettingsPanel
    // always mounts with shouldRenderSettings=true.
    //
    // Why RTL alone cannot catch this: act() flushes effects synchronously in
    // JSDOM, making both the useEffect and inline approaches produce identical
    // DOM state after rerender(). Instead, this test uses the settingsPanelRenderProps
    // spy (module-level vi.mock above) to inspect what shouldRenderSettings value
    // was passed to SettingsPanel on its VERY FIRST render call — before any
    // effects could fire. With the useEffect approach the first call gets false;
    // with the inline approach it gets true.

    const SettingsContent = () => (
      <div data-testid="settings-content-sync">Settings Loaded</div>
    );

    const contextValue = {
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
    } as unknown as DashboardContextValue;

    const { rerender } = render(
      <DashboardContext.Provider value={contextValue}>
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

    // Before flip: SettingsPanel not mounted, spy array is empty
    expect(settingsPanelRenderProps).toHaveLength(0);

    // Flip the widget — SettingsPanel mounts for the first time
    rerender(
      <DashboardContext.Provider value={contextValue}>
        <DraggableWindow
          widget={{ ...mockWidget, flipped: true }}
          title="Test Widget"
          settings={<SettingsContent />}
          globalStyle={mockGlobalStyle}
        >
          <div>Content</div>
        </DraggableWindow>
      </DashboardContext.Provider>
    );

    // At least one render must have occurred
    expect(settingsPanelRenderProps.length).toBeGreaterThan(0);

    // KEY ASSERTION: The very first render call must have shouldRenderSettings=true.
    // With the buggy useEffect approach: first render gets false (the effect
    // hasn't fired yet), then a subsequent render gets true.
    // With the fixed inline approach: first render already gets true.
    expect(settingsPanelRenderProps[0].shouldRenderSettings).toBe(true);
  });

  it('exposes a high-contrast focus-visible ring for keyboard users', () => {
    // WCAG 2.4.7: the focus indicator must stay visible (>=3:1) on white, dark,
    // and image backgrounds. The previous ring-blue-400/50 dropped below 3:1
    // over dark widgets/backgrounds. A full-opacity ring plus a white offset
    // keeps the indicator legible on every surface.
    renderComponent();
    const windowEl = screen.getByTestId('draggable-window');
    expect(windowEl.className).toContain('focus-visible:ring-2');
    expect(windowEl.className).toContain('focus-visible:ring-blue-500');
    expect(windowEl.className).toContain('focus-visible:ring-offset-2');
    expect(windowEl.className).toContain('focus-visible:ring-offset-white');
    // Guard against regressing to the low-contrast translucent ring.
    expect(windowEl.className).not.toContain('ring-blue-400/50');
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

    // Move pointer to (160, 160). Listeners are attached to the capture target
    // (the drag surface), not window — see DraggableWindow handleDragStart.
    fireEvent.pointerMove(dragSurface, {
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
    fireEvent.pointerUp(dragSurface, { pointerId: 1 });

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

    fireEvent.pointerMove(dragSurface, {
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

  // Regression: if the host component unmounts mid-drag (Firestore-driven
  // delete, dashboard switch, admin force-remove), the global
  // `is-dragging-widget` body class — used to suppress hover/cursor styles
  // app-wide — must not remain stuck on the body. Gesture listeners live on
  // the capture target, so onPointerUp can't run after the node detaches;
  // the unmount cleanup effect is the only guarantee.
  it('clears global drag-state body class when host unmounts mid-gesture', () => {
    const { unmount } = renderComponent();

    const dragSurface = screen.getByTestId(
      'drag-surface'
    ) as unknown as HTMLElementWithCapture;
    dragSurface.setPointerCapture = vi.fn();
    dragSurface.hasPointerCapture = vi.fn().mockReturnValue(true);
    dragSurface.releasePointerCapture = vi.fn();

    document.body.classList.remove('is-dragging-widget');

    fireEvent.pointerDown(dragSurface, {
      clientX: 110,
      clientY: 110,
      pointerId: 1,
    });
    expect(document.body.classList.contains('is-dragging-widget')).toBe(true);

    // Unmount before pointerup arrives.
    unmount();

    expect(document.body.classList.contains('is-dragging-widget')).toBe(false);
  });

  // Regression: pointer capture can be silently dropped mid-gesture (browser-
  // specific — DOM mutations, focus changes, overlapping hit surfaces from a
  // sibling widget of the same type). When that happens, the user's pointerup
  // doesn't reach our listener on the capture target. The next pointermove
  // with buttons=0 must synthesize the teardown so the widget doesn't track
  // the cursor every time it re-enters the drag-surface.
  it('synthesizes drag teardown when a mouse pointermove arrives with buttons=0', async () => {
    renderComponent();

    const dragSurface = screen.getByTestId(
      'drag-surface'
    ) as unknown as HTMLElementWithCapture;
    const windowEl = screen.getByTestId('draggable-window');

    dragSurface.setPointerCapture = vi.fn();
    dragSurface.hasPointerCapture = vi.fn().mockReturnValue(true);
    dragSurface.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(dragSurface, {
      clientX: 110,
      clientY: 110,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
    });
    expect(document.body.classList.contains('is-dragging-widget')).toBe(true);

    // Normal drag step: pointer moves with button held.
    fireEvent.pointerMove(dragSurface, {
      clientX: 160,
      clientY: 160,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
    });
    await waitFor(() => {
      expect(windowEl.style.left).toBe('150px');
    });

    // Pointer button released somewhere we don't see (capture lost), then a
    // pointermove with buttons=0 arrives on the drag-surface as the cursor
    // re-enters. Must trigger teardown, not further movement. JSDOM doesn't
    // reliably propagate `buttons` through PointerEventInit, so patch it onto
    // the dispatched event explicitly.
    const dropEvent = new PointerEvent('pointermove', {
      clientX: 300,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse',
    });
    Object.defineProperty(dropEvent, 'buttons', { value: 0 });
    Object.defineProperty(dropEvent, 'pointerType', { value: 'mouse' });
    fireEvent(dragSurface, dropEvent);

    await waitFor(() => {
      expect(document.body.classList.contains('is-dragging-widget')).toBe(
        false
      );
    });

    // Subsequent pointermove must NOT move the widget — listener should be
    // removed by the teardown path.
    fireEvent.pointerMove(dragSurface, {
      clientX: 500,
      clientY: 500,
      pointerId: 1,
    });
    // Position should still reflect the last real drag step, not (500, 500).
    expect(windowEl.style.left).toBe('150px');
    expect(windowEl.style.top).toBe('150px');
  });

  // Regression: a `lostpointercapture` event mid-gesture must run the same
  // teardown as pointerup so the gesture doesn't get stuck in "follow the
  // cursor" mode after the browser drops capture.
  it('runs drag teardown when lostpointercapture fires mid-gesture', async () => {
    renderComponent();

    const dragSurface = screen.getByTestId(
      'drag-surface'
    ) as unknown as HTMLElementWithCapture;
    const windowEl = screen.getByTestId('draggable-window');

    dragSurface.setPointerCapture = vi.fn();
    dragSurface.hasPointerCapture = vi.fn().mockReturnValue(false);
    dragSurface.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(dragSurface, {
      clientX: 110,
      clientY: 110,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
    });
    fireEvent.pointerMove(dragSurface, {
      clientX: 160,
      clientY: 160,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
    });
    await waitFor(() => {
      expect(windowEl.style.left).toBe('150px');
    });

    // Browser drops pointer capture mid-gesture.
    fireEvent(
      dragSurface,
      new PointerEvent('lostpointercapture', { pointerId: 1 })
    );

    await waitFor(() => {
      expect(document.body.classList.contains('is-dragging-widget')).toBe(
        false
      );
    });

    // Subsequent pointermove with the same pointerId must not move the widget.
    fireEvent.pointerMove(dragSurface, {
      clientX: 500,
      clientY: 500,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
    });
    expect(windowEl.style.left).toBe('150px');
    expect(windowEl.style.top).toBe('150px');
  });

  // Resize gesture parallels the drag gesture's listener wiring. A future
  // refactor that breaks only the resize teardown wouldn't be caught by the
  // drag-only regression tests above. Cover the buttons=0 path on a resize
  // handle to lock both code paths down.
  it('synthesizes resize teardown when a mouse pointermove arrives with buttons=0', async () => {
    renderComponent();

    const seHandleEl = document.querySelector('.cursor-se-resize');
    expect(seHandleEl).not.toBeNull();
    if (!seHandleEl) return;
    const seHandle = seHandleEl as unknown as HTMLElementWithCapture;
    const windowEl = screen.getByTestId('draggable-window');

    seHandle.setPointerCapture = vi.fn();
    seHandle.hasPointerCapture = vi.fn().mockReturnValue(true);
    seHandle.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(seHandle, {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
    });
    expect(document.body.classList.contains('is-dragging-widget')).toBe(true);

    fireEvent.pointerMove(seHandle, {
      clientX: 250,
      clientY: 250,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 1,
    });
    await waitFor(() => {
      // 200 (initial w from mockWidget) + 50 = 250
      expect(windowEl.style.width).toBe('250px');
    });

    // Missed pointerup — capture lost, next move arrives with buttons=0.
    const dropEvent = new PointerEvent('pointermove', {
      clientX: 400,
      clientY: 400,
      pointerId: 1,
      pointerType: 'mouse',
    });
    Object.defineProperty(dropEvent, 'buttons', { value: 0 });
    Object.defineProperty(dropEvent, 'pointerType', { value: 'mouse' });
    fireEvent(seHandle, dropEvent);

    await waitFor(() => {
      expect(document.body.classList.contains('is-dragging-widget')).toBe(
        false
      );
    });

    // Subsequent pointermove must NOT resize the widget further.
    fireEvent.pointerMove(seHandle, {
      clientX: 600,
      clientY: 600,
      pointerId: 1,
    });
    expect(windowEl.style.width).toBe('250px');
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

  it('does not minimize widget when Escape is pressed while a <select> is the event target', () => {
    // Regression: isInput guard only checked INPUT/TEXTAREA, not SELECT.
    // Pressing Escape to dismiss a dropdown would fall through the guard and
    // minimize the widget instead of just closing the native dropdown.
    renderComponent(
      {},
      <select data-testid="widget-select">
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </select>
    );

    const selectEl = screen.getByTestId('widget-select');

    // Fire Escape with the SELECT element as the target (simulates keyboard
    // event originating from the focused <select>).
    fireEvent.keyDown(selectEl, { key: 'Escape', bubbles: true });

    // The widget must NOT be minimized — Escape on a select should only
    // dismiss the dropdown, not affect widget state.
    expect(mockUpdateWidget).not.toHaveBeenCalledWith(
      'test-widget',
      expect.objectContaining({ minimized: true })
    );
  });

  it('does not trigger delete confirmation when Delete is pressed while a <select> is the event target', () => {
    // Regression: isInput guard only checked INPUT/TEXTAREA, not SELECT.
    // Pressing Delete while a select is focused would skip the typing-field
    // guard and show the widget-delete confirmation dialog unexpectedly.
    renderComponent(
      {},
      <select data-testid="widget-select">
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </select>
    );

    const selectEl = screen.getByTestId('widget-select');

    fireEvent.keyDown(selectEl, { key: 'Delete', bubbles: true });

    // No confirmation dialog must appear and no remove must be dispatched.
    expect(mockRemoveWidget).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/Close widget\? Data will be lost\./i)
    ).not.toBeInTheDocument();
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

  // Regression: Alt+P in DraggableWindow's handleKeyDown toggled the pin
  // state but did NOT call e.stopPropagation(). The keydown event therefore
  // continued to bubble up to DashboardView's global window listener, which
  // dispatched a second widget-keyboard-action Pin event. DraggableWindow's
  // widget-keyboard-action listener then fired and called updateWidget a
  // second time with the same stale isPinned value — producing an extra
  // Firestore write and a double invocation of handleCloseTools().
  //
  // Root cause: the 'p' case in the Alt shortcuts switch was missing
  // e.stopPropagation() (the only case that overlaps with DashboardView's
  // global Alt+P handler).
  //
  // Fix: add e.stopPropagation() to the 'p' case so the event is consumed
  // entirely by DraggableWindow and never reaches the global handler.
  it('Alt+P pins the widget and stops event propagation to prevent double-action with DashboardView', () => {
    renderComponent();
    const windowEl = screen.getByTestId('draggable-window');

    // Add a window-level keydown spy BEFORE firing the event. If the bug is
    // present (no stopPropagation), the event will bubble to window and the
    // spy will be called. After the fix, stopPropagation prevents bubbling
    // and the spy must remain uncalled.
    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      fireEvent.keyDown(windowEl, { key: 'p', altKey: true });
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }

    // The direct updateWidget call from handleKeyDown must have fired.
    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget', {
      isPinned: true,
    });

    // stopPropagation must have been called so the event does NOT reach
    // DashboardView's window handler (which would otherwise dispatch a
    // second widget-keyboard-action Pin event → second updateWidget call).
    expect(windowKeydownSpy).not.toHaveBeenCalled();
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

  describe('Resize handle priority zone', () => {
    // Widget at x=100, y=100, w=200, h=200 → right=300, bottom=300.
    // RESIZE_PRIORITY_INSET = 16, so the SE priority zone is
    // clientX >= 284 AND clientY >= 284.
    const WIDGET_RECT = {
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      right: 300,
      bottom: 300,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    } as DOMRect;

    type ElementsFromPoint = (x: number, y: number) => Element[];
    type DocWithElementsFromPoint = Document & {
      elementsFromPoint?: ElementsFromPoint;
    };

    const getSeHandle = (): HTMLElementWithCapture => {
      const el = document.querySelector('.cursor-se-resize');
      if (!(el instanceof HTMLElement)) {
        throw new Error('SE resize handle not found');
      }
      const handle = el as HTMLElementWithCapture;
      handle.setPointerCapture = vi.fn();
      handle.hasPointerCapture = vi.fn().mockReturnValue(true);
      handle.releasePointerCapture = vi.fn();
      return handle;
    };

    let getBoundingClientRectSpy: MockInstance;
    let elementsFromPointMock: Mock;
    let originalElementsFromPoint: ElementsFromPoint | undefined;

    beforeEach(() => {
      getBoundingClientRectSpy = vi
        .spyOn(Element.prototype, 'getBoundingClientRect')
        .mockReturnValue(WIDGET_RECT);

      // jsdom doesn't implement document.elementsFromPoint. Stub it directly
      // so handleResizeStart's pass-through check has something to call.
      const stubButton = document.createElement('button');
      elementsFromPointMock = vi.fn().mockReturnValue([stubButton]);
      const doc = document as DocWithElementsFromPoint;
      originalElementsFromPoint = doc.elementsFromPoint;
      doc.elementsFromPoint =
        elementsFromPointMock as unknown as ElementsFromPoint;

      document.body.classList.remove('is-dragging-widget');
    });

    afterEach(() => {
      getBoundingClientRectSpy.mockRestore();
      const doc = document as DocWithElementsFromPoint;
      if (originalElementsFromPoint) {
        doc.elementsFromPoint = originalElementsFromPoint;
      } else {
        Reflect.deleteProperty(doc, 'elementsFromPoint');
      }
      document.body.classList.remove('is-dragging-widget');
    });

    it('starts resize when click is in the corner priority zone, even with a button beneath', () => {
      renderComponent({}, null, undefined, 'test-widget');
      const seHandle = getSeHandle();

      // (290, 290) is within 16px of right (300) and bottom (300) → priority zone.
      fireEvent.pointerDown(seHandle, {
        clientX: 290,
        clientY: 290,
        pointerId: 1,
      });

      // Resize started: body marker class is added and pointer capture taken.
      expect(document.body.classList.contains('is-dragging-widget')).toBe(true);
      expect(seHandle.setPointerCapture).toHaveBeenCalledWith(1);
      // elementsFromPoint pass-through must be skipped in the priority zone.
      expect(elementsFromPointMock).not.toHaveBeenCalled();

      fireEvent.pointerUp(seHandle, { pointerId: 1 });
    });

    it('passes through to interactive element when click is outside priority zone', () => {
      renderComponent({}, null, undefined, 'test-widget');
      const seHandle = getSeHandle();

      // (270, 270) is 30px inside right/bottom → NOT in the priority zone,
      // so the elementsFromPoint pass-through check runs and finds a button.
      fireEvent.pointerDown(seHandle, {
        clientX: 270,
        clientY: 270,
        pointerId: 1,
      });

      // Resize did NOT start: no body marker class, no pointer capture.
      expect(document.body.classList.contains('is-dragging-widget')).toBe(
        false
      );
      expect(seHandle.setPointerCapture).not.toHaveBeenCalled();
      // Pass-through path was exercised.
      expect(elementsFromPointMock).toHaveBeenCalledWith(270, 270);
    });

    it('starts resize from the overhang outside the widget bounds', () => {
      renderComponent({}, null, undefined, 'test-widget');
      const seHandle = getSeHandle();

      // (305, 305) is OUTSIDE the widget (right=300, bottom=300) — the
      // resize handle's 12px overhang. Always treated as priority zone.
      fireEvent.pointerDown(seHandle, {
        clientX: 305,
        clientY: 305,
        pointerId: 1,
      });

      expect(document.body.classList.contains('is-dragging-widget')).toBe(true);
      expect(elementsFromPointMock).not.toHaveBeenCalled();

      fireEvent.pointerUp(seHandle, { pointerId: 1 });
    });
  });

  // Regression: pressing Escape while editing a widget title should discard
  // the in-progress edit and NOT save the typed text to Firestore.
  //
  // Root cause: the title input's onKeyDown handler called
  //   setTempTitle(revertedValue); setIsEditingTitle(false);
  // React batches these, re-renders, and commits — unmounting the input.
  // Unmounting fires onBlur, which calls saveTitle(). But saveTitle is a
  // useCallback that closed over the *old* tempTitle (the typed text, before
  // setTempTitle reverted it). So the old stale typed value was persisted via
  // updateWidget even though the user pressed Escape to cancel.
  //
  // Fix: the Escape branch must prevent the onBlur from saving. The correct
  // approach is to call e.preventDefault() in the Escape onKeyDown handler
  // so the browser does not fire blur, then do the state cleanup ourselves —
  // OR (the approach taken) call `setIsEditingTitle(false)` only after having
  // set a ref that saveTitle checks before persisting, so the stale onBlur
  // becomes a no-op.
  it('does NOT save the typed text when Escape is pressed while editing the widget title', async () => {
    // Regression: pressing Escape in the title input should discard the edit.
    //
    // Root cause: the onKeyDown Escape handler called
    //   setTempTitle(revertedValue); setIsEditingTitle(false);
    // React batched these, re-rendered (removing the input from the VDOM), then
    // committed — unmounting the input DOM node. In a real browser, unmounting
    // fires a blur event on the focused input synchronously during the commit,
    // while the element is still being removed. The input's onBlur prop at that
    // moment is still the OLD saveTitle (from before the batch was committed),
    // which closed over the typed (not-yet-reverted) tempTitle. So the old
    // stale typed value was persisted via updateWidget even though the user
    // pressed Escape to cancel.
    //
    // jsdom does not fire blur during DOM unmount the same way browsers do,
    // so we replicate the browser behaviour by firing blur on the input
    // BEFORE React flushes (i.e., inside the same act() that presses Escape,
    // but before the commit). We do this by using act() with manual React
    // batching: fire keyDown (which schedules state updates), then immediately
    // fire blur while the input is still mounted — matching the order the
    // browser's focus manager would produce.

    // Pass test-widget as selected so the floating toolbar (and title) shows
    renderComponent({}, <div>Content</div>, <div>Settings</div>, 'test-widget');

    // Click the title span to enter edit mode
    const titleEl = screen.getByText('Test Widget');
    fireEvent.click(titleEl);

    // Verify the input appeared
    const input = screen.getByDisplayValue('Test Widget');
    expect(input).toBeInTheDocument();

    // Type something new
    fireEvent.change(input, { target: { value: 'Cancelled Title' } });
    expect(screen.getByDisplayValue('Cancelled Title')).toBeInTheDocument();

    // Simulate the browser's Escape-then-blur sequence inside a single act()
    // so React processes them in order before flushing:
    //   1. keyDown schedules setTempTitle(revert) + setIsEditingTitle(false)
    //   2. blur fires (still in same synchronous sequence, before React commits)
    //      → calls the stale saveTitle(tempTitle='Cancelled Title')
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape', bubbles: true });
      // Blur fires synchronously while the input is still in the DOM
      // (React has queued state updates but not yet committed)
      fireEvent.blur(input);
    });

    // The input should be gone (editing exited)
    await waitFor(() => {
      expect(
        screen.queryByDisplayValue('Cancelled Title')
      ).not.toBeInTheDocument();
    });

    // CRITICAL: updateWidget must NOT have been called with the typed title.
    // If it was, the stale-closure onBlur bug fired and saved the cancelled edit.
    expect(mockUpdateWidget).not.toHaveBeenCalledWith(
      'test-widget',
      expect.objectContaining({ customTitle: 'Cancelled Title' })
    );
  });
});
