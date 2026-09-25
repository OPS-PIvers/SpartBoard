/**
 * Turns a scanned file (PDF or image) into RGBA pages for `paperSheetReader`.
 *
 * Browser-only: pdf.js and canvas. Pages are yielded one at a time and the
 * caller must finish with a page before asking for the next, so a 150-sheet
 * stack never holds more than one rasterized page in memory (plan Q4).
 */

import type { PageViewport } from 'pdfjs-dist';
import type { RectMm } from './paperSheetLayout';
import {
  cropWrittenBox,
  type AffineMmToPx,
  type GrayCrop,
  type RasterPage,
  type RectPx,
} from './paperSheetReader';

/** Dots per inch pages are rasterized at; 200 keeps a 5 mm bubble ~40 px wide. */
export const SCAN_RASTER_DPI = 200;
/** pdf.js viewport scale is relative to 72 dpi. */
export const PDF_SCALE = SCAN_RASTER_DPI / 72;
/** Longest edge of a review crop, in pixels. */
export const CROP_MAX_EDGE_PX = 640;
/** Largest handwriting crop the Storage rule accepts (1F). */
export const WRITTEN_CROP_MAX_BYTES = 2 * 1024 * 1024;
/** WebP quality for handwriting crops; grayscale pencil stays legible well below 1. */
export const WRITTEN_CROP_QUALITY = 0.8;

export interface RasterizedPage {
  /** 1-based page in the file. */
  pageNumber: number;
  page: RasterPage;
  /** Crops a region of the page as a PNG data URL, while the page is live. */
  crop: (rect: RectPx) => string;
}

/** A canvas 2D surface, narrowed to what rasterizing needs; injectable for tests. */
export interface RasterSurface {
  width: number;
  height: number;
  getImageData: () => RasterPage;
  drawImage: (image: CanvasImageSource) => void;
  /** Let pdf.js draw straight onto the surface. */
  renderPdf: (page: PdfPageLike, viewport: PdfViewport) => Promise<void>;
  toDataUrl: (rect: RectPx, maxEdge: number) => string;
  release: () => void;
}

export interface RasterDeps {
  createSurface: (width: number, height: number) => RasterSurface;
  loadPdf: (file: Blob) => Promise<PdfDocumentLike>;
  loadImage: (file: Blob) => Promise<ImageBitmap>;
}

export type GrayEncoder = (crop: GrayCrop, quality: number) => Promise<Blob>;

export interface PdfViewport {
  width: number;
  height: number;
}

export interface PdfPageLike {
  getViewport: (opts: { scale: number }) => PdfViewport;
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    viewport: PdfViewport;
  }) => { promise: Promise<unknown> };
}

export interface PdfDocumentLike {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageLike>;
  destroy?: () => Promise<unknown> | void;
}

const isPdf = (file: Blob): boolean =>
  file.type === 'application/pdf' ||
  ('name' in file && /\.pdf$/i.test((file as File).name));

function domSurface(width: number, height: number): RasterSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  return {
    width,
    height,
    getImageData: () => ctx.getImageData(0, 0, width, height),
    drawImage: (image) => ctx.drawImage(image, 0, 0, width, height),
    renderPdf: async (page, viewport) => {
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    },
    toDataUrl: (rect, maxEdge) => {
      const scale = Math.min(1, maxEdge / Math.max(rect.w, rect.h, 1));
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(rect.w * scale));
      out.height = Math.max(1, Math.round(rect.h * scale));
      const octx = out.getContext('2d');
      if (!octx) return '';
      octx.drawImage(
        canvas,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        0,
        0,
        out.width,
        out.height
      );
      return out.toDataURL('image/png');
    },
    release: () => {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

async function domLoadPdf(file: Blob): Promise<PdfDocumentLike> {
  const bytes = await file.arrayBuffer();
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  // Scanners emit CCITT/JBIG2 pages, which pdf.js decodes in wasm served here.
  const task = pdfjs.getDocument({ data: bytes, wasmUrl: '/pdfjs-wasm/' });
  const doc = await task.promise;
  return {
    numPages: doc.numPages,
    getPage: async (n) => {
      const page = await doc.getPage(n);
      return {
        getViewport: (opts) => page.getViewport(opts),
        // The viewport handed back is the one getViewport returned above.
        render: (opts) =>
          page.render({ ...opts, viewport: opts.viewport as PageViewport }),
      };
    },
    destroy: () => task.destroy(),
  };
}

/** Canvas WebP encode; a browser without a WebP encoder hands back PNG, which Storage also accepts. */
function domEncodeGray(crop: GrayCrop, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is unavailable.'));
  const image = ctx.createImageData(crop.width, crop.height);
  for (let i = 0; i < crop.data.length; i += 1) {
    const o = i * 4;
    image.data[o] = crop.data[i];
    image.data[o + 1] = crop.data[i];
    image.data[o + 2] = crop.data[i];
    image.data[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (blob) resolve(blob);
        else reject(new Error('Could not encode the handwriting crop.'));
      },
      'image/webp',
      quality
    );
  });
}

