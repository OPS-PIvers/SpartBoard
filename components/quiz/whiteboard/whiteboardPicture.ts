import type { DrawableObject } from '@/types';
import { renderObject } from '@/components/widgets/DrawingWidget/renderers/dispatcher';
import {
  WHITEBOARD_BITMAP_SCALE,
  WHITEBOARD_PAGE_HEIGHT,
  WHITEBOARD_PAGE_WIDTH,
  drawStartingPage,
} from '@/utils/whiteboard/startingPage';
import type { WhiteboardStartingPage } from '@/types';

export const WHITEBOARD_PAGE = {
  w: WHITEBOARD_PAGE_WIDTH,
  h: WHITEBOARD_PAGE_HEIGHT,
} as const;
export const WHITEBOARD_PIXEL_RATIO = WHITEBOARD_BITMAP_SCALE;

/** Paints the locked starting page in page units onto a 2x bitmap context. */
export const paintWhiteboardStartingPage = (
  ctx: CanvasRenderingContext2D,
  spec: WhiteboardStartingPage,
  image?: CanvasImageSource | null
): void => {
  ctx.setTransform(WHITEBOARD_PIXEL_RATIO, 0, 0, WHITEBOARD_PIXEL_RATIO, 0, 0);
  drawStartingPage(ctx, spec, image);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

/** Paints ink in page space onto a 2x bitmap context; eraser strokes only cut ink. */
export const paintWhiteboardInk = (
  ctx: CanvasRenderingContext2D,
  objects: readonly DrawableObject[]
): void => {
  ctx.setTransform(WHITEBOARD_PIXEL_RATIO, 0, 0, WHITEBOARD_PIXEL_RATIO, 0, 0);
  [...objects].sort((a, b) => a.z - b.z).forEach((o) => renderObject(ctx, o));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = WHITEBOARD_PAGE.w * WHITEBOARD_PIXEL_RATIO;
  canvas.height = WHITEBOARD_PAGE.h * WHITEBOARD_PIXEL_RATIO;
  return canvas;
};

/** Final 3200x2400 picture: starting page underneath, ink composited on top. */
export const renderWhiteboardPicture = async (
  objects: readonly DrawableObject[],
  startingPage: WhiteboardStartingPage,
  startingImage?: CanvasImageSource | null
): Promise<Blob> => {
  const page = makeCanvas();
  const pageCtx = page.getContext('2d');
  const ink = makeCanvas();
  const inkCtx = ink.getContext('2d');
  if (!pageCtx || !inkCtx) throw new Error('Canvas is unavailable.');
  paintWhiteboardStartingPage(pageCtx, startingPage, startingImage);
  paintWhiteboardInk(inkCtx, objects);
  pageCtx.drawImage(ink, 0, 0);
  return new Promise((resolve, reject) => {
    page.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed.'))),
      'image/png'
    );
  });
};
