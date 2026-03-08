import { SnapZone } from '../config/snapLayouts';

export const SNAP_LAYOUT_CONSTANTS = {
  PADDING: 16, // Gap from edges of the screen
  GAP: 12, // Gap between widgets (slightly larger for touch)
  DOCK_HEIGHT: 100, // Reserved space for the bottom dock
};

const getDockReservedHeight = (fallbackHeight: number): number => {
  if (typeof document === 'undefined') {
    return fallbackHeight;
  }
  const dockElement = document.querySelector<HTMLElement>(
    '[data-testid="dock"]'
  );
  if (!dockElement) {
    return fallbackHeight;
  }
  const rect = dockElement.getBoundingClientRect();
  return rect.height || fallbackHeight;
};

export const calculateSnapBounds = (zone: SnapZone) => {
  const { PADDING, GAP, DOCK_HEIGHT } = SNAP_LAYOUT_CONSTANTS;
  const dockHeight = getDockReservedHeight(DOCK_HEIGHT);

  const safeWidth = window.innerWidth - PADDING * 2;
  const safeHeight = window.innerHeight - dockHeight - PADDING * 2;

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
      rawW - (zone.x > 0 ? GAP / 2 : 0) - (zone.x + zone.w < 1 ? GAP / 2 : 0)
    ),
    h: Math.round(
      rawH - (zone.y > 0 ? GAP / 2 : 0) - (zone.y + zone.h < 1 ? GAP / 2 : 0)
    ),
  };
};
