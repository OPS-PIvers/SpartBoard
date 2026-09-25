/** Pictures inside an RTF: PNG and JPEG as they are, a metafile when it wraps one bitmap (QUIZ_EXAMVIEW_IMPORT.md E11). */

import type { ExtractedImage } from './types';

export type RtfPictureKind = 'png' | 'jpeg' | 'wmf' | 'emf' | 'other';

/** A `\pict` group's bytes, anchored to a line by `id`. */
export interface RtfPicture {
  id: string;
  kind: RtfPictureKind;
  bytes: Uint8Array;
}

/** Turns a Windows bitmap file into a PNG; the browser's lives in `browserBmpToPng`. */
export type BmpToPng = (bmp: Blob) => Promise<Blob>;

const META_STRETCHDIB = 0x0f43;
const META_DIBSTRETCHBLT = 0x0b41;
const META_DIBBITBLT = 0x0940;
const EMR_STRETCHDIBITS = 81;
const EMR_EOF = 14;

/** Records that only set up drawing state, so a metafile of them plus one bitmap is still "just a bitmap". */
const WMF_STATE_RECORDS = new Set([
  0x0102, 0x0103, 0x0104, 0x0105, 0x0106, 0x0107, 0x0108, 0x012e, 0x0201,
  0x0209, 0x020a, 0x020b, 0x020c, 0x020d, 0x020e, 0x001e, 0x0127, 0x012d,
  0x01f0, 0x02fa, 0x02fc, 0x0415, 0x0416, 0x0626,
]);
const BITMAP_WMF_RECORDS = new Set([
  META_STRETCHDIB,
  META_DIBSTRETCHBLT,
  META_DIBBITBLT,
]);

/** Where the DIB starts inside each bitmap record, counted from the record's start. */
const WMF_DIB_OFFSET: Record<number, number> = {
  [META_STRETCHDIB]: 28,
  [META_DIBSTRETCHBLT]: 26,
  [META_DIBBITBLT]: 22,
};

/** The packed DIB (header, colours, pixels) of a metafile that holds one bitmap, or null. */
export function wmfBitmap(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 18) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // A placeable metafile starts with its own 22-byte header.
  const start = view.getUint32(0, true) === 0x9ac6cdd7 ? 22 : 0;
  if (start + 6 > bytes.length) return null;
  const headerWords = view.getUint16(start + 2, true);
  let offset = start + headerWords * 2;
  let dib: Uint8Array | null = null;
  while (offset + 6 <= bytes.length) {
    const words = view.getUint32(offset, true);
    const fn = view.getUint16(offset + 4, true);
    if (fn === 0 || words < 3) break;
    const end = Math.min(offset + words * 2, bytes.length);
    if (BITMAP_WMF_RECORDS.has(fn)) {
      // A second bitmap means a composed picture, which isn't one image.
      if (dib) return null;
      const at = offset + WMF_DIB_OFFSET[fn];
      if (at >= end) return null;
      dib = bytes.subarray(at, end);
    } else if (!WMF_STATE_RECORDS.has(fn)) {
      return null;
    }
    offset += words * 2;
  }
  return dib;
}

/** The DIB of an enhanced metafile whose only drawing is one `EMR_STRETCHDIBITS`, or null. */
export function emfBitmap(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let dib: Uint8Array | null = null;
  while (offset + 8 <= bytes.length) {
    const type = view.getUint32(offset, true);
    const size = view.getUint32(offset + 4, true);
    if (size < 8 || offset + size > bytes.length) return null;
    if (type === EMR_STRETCHDIBITS) {
      if (dib || size < 80) return null;
      const offBmi = view.getUint32(offset + 48, true);
      const cbBmi = view.getUint32(offset + 52, true);
      const offBits = view.getUint32(offset + 56, true);
      const cbBits = view.getUint32(offset + 60, true);
      if (offBmi + cbBmi > size || offBits + cbBits > size) return null;
      const packed = new Uint8Array(cbBmi + cbBits);
      packed.set(bytes.subarray(offset + offBmi, offset + offBmi + cbBmi));
      packed.set(
        bytes.subarray(offset + offBits, offset + offBits + cbBits),
        cbBmi
      );
      dib = packed;
    } else if (type === EMR_EOF) {
      break;
    } else if (
      type !== 1 &&
      !(type >= 9 && type <= 40 && type !== 15) &&
      type !== 70
    ) {
      // Header, state and comment records are fine; any other drawing is vector art.
      return null;
    }
    offset += size;
  }
  return dib;
}

