/**
 * Regression test: GroupBoundingBox committed scale (onUp) must match the
 * live-drag scale (onMove) formula so widgets don't jump on mouse release.
 *
 * Bug: onMove used Math.sqrt(scaleX * scaleY) (geometric mean) while onUp
 * used (fScaleX + fScaleY) / 2 (arithmetic mean). For non-proportional
 * diagonal drags these formulas produce different values, causing a visible
 * position/size jump the moment the user releases the mouse.
 *
 * Fix: onUp now uses Math.sqrt(fScaleX * fScaleY) to match onMove.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroupBoundingBox } from './GroupBoundingBox';
import { WidgetData } from '@/types';
import {
  DashboardContext,
  DashboardContextValue,
} from '@/context/DashboardContextValue';

// ---------------------------------------------------------------------------
// Minimal mock of useDashboard — we only need updateWidgets
// ---------------------------------------------------------------------------
const mockUpdateWidgets = vi.fn();

const mockContextValue = {
  updateWidgets: mockUpdateWidgets,
} as unknown as DashboardContextValue;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeWidget = (id: string, x: number, y: number): WidgetData => ({
  id,
  type: 'clock',
  x,
  y,
  w: 200,
  h: 200,
  z: 1,
  flipped: false,
  config: {},
});

interface CommittedChange {
  id: string;
  changes: { x: number; y: number; w: number; h: number };
}

/**
 * Geometric-mean scale formula — the formula used by the onMove RAF path.
 * The onUp commit MUST produce the same scale for the same dx/dy.
 */
