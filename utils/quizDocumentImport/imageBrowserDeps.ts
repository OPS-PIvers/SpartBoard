/**
 * Photos of a test read as the pages of one document (R30). Each photo goes
 * through the paper-scan raster path, so orientation and scale match what the
 * answer-sheet scanner sees, then OCR; the PDF reader does the rest.
 */

import { rasterizeScan, type RasterizedPage } from '@/utils/paperScanRaster';
import type { RasterPage } from '@/utils/paperSheetReader';
import type { PdfReaderDeps } from './pdfReader';

/** Paint the page onto a canvas and hand tesseract a PNG; loaded on demand. */
export async function recognizeRasterPage(page: RasterPage): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  try {
    const image = ctx.createImageData(page.width, page.height);
    image.data.set(page.data);
    ctx.putImageData(image, 0, 0);
    const { default: Tesseract } = await import('tesseract.js');
    const result = await Tesseract.recognize(
      canvas.toDataURL('image/png'),
      'eng'
    );
    return result.data.text;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export interface ImageDepsSeams {
  rasterize?: (file: Blob) => AsyncGenerator<RasterizedPage>;
  recognize?: (page: RasterPage) => Promise<string>;
}

/** Reader deps where every page is a photo with no text layer, so all of it is OCR'd. */
export function browserImageDeps(
  photos: readonly Blob[],
  {
    rasterize = rasterizeScan,
    recognize = recognizeRasterPage,
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
      let text = '';
      for await (const page of rasterize(photo)) {
        text += `${await recognize(page.page)}\n`;
      }
      return text;
    },
  };
}
