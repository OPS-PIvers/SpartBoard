/**
 * Photos of a test read as the pages of one document (R30). Each photo goes
 * through the paper-scan raster path, so orientation and scale match what the
 * answer-sheet scanner sees, then OCR with word boxes (R3); the PDF reader
 * does the rest.
 */

import { rasterizeScan, type RasterizedPage } from '@/utils/paperScanRaster';
import type { RasterPage } from '@/utils/paperSheetReader';
import type { OcrLine, OcrPage } from './pdfLayout';
import type { PdfReaderDeps } from './pdfReader';

/** A photo's pixels per point, taking the page to be letter width (8.5 in). */
const LETTER_WIDTH_PT = 612;

async function withPageCanvas<T>(
  page: RasterPage,
  run: (dataUrl: string) => Promise<T>
): Promise<T> {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  try {
    const image = ctx.createImageData(page.width, page.height);
    image.data.set(page.data);
    ctx.putImageData(image, 0, 0);
    return await run(canvas.toDataURL('image/png'));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Plain OCR text of a page; tesseract is loaded on demand. */
export async function recognizeRasterPage(page: RasterPage): Promise<string> {
  return withPageCanvas(page, async (dataUrl) => {
    const { default: Tesseract } = await import('tesseract.js');
    const result = await Tesseract.recognize(dataUrl, 'eng');
    return result.data.text;
  });
}

/** OCR with word boxes, so a photo's columns become segments like a PDF's (R3). */
export async function recognizeRasterLayout(
  page: RasterPage
): Promise<OcrPage> {
  return withPageCanvas(page, async (dataUrl) => {
    const { default: Tesseract } = await import('tesseract.js');
    const worker = await Tesseract.createWorker('eng');
    try {
      const result = await worker.recognize(dataUrl, {}, { blocks: true });
      const lines: OcrLine[] = [];
      for (const block of result.data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            lines.push({
              bbox: line.bbox,
              words: line.words.map((w) => ({ text: w.text, bbox: w.bbox })),
            });
          }
        }
      }
      return {
        lines,
        height: page.height,
        scale: page.width / LETTER_WIDTH_PT,
      };
    } finally {
      await worker.terminate();
    }
  });
}

export interface ImageDepsSeams {
  rasterize?: (file: Blob) => AsyncGenerator<RasterizedPage>;
  recognize?: (page: RasterPage) => Promise<OcrPage | string>;
}

/** Reader deps where every page is a photo with no text layer, so all of it is OCR'd. */
export function browserImageDeps(
  photos: readonly Blob[],
  {
    rasterize = rasterizeScan,
    recognize = recognizeRasterLayout,
  }: ImageDepsSeams = {}
): PdfReaderDeps {
  return {
    loadPdf: () =>
      Promise.resolve({
        numPages: photos.length,
        getPage: () =>
          Promise.resolve({
            getTextContent: () => Promise.resolve({ items: [] }),
          }),
      }),
    recognizePage: async (n) => {
      const photo = photos[n - 1];
      if (!photo) return '';
      // A photo rasterizes to exactly one page.
      for await (const page of rasterize(photo)) {
        return recognize(page.page);
      }
      return '';
    },
  };
}