function geometricMeanScale(
  bboxW: number,
  bboxH: number,
  dx: number,
  dy: number,
  corner: 'se' | 'sw' | 'ne' | 'nw'
): number {
  let scaleX: number;
  let scaleY: number;
  if (corner === 'se') {
    scaleX = (bboxW + dx) / bboxW;
    scaleY = (bboxH + dy) / bboxH;
  } else if (corner === 'sw') {
    scaleX = (bboxW - dx) / bboxW;
    scaleY = (bboxH + dy) / bboxH;
  } else if (corner === 'ne') {
    scaleX = (bboxW + dx) / bboxW;
    scaleY = (bboxH - dy) / bboxH;
  } else {
    scaleX = (bboxW - dx) / bboxW;
    scaleY = (bboxH - dy) / bboxH;
  }
  return Math.sqrt(scaleX * scaleY);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('GroupBoundingBox', () => {
  beforeEach(() => {
    mockUpdateWidgets.mockClear();
    // requestAnimationFrame: run callbacks synchronously
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Core regression: when the user drags the SE handle with unequal dx/dy
   * (non-proportional diagonal drag), the scale written to Firestore on
   * pointerup must equal the scale that was applied during the last onMove
   * RAF. Before the fix, onUp used arithmetic mean ((scaleX + scaleY) / 2)
   * while onMove used geometric mean (sqrt(scaleX * scaleY)). The two differ
   * by up to ~6% for typical drags, causing a visible widget-jump on release.
   */
  it('commits the same scale on pointerup that was applied during the final pointermove (geometric mean, SE handle)', () => {
    // Two widgets side-by-side so the bounding box is non-trivial.
    // w1 at (0,0,200,200) and w2 at (200,0,200,200)
    // bbox: left=0, top=0, right=400, bottom=200, width=400, height=200
    const widgets = [makeWidget('w1', 0, 0), makeWidget('w2', 200, 0)];

    render(
      <DashboardContext.Provider value={mockContextValue}>
        <GroupBoundingBox groupWidgets={widgets} zoom={1} />
      </DashboardContext.Provider>
    );

    // GroupBoundingBox renders 4 corner handles via map(['se','sw','ne','nw']).
    // 'se' and 'nw' share the nwse-resize cursor; 'se' is the first in DOM order.
    const handles = document.querySelectorAll<HTMLElement>(
      '[style*="nwse-resize"], [style*="nesw-resize"]'
    );
    const seHandleEl = handles[0];
    expect(seHandleEl).toBeTruthy();

    // Patch pointer-capture methods (not implemented in jsdom).
    seHandleEl.setPointerCapture = vi.fn();
    seHandleEl.hasPointerCapture = vi.fn().mockReturnValue(false);
    seHandleEl.releasePointerCapture = vi.fn();

    // Start the resize gesture at (300, 150).
    fireEvent.pointerDown(seHandleEl, {
      clientX: 300,
      clientY: 150,
      pointerId: 1,
    });

    // The bounding box for the two widgets:
    //   left=0, top=0, width=400, height=200
    const bboxW = 400;
    const bboxH = 200;

    // Non-proportional drag: move MORE horizontally than vertically.
    // dx=80, dy=20 → scaleX=(400+80)/400=1.2, scaleY=(200+20)/200=1.1
    // geometric mean = sqrt(1.2 * 1.1) = sqrt(1.32) ≈ 1.1489
    // arithmetic mean = (1.2 + 1.1) / 2 = 1.15 (DIFFERENT!)
    const dx = 80;
    const dy = 20;

    fireEvent.pointerMove(window, {
      clientX: 300 + dx,
      clientY: 150 + dy,
      pointerId: 1,
    });

    // Release the pointer — onUp must commit using the SAME formula as onMove.
    act(() => {
      fireEvent.pointerUp(window, {
        clientX: 300 + dx,
        clientY: 150 + dy,
        pointerId: 1,
      });
    });

    // updateWidgets must have been called exactly once.
    expect(mockUpdateWidgets).toHaveBeenCalledTimes(1);

    const calls = mockUpdateWidgets.mock.calls[0][0] as CommittedChange[];

    // The committed scale must equal the geometric mean (onMove formula).
    const expectedScale = geometricMeanScale(bboxW, bboxH, dx, dy, 'se');
    // anchor for SE = top-left of bbox = (0, 0)
    const anchorX = 0;
    const anchorY = 0;

    for (const call of calls) {
      const widget = widgets.find((w) => w.id === call.id);
      if (!widget) throw new Error(`Widget ${call.id} not found`);
      const relX = widget.x - anchorX;
      const relY = widget.y - anchorY;
      const expectedW = widget.w * expectedScale;
      const expectedH = widget.h * expectedScale;
      const expectedX = anchorX + relX * expectedScale;
      const expectedY = anchorY + relY * expectedScale;

      expect(call.changes.w).toBeCloseTo(expectedW, 3);
      expect(call.changes.h).toBeCloseTo(expectedH, 3);
      expect(call.changes.x).toBeCloseTo(expectedX, 3);
      expect(call.changes.y).toBeCloseTo(expectedY, 3);
    }
  });

  /**
   * Sanity check: for a perfectly proportional drag (dx/bboxW == dy/bboxH),
   * geometric mean and arithmetic mean are equal. Both old and new code
   * pass this case — this test mainly confirms the test harness works.
   */
  it('produces consistent committed scale for proportional drags (both formulas agree)', () => {
    const widgets = [makeWidget('w1', 0, 0)];

    render(
      <DashboardContext.Provider value={mockContextValue}>
        <GroupBoundingBox groupWidgets={widgets} zoom={1} />
      </DashboardContext.Provider>
    );

    const seHandleEl = document.querySelector<HTMLElement>(
      '[style*="nwse-resize"]'
    );
    if (!seHandleEl) throw new Error('SE handle not found');
    seHandleEl.setPointerCapture = vi.fn();
    seHandleEl.hasPointerCapture = vi.fn().mockReturnValue(false);
    seHandleEl.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(seHandleEl, {
      clientX: 200,
      clientY: 200,
      pointerId: 1,
    });

    // Proportional drag: same ratio for both axes.
    // bbox 200×200, dx=40=20%, dy=40=20% → scaleX=scaleY=1.2
    // geometric mean = arithmetic mean = 1.2
    const dx = 40;
    const dy = 40;

    fireEvent.pointerMove(window, {
      clientX: 200 + dx,
      clientY: 200 + dy,
      pointerId: 1,
    });

    act(() => {
      fireEvent.pointerUp(window, {
        clientX: 200 + dx,
        clientY: 200 + dy,
        pointerId: 1,
      });
    });

    expect(mockUpdateWidgets).toHaveBeenCalledTimes(1);
    const committed = mockUpdateWidgets.mock.calls[0][0] as CommittedChange[];
    const call = committed[0];
    if (!call) throw new Error('No committed changes');
    // With proportional drag and anchor at (0,0), widget stays at (0,0).
    expect(call.changes.w).toBeCloseTo(200 * 1.2, 3);
    expect(call.changes.h).toBeCloseTo(200 * 1.2, 3);
  });
});
