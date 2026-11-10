import type { RedactRect } from '@/components/widgets/GuidedLearning/utils/redactImage';
import type { UnitRect } from './pictureCrop';

/** Pictures uploaded for a step: the types Storage rules take. */
export const STEP_PICTURE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export type StepPictureType = (typeof STEP_PICTURE_TYPES)[number];

export const isStepPictureType = (t: string): t is StepPictureType =>
  (STEP_PICTURE_TYPES as readonly string[]).includes(t);

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode.'))),
      type,
      quality
    )
  );

/** A picture's pixel size. */
export async function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { w: bitmap.width, h: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** Cuts `rect` (0-1 of the picture) out of a picture, as a JPEG. */
export async function cropImage(
  blob: Blob,
  rect: UnitRect
): Promise<{ blob: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    const sx = Math.round(rect.x * bitmap.width);
    const sy = Math.round(rect.y * bitmap.height);
    const w = Math.max(1, Math.round(rect.w * bitmap.width));
    const h = Math.max(1, Math.round(rect.h * bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.drawImage(bitmap, sx, sy, w, h, 0, 0, w, h);
    return { blob: await toBlob(canvas, 'image/jpeg', 0.9), w, h };
  } finally {
    bitmap.close();
  }
}

/** Blur boxes drawn on a picture (percent of it), moved onto the capture it was cut from. */
export const blurInBase = (
  boxes: readonly RedactRect[],
  crop: UnitRect
): RedactRect[] =>
  boxes.map((b) => ({
    ...b,
    xPct: crop.x * 100 + b.xPct * crop.w,
    yPct: crop.y * 100 + b.yPct * crop.h,
    wPct: b.wPct * crop.w,
    hPct: b.hPct * crop.h,
  }));
