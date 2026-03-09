import { SnapZone } from '@/config/snapLayouts';

export const SNAP_LAYOUT_CONSTANTS = {
  PADDING: 16, // Gap from edges of the screen
  GAP: 12, // Gap between widgets (slightly larger for touch)
  DOCK_HEIGHT: 100, // Reserved space for the bottom dock
  EDGE_THRESHOLD: 40, // Edge Detection Threshold for Large Touch Panels
};

const getDockReservedHeight = (fallbackHeight: number): number => {
  if (typeof document === 'undefined') {
    return fallbackHeight;
  }
  const dockElement =
    document.querySelector<HTMLElement>('[data-role="dock"]') ??
    document.querySelector<HTMLElement>('[data-testid="dock"]');
  if (!dockElement) {
    return fallbackHeight;
  }
  const rect = dockElement.getBoundingClientRect();
  // We reserve everything from the dock's top to the bottom of the viewport
  // to prevent widgets from overlapping any part of the dock area.
  const reservedHeight = window.innerHeight - rect.top;

  // Clamp to fallback if reservedHeight is not usable (e.g. dock is off-screen)
  if (reservedHeight <= 0) {
    return fallbackHeight;
  }

  return reservedHeight;
};

export const calculateSnapBounds = (zone: SnapZone) => {
  // SSR Guard: return a safe fallback if window is not available
  if (typeof window === 'undefined') {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  const { PADDING, GAP, DOCK_HEIGHT } = SNAP_LAYOUT_CONSTANTS;
  const dockHeight = getDockReservedHeight(DOCK_HEIGHT);

  // Clamp safe dimensions to at least 0 to prevent negative bounds on tiny viewports
  const safeWidth = Math.max(0, window.innerWidth - PADDING * 2);
  const safeHeight = Math.max(0, window.innerHeight - dockHeight - PADDING * 2);

  // Calculate absolute positions
  const rawX = PADDING + zone.x * safeWidth;
  const rawY = PADDING + zone.y * safeHeight;
  const rawW = zone.w * safeWidth;
  const rawH = zone.h * safeHeight;

  return {
    // Add gap logic so adjacent widgets don't overlap
    x: Math.round(rawX + (zone.x > 0 ? GAP / 2 : 0)),
    y: Math.round(rawY + (zone.y > 0 ? GAP / 2 : 0)),
    w: Math.round(
      Math.max(
        0,
        rawW - (zone.x > 0 ? GAP / 2 : 0) - (zone.x + zone.w < 1 ? GAP / 2 : 0)
      )
    ),
    h: Math.round(
      Math.max(
        0,
        rawH - (zone.y > 0 ? GAP / 2 : 0) - (zone.y + zone.h < 1 ? GAP / 2 : 0)
      )
    ),
  };
};
