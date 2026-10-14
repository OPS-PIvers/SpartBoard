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

/** Paints the locked starting page in page units onto a scaled bitmap context. */
export const paintWhiteboardStartingPage = (
  ctx: CanvasRenderingContext2D,
  spec: WhiteboardStartingPage,
  image?: CanvasImageSource | null,
  ratio: number = WHITEBOARD_PIXEL_RATIO
): void => {
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawStartingPage(ctx, spec, image);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

/** Paints ink in page space onto a scaled bitmap context; eraser strokes only cut ink. */
export const paintWhiteboardInk = (
  ctx: CanvasRenderingContext2D,
  objects: readonly DrawableObject[],
  ratio: number = WHITEBOARD_PIXEL_RATIO
): void => {
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  [...objects].sort((a, b) => a.z - b.z).forEach((o) => renderObject(ctx, o));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

const makeCanvas = (ratio: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WHITEBOARD_PAGE.w * ratio);
  canvas.height = Math.round(WHITEBOARD_PAGE.h * ratio);
  return canvas;
};

const renderAt = async (
  objects: readonly DrawableObject[],
  startingPage: WhiteboardStartingPage,
  startingImage: CanvasImageSource | null | undefined,
  ratio: number
): Promise<Blob> => {
  const page = makeCanvas(ratio);
  const pageCtx = page.getContext('2d');
  const ink = makeCanvas(ratio);
  const inkCtx = ink.getContext('2d');
  if (!pageCtx || !inkCtx) throw new Error('Canvas is unavailable.');
  paintWhiteboardStartingPage(pageCtx, startingPage, startingImage, ratio);
  paintWhiteboardInk(inkCtx, objects, ratio);
  pageCtx.drawImage(ink, 0, 0);
  return new Promise((resolve, reject) => {
    page.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed.'))),
      'image/png'
    );
  });
};

// Leaves headroom under the 10 MB upload cap; a photo page can exceed it at full size.
export const WHITEBOARD_PICTURE_TARGET_BYTES = 9 * 1024 * 1024;
const FALLBACK_RATIOS = [1.5, 1, 0.75] as const;

/** Final 3200x2400 picture, stepped down in size when a photo page pushes it past the cap. */
export const renderWhiteboardPicture = async (
  objects: readonly DrawableObject[],
  startingPage: WhiteboardStartingPage,
  startingImage?: CanvasImageSource | null
): Promise<Blob> => {
  let blob = await renderAt(
    objects,
    startingPage,
    startingImage,
    WHITEBOARD_PIXEL_RATIO
  );
  for (const ratio of FALLBACK_RATIOS) {
    if (blob.size <= WHITEBOARD_PICTURE_TARGET_BYTES) break;
    blob = await renderAt(objects, startingPage, startingImage, ratio);
  }
  return blob;
};
