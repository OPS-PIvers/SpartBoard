import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { calculateSnapBounds, SNAP_LAYOUT_CONSTANTS } from '@/utils/layoutMath';
import type { SnapZone } from '@/config/snapLayouts';

describe('calculateSnapBounds', () => {
  let originalWindow: typeof window | undefined;

  beforeEach(() => {
    // Save original window to restore later
    originalWindow = global.window;
  });

  afterEach(() => {
    // Restore window
    // @ts-expect-error - restoring window to undefined if it didn't exist
    global.window = originalWindow;
  });

  it('returns safe fallback of all 0s when window is undefined (SSR)', () => {
    // Simulate SSR
    // @ts-expect-error - intentionally removing window
    delete global.window;

    const mockZone: SnapZone = { id: 'test', x: 0, y: 0, w: 1, h: 1 };
    const bounds = calculateSnapBounds(mockZone);

    expect(bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('calculates full width/height bounds correctly with padding applied', () => {
    const mockZone: SnapZone = { id: 'test', x: 0, y: 0, w: 1, h: 1 };
    const bounds = calculateSnapBounds(mockZone);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const safeWidth = Math.max(0, w - SNAP_LAYOUT_CONSTANTS.PADDING * 2);
    const safeHeight = Math.max(0, h - SNAP_LAYOUT_CONSTANTS.PADDING * 2);

    // For a full-screen zone (x: 0, y: 0, w: 1, h: 1), x=0, x+w=1 so no inner gaps applied.
    expect(bounds).toEqual({
      x: SNAP_LAYOUT_CONSTANTS.PADDING,
      y: SNAP_LAYOUT_CONSTANTS.PADDING,
      w: safeWidth,
      h: safeHeight,
    });
  });

  it('calculates left half correctly (x=0, w=0.5), applying right gap', () => {
    const mockZone: SnapZone = { id: 'test', x: 0, y: 0, w: 0.5, h: 1 };
    const bounds = calculateSnapBounds(mockZone);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const safeWidth = Math.max(0, w - SNAP_LAYOUT_CONSTANTS.PADDING * 2);
    const safeHeight = Math.max(0, h - SNAP_LAYOUT_CONSTANTS.PADDING * 2);
    const rawW = 0.5 * safeWidth;

    // zone.x is 0 so no left gap.
    // zone.x + zone.w < 1 (0 + 0.5 < 1) so it subtracts GAP/2 from width.
    const expectedW = Math.round(rawW - SNAP_LAYOUT_CONSTANTS.GAP / 2);

    expect(bounds).toEqual({
      x: SNAP_LAYOUT_CONSTANTS.PADDING,
      y: SNAP_LAYOUT_CONSTANTS.PADDING,
      w: expectedW,
      h: safeHeight, // full safe height since y=0 and h=1
    });
  });

  it('calculates right half correctly (x=0.5, w=0.5), applying left gap', () => {
    const mockZone: SnapZone = { id: 'test', x: 0.5, y: 0, w: 0.5, h: 1 };
    const bounds = calculateSnapBounds(mockZone);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const safeWidth = Math.max(0, w - SNAP_LAYOUT_CONSTANTS.PADDING * 2);
    const safeHeight = Math.max(0, h - SNAP_LAYOUT_CONSTANTS.PADDING * 2);

    const rawX = SNAP_LAYOUT_CONSTANTS.PADDING + 0.5 * safeWidth;
    const rawW = 0.5 * safeWidth;

    // zone.x > 0 so add GAP/2 to x
    const expectedX = Math.round(rawX + SNAP_LAYOUT_CONSTANTS.GAP / 2);

    // zone.x > 0 so subtract GAP/2 from w
    // zone.x + zone.w == 1 (0.5 + 0.5 == 1) so no right gap subtracted
    const expectedW = Math.round(rawW - SNAP_LAYOUT_CONSTANTS.GAP / 2);

    expect(bounds).toEqual({
      x: expectedX,
      y: SNAP_LAYOUT_CONSTANTS.PADDING,
      w: expectedW,
      h: safeHeight,
    });
  });

  it('calculates quarter correctly (x=0.5, y=0.5, w=0.5, h=0.5)', () => {
    const mockZone: SnapZone = {
      id: 'test',
      x: 0.5,
      y: 0.5,
      w: 0.5,
      h: 0.5,
    };
    const bounds = calculateSnapBounds(mockZone);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const safeWidth = Math.max(0, w - SNAP_LAYOUT_CONSTANTS.PADDING * 2);
    const safeHeight = Math.max(0, h - SNAP_LAYOUT_CONSTANTS.PADDING * 2);

    // X calculation
    const rawX = SNAP_LAYOUT_CONSTANTS.PADDING + 0.5 * safeWidth;
    const expectedX = Math.round(rawX + SNAP_LAYOUT_CONSTANTS.GAP / 2);

    // Y calculation
    const rawY = SNAP_LAYOUT_CONSTANTS.PADDING + 0.5 * safeHeight;
    const expectedY = Math.round(rawY + SNAP_LAYOUT_CONSTANTS.GAP / 2);

    // W calculation
    const rawW = 0.5 * safeWidth;
    const expectedW = Math.round(rawW - SNAP_LAYOUT_CONSTANTS.GAP / 2);

    // H calculation
    const rawH = 0.5 * safeHeight;
    const expectedH = Math.round(rawH - SNAP_LAYOUT_CONSTANTS.GAP / 2);

    expect(bounds).toEqual({
      x: expectedX,
      y: expectedY,
      w: expectedW,
      h: expectedH,
    });
  });

  it('handles negative safe dimensions safely by bounding at 0', () => {
    // Passing a negative width and height tests the clamping logic in Math.max
    const mockZone: SnapZone = { id: 'test', x: 0, y: 0, w: -10, h: -10 };
    const bounds = calculateSnapBounds(mockZone);

    expect(bounds.w).toBe(0);
    expect(bounds.h).toBe(0);
  });
});
