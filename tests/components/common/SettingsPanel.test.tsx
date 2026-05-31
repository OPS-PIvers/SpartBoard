/**
 * Regression test for SettingsPanel position calculation.
 *
 * BUG: The panel position used to be computed from `widget.x + widget.w`
 * (world coordinates) as if they were viewport coordinates. When the board
 * canvas has a CSS zoom/pan transform applied, the widget's actual screen
 * position differs from its world coordinates. The panel therefore appeared
 * at the wrong location whenever zoom ≠ 1 or pan ≠ 0.
 *
 * FIX: `updatePosition()` now calls `widgetRef.current.getBoundingClientRect()`
 * so the panel is placed relative to the element's *actual* screen rect,
 * which accounts for any ancestor CSS transforms.
 */

import React, { useRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsPanel } from '@/components/common/SettingsPanel';
import { WidgetData, GlobalStyle } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/common/WidgetBuildingToggle', () => ({
  WidgetBuildingToggle: () => null,
}));

vi.mock('@/components/common/UniversalStyleSettings', () => ({
  UniversalStyleSettings: () => null,
}));

// SettingsPanel now subscribes to useDashboard for zoom; tests do not render a
// DashboardProvider, so stub the hook with stable defaults.
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    zoom: 1,
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_WIDGET: WidgetData = {
  id: 'w1',
  type: 'clock',
  // World coordinates — these intentionally differ from the screen coordinates
  // returned by the mocked getBoundingClientRect() to simulate zoom/pan.
  x: 100,
  y: 100,
  w: 200,
  h: 150,
  z: 1,
  flipped: true,
  config: {},
};

const MOCK_GLOBAL_STYLE: GlobalStyle = {
  fontFamily: 'sans',
  windowTransparency: 0.8,
  windowBorderRadius: '2xl',
  dockTransparency: 0.4,
  dockBorderRadius: 'full',
  dockTextColor: '#334155',
  dockTextShadow: false,
};

