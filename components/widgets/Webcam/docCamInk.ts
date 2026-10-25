import type { PathObject } from '@/types';
import { renderPathPoints } from '@/components/widgets/DrawingWidget/renderers/dispatcher';
import { type DocCamView, type Size, mediaBox } from './docCamView';

export type InkTool = 'pen' | 'highlighter' | 'eraser';

export const INK_COLORS = [
  { id: 'red', label: 'Red', value: '#dc2626' },
  { id: 'blue', label: 'Blue', value: '#2563eb' },
  { id: 'black', label: 'Black', value: '#0f172a' },
  { id: 'green', label: 'Green', value: '#16a34a' },
] as const;

export const HIGHLIGHTER_COLOR = 'rgba(250, 204, 21, 0.4)';

// Stroke widths as a share of the camera frame's shorter side, so ink scales with the paper.
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

/** What the ink sits on: the feed box, the camera frame and the current view. */
export interface InkFrame {
  feed: Size;
  source: Size;
  view: DocCamView;
  mirrored: boolean;
}

export const inkFrameReady = (f: InkFrame): boolean =>
  f.feed.width > 0 &&
  f.feed.height > 0 &&
  f.source.width > 0 &&
  f.source.height > 0;

const coverOf = (f: InkFrame) => {
  const box = mediaBox(f.view.rotation, f.feed);
  return Math.max(box.width / f.source.width, box.height / f.source.height);
};

/** Feed pixel to the 0-1 camera-frame space strokes are stored in, so ink stays on the paper through zoom, turns and resizes. */
export function feedToInk(x: number, y: number, f: InkFrame) {
  const c = coverOf(f);
  const a = (-f.view.rotation * Math.PI) / 180;
  const px = (x - f.feed.width / 2 - f.view.panX) / f.view.zoom;
  const py = (y - f.feed.height / 2 - f.view.panY) / f.view.zoom;
  const rx = px * Math.cos(a) - py * Math.sin(a);
  const ry = px * Math.sin(a) + py * Math.cos(a);
  return {
    x: (f.mirrored ? -rx : rx) / c / f.source.width + 0.5,
    y: ry / c / f.source.height + 0.5,
  };
}

/** Camera-frame point (0-1) back to feed pixels under the current view. */
export function inkToFeed(p: { x: number; y: number }, f: InkFrame) {
  const c = coverOf(f);
  const a = (f.view.rotation * Math.PI) / 180;
  const sx = (p.x - 0.5) * f.source.width * c * (f.mirrored ? -1 : 1);
  const sy = (p.y - 0.5) * f.source.height * c;
  return {
    x:
      (sx * Math.cos(a) - sy * Math.sin(a)) * f.view.zoom +
      f.view.panX +
      f.feed.width / 2,
    y:
      (sx * Math.sin(a) + sy * Math.cos(a)) * f.view.zoom +
      f.view.panY +
      f.feed.height / 2,
  };
}

/** Paints strokes stored in camera-frame space onto a context already mapped to feed pixels. */
export function paintInk(
  ctx: CanvasRenderingContext2D,
  strokes: readonly PathObject[],
  f: InkFrame
): void {
  if (!inkFrameReady(f)) return;
  const unit =
    Math.min(f.source.width, f.source.height) * coverOf(f) * f.view.zoom;
  for (const stroke of strokes) {
    renderPathPoints(
      ctx,
      stroke.points.map((p) => inkToFeed(p, f)),
      stroke.color,
      Math.max(1, stroke.width * unit)
    );
  }
}
