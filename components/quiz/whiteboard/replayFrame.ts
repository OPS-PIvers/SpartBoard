import type { DrawableObject } from '@/types';
import { renderObject } from '@/components/widgets/DrawingWidget/renderers/dispatcher';

export const PAGE_W = 1600;
export const PAGE_H = 1200;

export interface ReplayMarker {
  id: string;
  ms: number;
  active?: boolean;
}

/** One replay frame: page and starting page, then the ink layer so pixel erasing never cuts the background. */
export const paintReplayFrame = (
  ctx: CanvasRenderingContext2D,
  background: HTMLCanvasElement | null,
  ink: HTMLCanvasElement,
  objects: readonly DrawableObject[],
  scale: number
): void => {
  const { width, height } = ctx.canvas;
  if (ink.width !== width) ink.width = width;
  if (ink.height !== height) ink.height = height;
  const inkCtx = ink.getContext('2d');
  if (inkCtx) {
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.clearRect(0, 0, width, height);
    inkCtx.setTransform(scale, 0, 0, scale, 0, 0);
    const sorted = [...objects].sort((a, b) => a.z - b.z);
    for (const obj of sorted) renderObject(inkCtx, obj);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  if (background) ctx.drawImage(background, 0, 0, width, height);
  ctx.drawImage(ink, 0, 0);
};
