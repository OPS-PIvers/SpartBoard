/**
 * One page of a PDF, turned into a PNG the answer sheet can print
 * (docs/plans/shipped/QUIZ_PAPER_SHEET_STIMULI.md D7).
 *
 * Rendering happens here, once, when the teacher picks the page, so printing
 * never loads pdf.js: by the time a sheet goes out, the stimulus is an
 * ordinary image in their Drive.
 */

import { pageContentBounds } from './pageContentBounds';

/** pdf.js viewport scale is relative to 72 dpi; 200 dpi is what a copier wants. */
export const PDF_RENDER_DPI = 200;
const PDF_SCALE = PDF_RENDER_DPI / 72;

export interface RenderedPdfPage {
  blob: Blob;
  widthPx: number;
  heightPx: number;
}

export interface PdfPages {
  pageCount: number;
  render: (pageNumber: number) => Promise<RenderedPdfPage>;
  /** The page cut to its inked part, for a printed copy; null when the page is blank. */
  renderTrimmed: (pageNumber: number) => Promise<RenderedPdfPage | null>;
  close: () => void;
}

/** What the stimulus is called once a page of `fileName` becomes one. */
export function pdfPageLabel(
  fileName: string,
  pageNumber: number,
  pageCount: number
): string {
  const stem = fileName.replace(/\.pdf$/i, '');
  return pageCount === 1 ? stem : `${stem} — page ${pageNumber}`;
}

/** The file name the page is uploaded under; Drive keeps no PDF of its own. */
export function pdfPageFileName(fileName: string, pageNumber: number): string {
  const stem = fileName.replace(/\.pdf$/i, '').replace(/[^\w.-]+/g, '_');
  return `${stem}-p${pageNumber}.png`;
}

export function isPdf(file: Blob & { name?: string }): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
}

/** Paper kept around a trimmed page, about 3mm at the render size. */
const TRIM_PAD_PX = Math.round((PDF_RENDER_DPI / 25.4) * 3);

/** The page cut to its inked part on white; null when the page is blank. */
function trimmedCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): HTMLCanvasElement | null {
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const r = pageContentBounds(data, canvas.width, canvas.height, TRIM_PAD_PX);
  if (!r) return null;
  const out = document.createElement('canvas');
  out.width = r.w;
  out.height = r.h;
  const octx = out.getContext('2d');
  if (!octx) return canvas;
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, r.w, r.h);
  octx.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return out;
}

/** Open a PDF for page picking. The caller closes it when the modal goes. */
export async function openPdfPages(file: Blob): Promise<PdfPages> {
  const bytes = await file.arrayBuffer();
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  // Scanners emit CCITT/JBIG2 pages, which pdf.js decodes in wasm served here.
  const task = pdfjs.getDocument({ data: bytes, wasmUrl: '/pdfjs-wasm/' });
  const doc = await task.promise;

  const draw = async (
    pageNumber: number,
    trim: boolean
  ): Promise<RenderedPdfPage | null> => {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: PDF_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');
    let out: HTMLCanvasElement | null = canvas;
    try {
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      if (trim) out = trimmedCanvas(canvas, ctx);
      if (!out) return null;
      const target = out;
      const blob = await new Promise<Blob | null>((resolve) =>
        target.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('Could not read that page as an image.');
      return { blob, widthPx: out.width, heightPx: out.height };
    } finally {
      for (const c of new Set([canvas, out])) {
        if (!c) continue;
        c.width = 0;
        c.height = 0;
      }
    }
  };

  return {
    pageCount: doc.numPages,
    render: async (pageNumber) => {
      const page = await draw(pageNumber, false);
      if (!page) throw new Error('Could not read that page as an image.');
      return page;
    },
    renderTrimmed: (pageNumber) => draw(pageNumber, true),
    close: () => void task.destroy(),
  };
}
