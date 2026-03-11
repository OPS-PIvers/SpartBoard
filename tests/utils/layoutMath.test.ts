import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  calculateSnapBounds,
  SNAP_LAYOUT_CONSTANTS,
} from '../../utils/layoutMath';
import type { SnapZone } from '../../config/snapLayouts';

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
    // Mock window to predictable dimensions
    // e.g., 1000x1000
    // @ts-expect-error - overriding properties
    global.window = { ...global.window, innerWidth: 1000, innerHeight: 1000 };

    const mockZone: SnapZone = { id: 'test', x: 0, y: 0, w: 1, h: 1 };
    const bounds = calculateSnapBounds(mockZone);

    const safeWidth = Math.max(0, 1000 - SNAP_LAYOUT_CONSTANTS.PADDING * 2); // 1000 - 32 = 968
    const safeHeight = Math.max(0, 1000 - SNAP_LAYOUT_CONSTANTS.PADDING * 2); // 1000 - 32 = 968

    // For a full-screen zone (x: 0, y: 0, w: 1, h: 1), x=0, x+w=1 so no inner gaps applied.
    expect(bounds).toEqual({
      x: SNAP_LAYOUT_CONSTANTS.PADDING,
      y: SNAP_LAYOUT_CONSTANTS.PADDING,
      w: safeWidth,
      h: safeHeight,
    });
  });

  it('calculates left half correctly (x=0, w=0.5), applying right gap', () => {
    // @ts-expect-error - overriding properties
    global.window = { ...global.window, innerWidth: 1000, innerHeight: 1000 };

    const mockZone: SnapZone = { id: 'test', x: 0, y: 0, w: 0.5, h: 1 };
    const bounds = calculateSnapBounds(mockZone);

    const safeWidth = 1000 - SNAP_LAYOUT_CONSTANTS.PADDING * 2; // 968
    const rawW = 0.5 * safeWidth; // 484

    // zone.x is 0 so no left gap.
    // zone.x + zone.w < 1 (0 + 0.5 < 1) so it subtracts GAP/2 from width.
    const expectedW = Math.round(rawW - SNAP_LAYOUT_CONSTANTS.GAP / 2); // 484 - 6 = 478

    expect(bounds).toEqual({
      x: SNAP_LAYOUT_CONSTANTS.PADDING,
      y: SNAP_LAYOUT_CONSTANTS.PADDING,
      w: expectedW,
      h: 968, // full safe height since y=0 and h=1
    });
  });

  it('calculates right half correctly (x=0.5, w=0.5), applying left gap', () => {
    // @ts-expect-error - overriding properties
    global.window = { ...global.window, innerWidth: 1000, innerHeight: 1000 };

    const mockZone: SnapZone = { id: 'test', x: 0.5, y: 0, w: 0.5, h: 1 };
    const bounds = calculateSnapBounds(mockZone);

    const safeWidth = 1000 - SNAP_LAYOUT_CONSTANTS.PADDING * 2; // 968
    const rawX = SNAP_LAYOUT_CONSTANTS.PADDING + 0.5 * safeWidth; // 16 + 484 = 500
    const rawW = 0.5 * safeWidth; // 484

    // zone.x > 0 so add GAP/2 to x
    const expectedX = Math.round(rawX + SNAP_LAYOUT_CONSTANTS.GAP / 2); // 500 + 6 = 506

    // zone.x > 0 so subtract GAP/2 from w
    // zone.x + zone.w == 1 (0.5 + 0.5 == 1) so no right gap subtracted
    const expectedW = Math.round(rawW - SNAP_LAYOUT_CONSTANTS.GAP / 2); // 484 - 6 = 478

    expect(bounds).toEqual({
      x: expectedX,
      y: SNAP_LAYOUT_CONSTANTS.PADDING,
      w: expectedW,
      h: 968,
    });
  });

  it('calculates quarter correctly (x=0.5, y=0.5, w=0.5, h=0.5)', () => {
    // @ts-expect-error - overriding properties
    global.window = { ...global.window, innerWidth: 1000, innerHeight: 1000 };

    const mockZone: SnapZone = {
      id: 'test',
      x: 0.5,
      y: 0.5,
      w: 0.5,
      h: 0.5,
    };
    const bounds = calculateSnapBounds(mockZone);

    const safeDim = 1000 - SNAP_LAYOUT_CONSTANTS.PADDING * 2; // 968

    // X calculation
    const rawX = SNAP_LAYOUT_CONSTANTS.PADDING + 0.5 * safeDim; // 500
    const expectedX = Math.round(rawX + SNAP_LAYOUT_CONSTANTS.GAP / 2); // 506

    // Y calculation
    const rawY = SNAP_LAYOUT_CONSTANTS.PADDING + 0.5 * safeDim; // 500
    const expectedY = Math.round(rawY + SNAP_LAYOUT_CONSTANTS.GAP / 2); // 506

    // W calculation
    const rawW = 0.5 * safeDim; // 484
    const expectedW = Math.round(rawW - SNAP_LAYOUT_CONSTANTS.GAP / 2); // 478

    // H calculation
    const rawH = 0.5 * safeDim; // 484
    const expectedH = Math.round(rawH - SNAP_LAYOUT_CONSTANTS.GAP / 2); // 478

    expect(bounds).toEqual({
      x: expectedX,
      y: expectedY,
      w: expectedW,
      h: expectedH,
    });
  });

  it('handles negative safe dimensions safely by bounding at 0', () => {
    // Simulate very small window
    // @ts-expect-error - overriding properties
    global.window = { ...global.window, innerWidth: 10, innerHeight: 10 };

    const mockZone: SnapZone = { id: 'test', x: 0, y: 0, w: 1, h: 1 };
    const bounds = calculateSnapBounds(mockZone);

    // Padding is 16, so safeWidth is Math.max(0, 10 - 32) = 0
    expect(bounds).toEqual({
      x: SNAP_LAYOUT_CONSTANTS.PADDING, // 16
      y: SNAP_LAYOUT_CONSTANTS.PADDING, // 16
      w: 0,
      h: 0,
    });
  });
});
