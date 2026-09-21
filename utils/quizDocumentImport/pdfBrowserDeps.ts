/**
 * Browser wiring for the PDF reader: pdf.js for the text layer, and tesseract
 * for a page that was scanned rather than typed. Kept apart from
 * `pdfReader.ts` so the line grouping and the text-layer-vs-OCR decision stay
 * testable without a real PDF, the same split `utils/paperScanRaster.ts` uses.
 */

import type { PdfReaderDeps, PdfTextItem } from './pdfReader';

/** pdf.js viewport scale is relative to 72 dpi; 200 dpi is what OCR wants. */
const OCR_SCALE = 200 / 72;

type LoadedPdf = Awaited<ReturnType<typeof loadPdfDocument>>;

async function loadPdfDocument(file: Blob) {
  const bytes = await file.arrayBuffer();
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  const task = pdfjs.getDocument({ data: bytes, wasmUrl: '/pdfjs-wasm/' });
  const doc = await task.promise;
  return { doc, task };
}

/** Paint one page and hand tesseract a PNG; both are loaded on demand. */
async function ocrPage(
  doc: LoadedPdf['doc'],
  pageNumber: number
): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: OCR_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  try {
    await page.render({
      canvasContext: ctx,
      canvas,
      viewport,
    }).promise;
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

/**
 * Deps for `readQuizDocument`. The document is opened once and shared between
 * the text pass and any OCR pass, so a scanned page isn't parsed twice.
 */
export async function browserPdfDeps(file: Blob): Promise<PdfReaderDeps> {
  const { doc, task } = await loadPdfDocument(file);
  return {
    loadPdf: () =>
      Promise.resolve({
        numPages: doc.numPages,
        getPage: async (n) => {
          const page = await doc.getPage(n);
          return {
            getTextContent: async () => {
              const content = await page.getTextContent();
              // pdf.js interleaves marked-content markers with the real
              // fragments; only the latter carry a position.
              const items: PdfTextItem[] = [];
              for (const entry of content.items) {
                const candidate = entry as Partial<PdfTextItem>;
                if (
                  typeof candidate.str !== 'string' ||
                  !Array.isArray(candidate.transform)
                ) {
                  continue;
                }
                items.push({
                  str: candidate.str,
                  transform: candidate.transform,
                });
              }
              return { items };
            },
          };
        },
        destroy: () => task.destroy(),
      }),
    recognizePage: (n) => ocrPage(doc, n),
  };
}
