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
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
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
  let getBCRSpy: MockInstance;

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
    vi.restoreAllMocks();
    getBCRSpy?.mockRestore();
  });

  it('renders settings content inside the panel', () => {
    getBCRSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
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
  it('positions the panel using getBoundingClientRect, not world coordinates', () => {
    // Mock getBoundingClientRect to return a screen rect that DIFFERS from the
    // widget's world coordinates — simulating a zoom/pan transform on the canvas.
    getBCRSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
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
