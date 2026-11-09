/**
 * Browser wiring for the PDF reader: pdf.js for the text layer, and tesseract
 * for a page that was scanned rather than typed. Kept apart from
 * `pdfReader.ts` so the line grouping and the text-layer-vs-OCR decision stay
 * testable without a real PDF, the same split `utils/paperScanRaster.ts` uses.
 */

import type { OcrLine, OcrPage } from './pdfLayout';
import {
  readPageText,
  type PdfReaderDeps,
  type PdfTextItem,
} from './pdfReader';
import { inlineImagesOnPage, picturesOnPage } from './pdfPictures';

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
  // Font names are how a bold answer is told from the rest.
  const task = pdfjs.getDocument({
    data: bytes,
    wasmUrl: '/pdfjs-wasm/',
    fontExtraProperties: true,
  });
  const doc = await task.promise;
  return { doc, task, ops: pdfjs.OPS };
}

/** How many pages a PDF has, without reading any of them. */
export async function pdfPageCount(file: Blob): Promise<number> {
  const { doc, task } = await loadPdfDocument(file);
  const count = doc.numPages;
  await task.destroy();
  return count;
}

/** Paint one page and hand tesseract a PNG; both are loaded on demand. */
async function ocrPage(
  doc: LoadedPdf['doc'],
  pageNumber: number
): Promise<OcrPage> {
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
    const worker = await Tesseract.createWorker('eng');
    try {
      // `blocks` is off by default; it carries the word boxes the layout needs (R3).
      const result = await worker.recognize(
        canvas.toDataURL('image/png'),
        {},
        { blocks: true }
      );
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
      return { lines, height: canvas.height, scale: OCR_SCALE };
    } finally {
      await worker.terminate();
    }
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
  const { doc, task, ops } = await loadPdfDocument(file);
  return {
    loadPdf: () =>
      Promise.resolve({
        numPages: doc.numPages,
        getPage: async (n) => {
          const page = await doc.getPage(n);
          return {
            height: page.getViewport({ scale: 1 }).height,
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
                  ...(typeof candidate.width === 'number'
                    ? { width: candidate.width }
                    : {}),
                  ...(typeof candidate.height === 'number'
                    ? { height: candidate.height }
                    : {}),
                  ...(typeof candidate.fontName === 'string'
                    ? { fontName: candidate.fontName }
                    : {}),
                });
              }
              return readPageText(page, items, {
                ops,
                pageWidth: page.getViewport({ scale: 1 }).width,
              });
            },
            getPictures: async (items) => {
              const viewport = page.getViewport({ scale: 1 });
              const list = await page.getOperatorList();
              return {
                viewport,
                pictures: picturesOnPage(list, ops, viewport, items),
                inline: inlineImagesOnPage(list, ops, viewport),
              };
            },
          };
        },
        destroy: () => task.destroy(),
      }),
    recognizePage: (n) => ocrPage(doc, n),
  };
}