/** A packed DIB with a `BITMAPFILEHEADER` in front, which browsers decode as BMP. */
export function dibToBmp(dib: Uint8Array): Uint8Array | null {
  if (dib.length < 12) return null;
  const view = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const headerSize = view.getUint32(0, true);
  // Every real DIB header is 12 bytes or 40 and up.
  if ((headerSize !== 12 && headerSize < 40) || headerSize > dib.length)
    return null;
  let colors = 0;
  let masks = 0;
  if (headerSize === 12) {
    const bpp = view.getUint16(10, true);
    colors = bpp <= 8 ? (1 << bpp) * 3 : 0;
  } else {
    const bpp = view.getUint16(14, true);
    const compression = view.getUint32(16, true);
    const used = headerSize >= 36 ? view.getUint32(32, true) : 0;
    colors = (used || (bpp <= 8 ? 1 << bpp : 0)) * 4;
    // BI_BITFIELDS keeps its three masks after a 40-byte header.
    if (headerSize === 40 && compression === 3) masks = 12;
  }
  const bmp = new Uint8Array(14 + dib.length);
  const out = new DataView(bmp.buffer);
  out.setUint8(0, 0x42);
  out.setUint8(1, 0x4d);
  out.setUint32(2, bmp.length, true);
  out.setUint32(10, 14 + headerSize + masks + colors, true);
  bmp.set(dib, 14);
  return bmp;
}

/** Bytes a browser can show, as PNG or JPEG after conversion, or null for vector-only art. */
async function pictureImage(
  picture: RtfPicture,
  toPng: BmpToPng
): Promise<ExtractedImage | null> {
  const blobOf = (bytes: Uint8Array, type: string) =>
    new Blob([bytes as BlobPart], { type });
  if (picture.kind === 'png' || picture.kind === 'jpeg') {
    const contentType = picture.kind === 'png' ? 'image/png' : 'image/jpeg';
    return {
      id: picture.id,
      blob: blobOf(picture.bytes, contentType),
      contentType,
      name: `${picture.id}.${picture.kind === 'png' ? 'png' : 'jpg'}`,
    };
  }
  const dib =
    picture.kind === 'wmf'
      ? wmfBitmap(picture.bytes)
      : picture.kind === 'emf'
        ? emfBitmap(picture.bytes)
        : null;
  const bmp = dib ? dibToBmp(dib) : null;
  if (!bmp) return null;
  try {
    const png = await toPng(blobOf(bmp, 'image/bmp'));
    return {
      id: picture.id,
      blob: png,
      contentType: 'image/png',
      name: `${picture.id}.png`,
    };
  } catch (err) {
    console.warn('[quizDocumentImport] RTF picture conversion failed', err);
    return null;
  }
}

/** The pictures a browser can show, and the ids of those it can't. */
export async function rtfPictureImages(
  pictures: readonly RtfPicture[],
  toPng: BmpToPng
): Promise<{ images: ExtractedImage[]; unreadable: Set<string> }> {
  const images: ExtractedImage[] = [];
  const unreadable = new Set<string>();
  for (const picture of pictures) {
    // A damaged picture costs its own question a warning, never the whole read.
    const image = await pictureImage(picture, toPng).catch(() => null);
    if (image) images.push(image);
    else unreadable.add(picture.id);
  }
  return { images, unreadable };
}

/** Decodes a BMP with the browser's own image decoder and re-encodes it as PNG. */
export const browserBmpToPng: BmpToPng = async (bmp) => {
  const bitmap = await createImageBitmap(bmp);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('PNG encoding failed.')),
        'image/png'
      )
    );
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
};
