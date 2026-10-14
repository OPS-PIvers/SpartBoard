import { STANDARD_COLORS } from '@/config/colors';

export type WhiteboardTool =
  'pen' | 'text' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse';

export type WhiteboardSize = 'thin' | 'medium' | 'thick';

export const WHITEBOARD_COLORS = [
  { hex: STANDARD_COLORS.slate, key: 'black' },
  { hex: STANDARD_COLORS.blue, key: 'blue' },
  { hex: STANDARD_COLORS.red, key: 'red' },
  { hex: STANDARD_COLORS.green, key: 'green' },
  { hex: STANDARD_COLORS.orange, key: 'orange' },
  { hex: STANDARD_COLORS.amber, key: 'yellow' },
] as const;
