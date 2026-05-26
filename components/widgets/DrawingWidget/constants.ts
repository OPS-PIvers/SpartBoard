import { STANDARD_COLORS, WIDGET_PALETTE } from '@/config/colors';

export const DRAWING_DEFAULTS = {
  WIDTH: 4,
  CUSTOM_COLORS: WIDGET_PALETTE.slice(0, 5),
  ACTIVE_TOOL: 'pen' as const,
  SHAPE_FILL: false,
  // Text tool defaults — used by both the canvas-side renderer and the
  // contenteditable overlay so a freshly-spawned TextObject and its editor
  // agree on font/size/color from the first keystroke.
  TEXT_FONT_FAMILY: 'Lexend, sans-serif',
  TEXT_FONT_SIZE_PX: 24,
  TEXT_COLOR: STANDARD_COLORS.slate,
  TEXT_PLACEHOLDER_W: 200,
  TEXT_PLACEHOLDER_H: 48,
  // Background template default (Phase 2 PR 2.5). Pages without an explicit
  // `background` field fall back to this value when rendering.
  BACKGROUND: 'blank' as const,
};
