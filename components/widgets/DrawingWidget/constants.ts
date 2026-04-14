import { WIDGET_PALETTE } from '@/config/colors';
import type { ShapeTool } from '@/types';

export const DRAWING_DEFAULTS = {
  WIDTH: 4,
  CUSTOM_COLORS: WIDGET_PALETTE.slice(0, 5),
  ACTIVE_TOOL: 'pen' as ShapeTool,
};