/** Half-size box downsample, for the rare crop that encodes past the Storage cap. */
function halve(crop: GrayCrop): GrayCrop {
  const width = Math.max(1, Math.floor(crop.width / 2));
  const height = Math.max(1, Math.floor(crop.height / 2));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (dx: number, dy: number) =>
        crop.data[
          Math.min(crop.height - 1, y * 2 + dy) * crop.width +
            Math.min(crop.width - 1, x * 2 + dx)
        ];
      data[y * width + x] = (at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) >> 2;
    }
  }
  return { width, height, data };
}

/** Encode a crop under `WRITTEN_CROP_MAX_BYTES`, halving its resolution until it fits. */
export async function encodeWrittenCrop(
  crop: GrayCrop,
  encode: GrayEncoder = domEncodeGray
): Promise<Blob> {
  let current = crop;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const blob = await encode(current, WRITTEN_CROP_QUALITY);
    if (blob.size <= WRITTEN_CROP_MAX_BYTES) return blob;
    current = halve(current);
  }
  throw new Error('The handwriting crop is too large to upload.');
}

/**
 * The handwriting in one box as an upload-ready blob (D21): deskewed, upright,
 * grayscale, ~150 dpi. Call it for every box, blank ones too (D22), with the
 * `mmToPx` of the read that found it.
 */
export function cropWrittenBlob(
  page: RasterPage,
  mmToPx: AffineMmToPx,
  boxMm: RectMm,
  encode: GrayEncoder = domEncodeGray
): Promise<Blob> {
  return encodeWrittenCrop(cropWrittenBox(page, mmToPx, boxMm), encode);
}

export const domRasterDeps: RasterDeps = {
  createSurface: domSurface,
  loadPdf: domLoadPdf,
  loadImage: (file) => createImageBitmap(file),
};

function pageFromSurface(
  surface: RasterSurface,
  pageNumber: number
): RasterizedPage {
  return {
    pageNumber,
    page: surface.getImageData(),
    crop: (rect) => surface.toDataUrl(rect, CROP_MAX_EDGE_PX),
  };
}

/** Yield each page of a scan; the previous page is released when the next is asked for. */
export async function* rasterizeScan(
  file: Blob,
  deps: RasterDeps = domRasterDeps
): AsyncGenerator<RasterizedPage> {
  if (!isPdf(file)) {
    const image = await deps.loadImage(file);
    const surface = deps.createSurface(image.width, image.height);
    try {
      surface.drawImage(image);
      yield pageFromSurface(surface, 1);
    } finally {
      surface.release();
      image.close?.();
    }
    return;
  }

  const pdf = await deps.loadPdf(file);
  try {
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const pdfPage = await pdf.getPage(n);
      const viewport = pdfPage.getViewport({ scale: PDF_SCALE });
      const surface = deps.createSurface(
        Math.round(viewport.width),
        Math.round(viewport.height)
      );
      try {
        await surface.renderPdf(pdfPage, viewport);
        yield pageFromSurface(surface, n);
      } finally {
        surface.release();
      }
    }
  } finally {
    await pdf.destroy?.();
  }
}
