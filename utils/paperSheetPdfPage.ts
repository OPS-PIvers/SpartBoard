/**
 * One page of a PDF, turned into a PNG the answer sheet can print
 * (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D7).
 *
 * Rendering happens here, once, when the teacher picks the page, so printing
 * never loads pdf.js: by the time a sheet goes out, the stimulus is an
 * ordinary image in their Drive.
 */

/** pdf.js viewport scale is relative to 72 dpi; 200 dpi is what a copier wants. */
export const PDF_RENDER_DPI = 200;
const PDF_SCALE = PDF_RENDER_DPI / 72;
/** More pages than a teacher would page through; the picker lists this many. */
export const MAX_PDF_PAGES_LISTED = 60;

export interface RenderedPdfPage {
  blob: Blob;
  widthPx: number;
  heightPx: number;
}

export interface PdfPages {
  pageCount: number;
  render: (pageNumber: number) => Promise<RenderedPdfPage>;
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

  return {
    pageCount: doc.numPages,
    render: async (pageNumber) => {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable in this browser.');
      try {
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (!blob) throw new Error('Could not read that page as an image.');
        return { blob, widthPx: canvas.width, heightPx: canvas.height };
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
    close: () => void task.destroy(),
  };
}
