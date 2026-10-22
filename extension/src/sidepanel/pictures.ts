import {
  redactPixels,
  type RedactRect,
} from '@/components/widgets/GuidedLearning/utils/redactImage';
import type { Rect } from '../recorder/geometry';
import { MAX_PICTURE_CHARS } from '@/components/tours/web/recorderProtocol';

/** Pictures wider than this are scaled down before they leave the panel. */
const MAX_WIDTH = 1600;

const canvasOf = (w: number, h: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available.');
  return { canvas, ctx };
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode.'))),
      type,
      quality
    )
  );

/** Cuts the screenshot down to the target and its surroundings; the full screenshot is dropped after this. */
export async function cropScreenshot(
  screenshot: string,
  crop: Rect
): Promise<Blob> {
  const bitmap = await createImageBitmap(
    await (await fetch(screenshot)).blob()
  );
  try {
    const { canvas, ctx } = canvasOf(crop.width, crop.height);
    ctx.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );
    return await toBlob(canvas, 'image/png');
  } finally {
    bitmap.close();
  }
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(r.error ?? new Error('Could not read.'));
    r.readAsDataURL(blob);
  });

/** Blurs the boxes the admin drew, scales down and encodes as JPEG for sending. */
export async function finishPicture(
  cropped: Blob,
  blur: readonly RedactRect[]
): Promise<{ dataUrl: string; w: number; h: number }> {
  const bitmap = await createImageBitmap(cropped);
  try {
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const { canvas, ctx } = canvasOf(w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (blur.length) {
      const image = ctx.getImageData(0, 0, w, h);
      redactPixels(image, blur, 'blur');
      ctx.putImageData(image, 0, 0);
    }
    for (const quality of [0.85, 0.7, 0.5]) {
      const dataUrl = await blobToDataUrl(
        await toBlob(canvas, 'image/jpeg', quality)
      );
      if (dataUrl.length <= MAX_PICTURE_CHARS) return { dataUrl, w, h };
    }
    throw new Error('Picture is too large to send.');
  } finally {
    bitmap.close();
  }
}