// ---------------------------------------------------------------------------
// Simple wrapper that exposes the inner widgetRef div
// ---------------------------------------------------------------------------
const Harness: React.FC<{ widgetOverrides?: Partial<WidgetData> }> = ({
  widgetOverrides,
}) => {
  const widgetRef = useRef<HTMLDivElement>(null);
  const widget = { ...MOCK_WIDGET, ...widgetOverrides };

  return (
    <>
      <div ref={widgetRef} data-testid="fake-widget" />
      <SettingsPanel
        widget={widget}
        widgetRef={widgetRef}
        settings={<div data-testid="settings-content">Settings</div>}
        shouldRenderSettings
        onClose={vi.fn()}
        updateWidget={vi.fn()}
        globalStyle={MOCK_GLOBAL_STYLE}
        title="Test Widget"
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Helper: find the outermost fixed-position ancestor of an element
// ---------------------------------------------------------------------------
function findFixedAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    if (node.style.position === 'fixed') return node;
    node = node.parentElement;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsPanel', () => {
  beforeEach(() => {
    // rAF is used for the isVisible animation; run callbacks synchronously.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      writable: true,
    });
  });

  afterEach(() => {
    // vi.restoreAllMocks() also restores the getBCRSpy created in each test.
    vi.restoreAllMocks();
  });

  it('renders settings content inside the panel', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 300,
      top: 100,
      right: 500,
      bottom: 250,
      width: 200,
      height: 150,
      x: 300,
      y: 100,
      toJSON: () => ({}),
    });

    act(() => {
      render(<Harness />);
    });

    expect(screen.getByTestId('settings-content')).toBeInTheDocument();
  });

  /**
   * Core regression: the panel left position must be derived from the element's
   * actual screen rect (getBoundingClientRect), NOT from world coordinates.
   *
   * Setup:
   *   - widget world position: x=100, w=200  →  world right = 300
   *   - widget screen rect (after zoom/pan):  left=0, right=200
   *
   * Expected panel left (correct):   screenRect.right  + 12 = 200 + 12 = 212
   * Buggy panel left (world coords): widget.x + widget.w + 12 = 100 + 200 + 12 = 312
   *
   * Viewport is 1024 wide; panel (width≤380) fits to the right of 200.
   */
  it('click-outside closes the panel even after onClose prop identity changes mid-session', () => {
    // Regression: SettingsPanel's click-outside useEffect listed `onClose` in its
    // dependency array. DraggableWindow passes onClose as an inline arrow function
    // (`() => updateWidget(widget.id, { flipped: false })`), which creates a new
    // function reference on every DraggableWindow render (e.g., drag, zoom, Firestore
    // update). Each new onClose reference triggers the useEffect to re-run: the old
    // 50ms timer is cleared, the event listener is removed, and a fresh 50ms timer
    // is started. This means a click outside the panel is silently dropped whenever
    // it arrives within 50ms of a parent re-render — a race condition that is very
    // common during drag-while-settings-open.
    //
    // Fix: store onClose in a ref inside SettingsPanel (`onCloseRef.current = onClose`
    // on every render) and call `onCloseRef.current()` from the handler. The useEffect
    // dependency changes from `[onClose, widgetRef]` to `[widgetRef]` only, so the
    // timer is only restarted when the widget actually changes identity — not on every
    // parent re-render.

    vi.useFakeTimers();

    try {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 100,
        right: 300,
        bottom: 250,
        width: 200,
        height: 150,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      });

      const onClose1 = vi.fn();
      const onClose2 = vi.fn();

      // SettingsPanel's click-outside handler gates on widgetRef.current being
      // non-null (to check if the click was inside the widget). We need a real
      // DOM element in the ref, positioned far from clientX=10, clientY=10 so
      // the click is treated as "outside".
      const ClickOutsideHarness = ({ onClose }: { onClose: () => void }) => {
        const widgetRef = React.useRef<HTMLDivElement>(null);
        return (
          <>
            <div
              ref={widgetRef}
              data-testid="fake-widget"
              style={{
                position: 'fixed',
                left: 500,
                top: 500,
                width: 100,
                height: 100,
              }}
            />
            <SettingsPanel
              widget={MOCK_WIDGET}
              widgetRef={widgetRef}
              settings={<div data-testid="settings-content">Settings</div>}
              shouldRenderSettings
              onClose={onClose}
              updateWidget={vi.fn()}
              globalStyle={MOCK_GLOBAL_STYLE}
              title="Test Widget"
            />
          </>
        );
      };

      const { rerender } = render(<ClickOutsideHarness onClose={onClose1} />);

      // Let the 50ms timer for the initial mount elapse so the pointerdown listener
      // is registered.
      act(() => {
        vi.advanceTimersByTime(60);
      });

      // Simulate a DraggableWindow re-render by passing a new onClose identity.
      // In production this happens on every drag/zoom/Firestore update while the
      // settings panel is open.
      act(() => {
        rerender(<ClickOutsideHarness onClose={onClose2} />);
      });

      // Fire pointerdown on the document body immediately after the re-render.
      // The timer has been RESET to 0ms (because onClose changed identity).
      // With the bug: the listener hasn't been re-attached yet (still within the
      // new 50ms window), so neither onClose1 nor onClose2 is called.
      // With the fix: the effect doesn't depend on onClose at all, the existing
      // listener is still attached, and onClose2 is invoked immediately.
      // Dispatch pointerdown on a specific element in the body that is clearly
      // OUTSIDE both the SettingsPanel and the fake-widget. The click-outside
      // handler receives this element as e.target, which must be an Element (not
      // a Document node) for `.closest()` to be available.
      const outsideEl = document.createElement('div');
      document.body.appendChild(outsideEl);
      try {
        act(() => {
          outsideEl.dispatchEvent(
            new PointerEvent('pointerdown', {
              bubbles: true,
              clientX: 10, // Far from the panel (left: 100+), so it's "outside"
              clientY: 10,
            })
          );
        });
      } finally {
        document.body.removeChild(outsideEl);
      }

      // With the bug the click is dropped — the timer was just reset.
      // With the fix the click-outside fires immediately.
      expect(onClose2).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('positions the panel using getBoundingClientRect, not world coordinates', () => {
    // Mock getBoundingClientRect to return a screen rect that DIFFERS from the
    // widget's world coordinates — simulating a zoom/pan transform on the canvas.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 100,
      right: 200, // ← screen right (differs from world right = 100+200 = 300)
      bottom: 250,
      width: 200,
      height: 150,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    act(() => {
      render(<Harness />);
    });

    const settingsContent = screen.getByTestId('settings-content');
    const panelEl = findFixedAncestor(settingsContent);

    expect(panelEl).not.toBeNull();
    if (!panelEl) return;

    const leftValue = parseFloat(panelEl.style.left);

    // With the fix: left = screenRect.right + PANEL_MARGIN = 200 + 12 = 212
    expect(leftValue).toBe(212);

    // Explicitly confirm it is NOT the old (buggy) world-coordinate value:
    // widget.x + widget.w + PANEL_MARGIN = 100 + 200 + 12 = 312
    expect(leftValue).not.toBe(312);
  });
});
