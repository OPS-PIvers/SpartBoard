import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateSnapBounds, SNAP_LAYOUT_CONSTANTS } from '@/utils/layoutMath';
import { SnapZone } from '@/config/snapLayouts';

describe('layoutMath', () => {
  beforeEach(() => {
    vi.spyOn(document, 'querySelector').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateSnapBounds', () => {
    const defaultZone: SnapZone = {
      id: 'test-zone',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    };

    it('should return 0 bounds if window is undefined (SSR)', () => {
      // Safely simulate SSR without breaking JSDOM teardown
      const originalWindow = global.window;
      // @ts-expect-error - Expected for testing SSR simulation
      delete global.window;

      const bounds = calculateSnapBounds(defaultZone);
      expect(bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });

      global.window = originalWindow;
    });

    it('should calculate bounds correctly without dock element (fallback height)', () => {
      const zone: SnapZone = { ...defaultZone, x: 0, y: 0, w: 1, h: 1 };
      const bounds = calculateSnapBounds(zone);

      const { PADDING, DOCK_HEIGHT } = SNAP_LAYOUT_CONSTANTS;
      const expectedWidth = window.innerWidth - PADDING * 2;
      const expectedHeight = window.innerHeight - DOCK_HEIGHT - PADDING * 2;

      expect(bounds.x).toBe(PADDING);
      expect(bounds.y).toBe(PADDING);
      expect(bounds.w).toBe(expectedWidth);
      expect(bounds.h).toBe(expectedHeight);
    });

    it('should use dock element height if present', () => {
      const mockDockElement = {
        getBoundingClientRect: vi.fn().mockReturnValue({
          top: window.innerHeight - 180,
        }),
      } as unknown as Element;

      vi.spyOn(document, 'querySelector').mockReturnValue(mockDockElement);

      const zone: SnapZone = { ...defaultZone, x: 0, y: 0, w: 1, h: 1 };
      const bounds = calculateSnapBounds(zone);

      const { PADDING } = SNAP_LAYOUT_CONSTANTS;
      const dockReservedHeight = 180;
      const expectedWidth = window.innerWidth - PADDING * 2;
      const expectedHeight =
        window.innerHeight - dockReservedHeight - PADDING * 2;

      expect(bounds.x).toBe(PADDING);
      expect(bounds.y).toBe(PADDING);
      expect(bounds.w).toBe(expectedWidth);
      expect(bounds.h).toBe(expectedHeight);
    });

    it('should use dock element by data-testid if data-role is not found', () => {
      const mockDockElement = {
        getBoundingClientRect: vi.fn().mockReturnValue({
          top: window.innerHeight - 280,
        }),
      } as unknown as Element;

      vi.spyOn(document, 'querySelector').mockImplementation(
        (selector: string) => {
          if (selector === '[data-role="dock"]') return null;
          if (selector === '[data-testid="dock"]') return mockDockElement;
          return null;
        }
      );

      const zone: SnapZone = { ...defaultZone, x: 0, y: 0, w: 1, h: 1 };
      const bounds = calculateSnapBounds(zone);

      const { PADDING } = SNAP_LAYOUT_CONSTANTS;
      const dockReservedHeight = 280;
      const expectedWidth = window.innerWidth - PADDING * 2;
      const expectedHeight =
        window.innerHeight - dockReservedHeight - PADDING * 2;

      expect(bounds.x).toBe(PADDING);
      expect(bounds.y).toBe(PADDING);
      expect(bounds.w).toBe(expectedWidth);
      expect(bounds.h).toBe(expectedHeight);
    });

    it('should fall back to DOCK_HEIGHT if reserved height is <= 0', () => {
      const mockDockElement = {
        getBoundingClientRect: vi.fn().mockReturnValue({
          top: window.innerHeight + 5000,
        }),
      } as unknown as Element;

      vi.spyOn(document, 'querySelector').mockReturnValue(mockDockElement);

      const zone: SnapZone = { ...defaultZone, x: 0, y: 0, w: 1, h: 1 };
      const bounds = calculateSnapBounds(zone);

      const { PADDING, DOCK_HEIGHT } = SNAP_LAYOUT_CONSTANTS;
      const expectedWidth = window.innerWidth - PADDING * 2;
      const expectedHeight = window.innerHeight - DOCK_HEIGHT - PADDING * 2;

      expect(bounds.x).toBe(PADDING);
      expect(bounds.y).toBe(PADDING);
      expect(bounds.w).toBe(expectedWidth);
      expect(bounds.h).toBe(expectedHeight);
    });

    it('should calculate bounds using fallback height if document is undefined (SSR)', () => {
      const originalDocument = global.document;
      // @ts-expect-error - Expected for testing SSR simulation
      delete global.document;

      const zone: SnapZone = { ...defaultZone, x: 0, y: 0, w: 1, h: 1 };
      const bounds = calculateSnapBounds(zone);

      const { PADDING, DOCK_HEIGHT } = SNAP_LAYOUT_CONSTANTS;
      const expectedWidth = window.innerWidth - PADDING * 2;
      const expectedHeight = window.innerHeight - DOCK_HEIGHT - PADDING * 2;

      expect(bounds.x).toBe(PADDING);
      expect(bounds.y).toBe(PADDING);
      expect(bounds.w).toBe(expectedWidth);
      expect(bounds.h).toBe(expectedHeight);

      global.document = originalDocument;
    });

    it('should calculate bounds with gaps for half zones', () => {
      const leftZone: SnapZone = {
        ...defaultZone,
        x: 0,
        y: 0,
        w: 0.5,
        h: 1,
      };
      const rightZone: SnapZone = {
        ...defaultZone,
        x: 0.5,
        y: 0,
        w: 0.5,
        h: 1,
      };

      const leftBounds = calculateSnapBounds(leftZone);
      const rightBounds = calculateSnapBounds(rightZone);

      const { PADDING, GAP, DOCK_HEIGHT } = SNAP_LAYOUT_CONSTANTS;
      const safeWidth = window.innerWidth - PADDING * 2;
      const safeHeight = window.innerHeight - DOCK_HEIGHT - PADDING * 2;

      expect(leftBounds.w).toBe(Math.round(0.5 * safeWidth - GAP / 2));
      expect(rightBounds.x).toBe(
        Math.round(PADDING + 0.5 * safeWidth + GAP / 2)
      );
      expect(rightBounds.w).toBe(Math.round(0.5 * safeWidth - GAP / 2));

      expect(leftBounds.h).toBe(safeHeight);
      expect(rightBounds.h).toBe(safeHeight);
    });

    it('should clamp safe dimensions to at least 0 on tiny viewports', () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(10);
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(10);

      const zone: SnapZone = { ...defaultZone, x: 0, y: 0, w: 1, h: 1 };
      const bounds = calculateSnapBounds(zone);

      const { PADDING } = SNAP_LAYOUT_CONSTANTS;

      expect(bounds.w).toBe(0);
      expect(bounds.h).toBe(0);
      expect(bounds.x).toBe(PADDING);
      expect(bounds.y).toBe(PADDING);
    });

    it('should subtract gaps from height for stacked zones', () => {
      const topZone: SnapZone = {
        ...defaultZone,
        x: 0,
        y: 0,
        w: 1,
        h: 0.5,
      };
      const bottomZone: SnapZone = {
        ...defaultZone,
        x: 0,
        y: 0.5,
        w: 1,
        h: 0.5,
      };

      const topBounds = calculateSnapBounds(topZone);
      const bottomBounds = calculateSnapBounds(bottomZone);

      const { PADDING, GAP, DOCK_HEIGHT } = SNAP_LAYOUT_CONSTANTS;
      const safeHeight = window.innerHeight - DOCK_HEIGHT - PADDING * 2;

      expect(topBounds.h).toBe(Math.round(0.5 * safeHeight - GAP / 2));
      expect(bottomBounds.y).toBe(
        Math.round(PADDING + 0.5 * safeHeight + GAP / 2)
      );
      expect(bottomBounds.h).toBe(Math.round(0.5 * safeHeight - GAP / 2));
    });
  });
});
