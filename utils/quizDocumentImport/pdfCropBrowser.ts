/**
 * Browser wiring for the figure cropper (D13): pdf.js paints the page, a
 * canvas takes the piece out. Kept apart from `pdfFigures.ts` so the pixel
 * maths stays testable without a real PDF.
 */

import type { PdfCropperDeps, PixelRect } from './pdfFigures';

/** pdf.js scale is relative to 72 dpi; 150 dpi keeps a diagram's labels legible. */
const CROP_SCALE = 150 / 72;

export async function browserPdfCropper(file: Blob): Promise<PdfCropperDeps> {
  const bytes = await file.arrayBuffer();
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  const task = pdfjs.getDocument({ data: bytes, wasmUrl: '/pdfjs-wasm/' });
  const doc = await task.promise;

  const viewportOf = async (page: number) =>
    (await doc.getPage(page)).getViewport({ scale: CROP_SCALE });

  return {
    pageCount: doc.numPages,
    pageSize: async (page) => {
      const viewport = await viewportOf(page);
      return {
        width: Math.ceil(viewport.width),
        height: Math.ceil(viewport.height),
      };
    },
    crop: async (page: number, rect: PixelRect) => {
      const pdfPage = await doc.getPage(page);
      const viewport = pdfPage.getViewport({ scale: CROP_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable in this browser.');
      try {
        await pdfPage.render({ canvasContext: ctx, canvas, viewport }).promise;
        const out = document.createElement('canvas');
        out.width = rect.width;
        out.height = rect.height;
        const outCtx = out.getContext('2d');
        if (!outCtx) throw new Error('Canvas is unavailable in this browser.');
        outCtx.drawImage(
          canvas,
          rect.left,
          rect.top,
          rect.width,
          rect.height,
          0,
          0,
          rect.width,
          rect.height
        );
        const blob = await new Promise<Blob | null>((resolve) =>
          out.toBlob(resolve, 'image/png')
        );
        out.width = 0;
        out.height = 0;
        if (!blob) throw new Error('The picture could not be saved.');
        return blob;
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
    destroy: () => task.destroy(),
  };
}
