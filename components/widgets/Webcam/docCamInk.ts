import type { PathObject } from '@/types';
import { renderPathPoints } from '@/components/widgets/DrawingWidget/renderers/dispatcher';
import type { Size } from './docCamView';

export type InkTool = 'pen' | 'highlighter' | 'eraser';

export const INK_COLORS = [
  { id: 'red', label: 'Red', value: '#dc2626' },
  { id: 'blue', label: 'Blue', value: '#2563eb' },
  { id: 'black', label: 'Black', value: '#0f172a' },
  { id: 'green', label: 'Green', value: '#16a34a' },
] as const;

export const HIGHLIGHTER_COLOR = 'rgba(250, 204, 21, 0.4)';

// Stroke widths as a share of the feed's shorter side, so ink keeps its weight when the widget resizes.
const TOOL_WIDTH: Record<InkTool, number> = {
  pen: 0.008,
  highlighter: 0.04,
  eraser: 0.05,
};

export const strokeStyleFor = (
  tool: InkTool,
  penColor: string
): { color: string; width: number } => ({
  color:
    tool === 'eraser'
      ? 'eraser'
      : tool === 'highlighter'
        ? HIGHLIGHTER_COLOR
        : penColor,
  width: TOOL_WIDTH[tool],
});

/** Feed point in pixels to the 0-1 space strokes are stored in. */
export const toInkPoint = (x: number, y: number, size: Size) => ({
  x: size.width ? x / size.width : 0,
  y: size.height ? y / size.height : 0,
});

/** Paints strokes stored in 0-1 feed space onto a context already mapped to feed pixels. */
export function paintInk(
  ctx: CanvasRenderingContext2D,
  strokes: readonly PathObject[],
  size: Size
): void {
  const minSide = Math.min(size.width, size.height);
  for (const stroke of strokes) {
    renderPathPoints(
      ctx,
      stroke.points.map((p) => ({
        x: p.x * size.width,
        y: p.y * size.height,
      })),
      stroke.color,
      Math.max(1, stroke.width * minSide)
    );
  }
}
