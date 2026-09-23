/** A redaction rectangle in image-% (top-left origin). */
export interface RedactRect {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export type RedactMode = 'blur' | 'solid';

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Box-blur radius in natural px; three passes approximate a Gaussian. */
export const BLUR_RADIUS_PX = 16;
const BLUR_PASSES = 3;
/** The whole blur runs twice so text inside can't be recovered. */
const BLUR_ROUNDS = 2;
const SOLID_RGB = [30, 41, 59] as const;

interface PxRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function toPxRect(r: RedactRect, width: number, height: number): PxRect {
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  const x0 = clamp(
    Math.floor((Math.min(r.xPct, r.xPct + r.wPct) / 100) * width),
    width
  );
  const y0 = clamp(
    Math.floor((Math.min(r.yPct, r.yPct + r.hPct) / 100) * height),
    height
  );
  const x1 = clamp(
    Math.ceil((Math.max(r.xPct, r.xPct + r.wPct) / 100) * width),
    width
  );
  const y1 = clamp(
    Math.ceil((Math.max(r.yPct, r.yPct + r.hPct) / 100) * height),
    height
  );
  return { x0, y0, x1, y1 };
}

// One separable box-blur pass along a row or column, edges clamped to the rect.
function boxLine(
  data: Uint8ClampedArray,
  start: number,
  stride: number,
  len: number,
  radius: number,
  scratch: Float32Array
): void {
  for (let c = 0; c < 4; c++) {
    let sum = 0;
    const at = (i: number) =>
      data[start + Math.min(len - 1, Math.max(0, i)) * stride + c];
    for (let i = -radius; i <= radius; i++) sum += at(i);
    for (let i = 0; i < len; i++) {
      scratch[i] = sum / (radius * 2 + 1);
      sum += at(i + radius + 1) - at(i - radius);
    }
    for (let i = 0; i < len; i++) data[start + i * stride + c] = scratch[i];
  }
}

function blurRect(buf: PixelBuffer, r: PxRect, radius: number): void {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const scratch = new Float32Array(Math.max(w, h));
  const row = buf.width * 4;
  for (let round = 0; round < BLUR_ROUNDS; round++) {
    for (let pass = 0; pass < BLUR_PASSES; pass++) {
      for (let y = r.y0; y < r.y1; y++)
        boxLine(buf.data, y * row + r.x0 * 4, 4, w, radius, scratch);
      for (let x = r.x0; x < r.x1; x++)
        boxLine(buf.data, r.y0 * row + x * 4, row, h, radius, scratch);
    }
  }
}

function fillRect(buf: PixelBuffer, r: PxRect): void {
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const i = (y * buf.width + x) * 4;
      buf.data[i] = SOLID_RGB[0];
      buf.data[i + 1] = SOLID_RGB[1];
      buf.data[i + 2] = SOLID_RGB[2];
      buf.data[i + 3] = 255;
    }
  }
}

/** Blurs or fills each rect in place; pixels outside every rect are untouched. */
export function redactPixels(
  buf: PixelBuffer,
  rects: readonly RedactRect[],
  mode: RedactMode
): void {
  for (const rect of rects) {
    const r = toPxRect(rect, buf.width, buf.height);
    if (r.x1 <= r.x0 || r.y1 <= r.y0) continue;
    if (mode === 'solid') fillRect(buf, r);
    else blurRect(buf, r, BLUR_RADIUS_PX);
  }
}

/** Decodes a slide, redacts the rects at natural size and returns a PNG. */
export async function redactImage(
  blob: Blob,
  rects: readonly RedactRect[],
  { mode }: { mode: RedactMode }
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.drawImage(bitmap, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    redactPixels(image, rects, mode);
    ctx.putImageData(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (out) =>
          out ? resolve(out) : reject(new Error('Could not encode the image.')),
        'image/png'
      )
    );
  } finally {
    bitmap.close();
  }
}
