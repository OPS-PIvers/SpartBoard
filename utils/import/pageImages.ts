/**
 * Turns a slide deck or PDF into one picture per page plus that page's text
 * (docs/plans/IMPORT.md D9), for the Notebook and Guided Learning imports.
 * PDFs render in the browser with pdf.js; PowerPoint and Google Slides go
 * through the teacher's Drive first and come back as a PDF.
 */

import type { PageViewport as PdfJsViewport } from 'pdfjs-dist';
import {
  groupItemsIntoLines,
  type PdfTextItem,
} from '@/utils/quizDocumentImport/pdfReader';

/** Longest edge a page is drawn at, in pixels; 1920 keeps a 16:9 slide at 1080p. */
export const PAGE_IMAGE_LONG_EDGE_PX = 1920;
/** More pages than this are left out, with a warning. */
export const MAX_IMPORT_PAGES = 100;
/** A page's text is cut here, so a dense handout can't bloat the saved item. */
export const MAX_PAGE_TEXT_CHARS = 4000;
/** WebP quality; slides with photos stay sharp and well under a megabyte. */
const PAGE_IMAGE_QUALITY = 0.9;

export const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const GOOGLE_SLIDES_MIME_TYPE =
  'application/vnd.google-apps.presentation';

export interface PageImage {
  blob: Blob;
  width: number;
  height: number;
  /** The page's own text, line by line; empty for a picture-only page. */
  text: string;
}

export interface PageImagesResult {
  pages: PageImage[];
  warnings: string[];
  /** The document's own page count, before the cap. */
  pageCount: number;
}

export interface PageViewport {
  width: number;
  height: number;
}

export interface RenderablePdfPage {
  getViewport: (opts: { scale: number }) => PageViewport;
  getTextContent: () => Promise<{ items: unknown[] }>;
  /** Draws the page at the viewport's size and returns the encoded picture. */
  renderToBlob: (viewport: PageViewport) => Promise<Blob>;
}

export interface RenderablePdf {
  numPages: number;
  getPage: (n: number) => Promise<RenderablePdfPage>;
  destroy?: () => Promise<unknown> | void;
}

export interface PageImageDeps {
  loadPdf: (file: Blob) => Promise<RenderablePdf>;
}

/** The slice of the Drive service a deck conversion needs. */
export interface SlidesDrive {
  /** Uploads an Office file as its Google equivalent and returns the new file's id. */
  importAsGoogleFile: (
    file: Blob,
    name: string,
    googleMimeType: string
  ) => Promise<string>;
  exportAsPdf: (fileId: string) => Promise<Blob>;
  deleteFile: (fileId: string) => Promise<void>;
}

export type PageSourceKind = 'pdf' | 'pptx';

const lower = (name: string) => name.toLowerCase();

/** Which page reader a file needs, or null when it is not a deck or PDF. */
export function pageSourceKind(file: {
  name: string;
  type?: string;
}): PageSourceKind | null {
  if (file.type === 'application/pdf' || lower(file.name).endsWith('.pdf')) {
    return 'pdf';
  }
  if (file.type === PPTX_MIME_TYPE || lower(file.name).endsWith('.pptx')) {
    return 'pptx';
  }
  return null;
}

/** File-input `accept` for the decks and PDFs this reader takes. */
export const PAGE_SOURCE_ACCEPT = '.pdf,.pptx';

/** Scale that draws a page's longest edge at `PAGE_IMAGE_LONG_EDGE_PX`. */
export function pageRenderScale(base: PageViewport): number {
  const longest = Math.max(base.width, base.height);
  if (!(longest > 0)) return 1;
  return PAGE_IMAGE_LONG_EDGE_PX / longest;
}

// Characters XML 1.0 forbids; a badly encoded font can put them in the text layer.
const XML_UNSAFE_CHARS =
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const isTextItem = (v: unknown): v is PdfTextItem =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as PdfTextItem).str === 'string' &&
  Array.isArray((v as PdfTextItem).transform);

/** A page's text in reading order, one line per row, trimmed to the cap. */
export function pageTextFromItems(items: readonly unknown[]): string {
  const lines = groupItemsIntoLines(items.filter(isTextItem))
    .map((line) =>
      line.replace(XML_UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim()
    )
    .filter(Boolean);
  const text = lines.join('\n');
  return text.length > MAX_PAGE_TEXT_CHARS
    ? text.slice(0, MAX_PAGE_TEXT_CHARS).trimEnd()
    : text;
}

/** Renders every page of a PDF, one at a time so a long deck holds one canvas at once. */
export async function readPdfPages(
  file: Blob,
  deps: PageImageDeps = browserPageImageDeps,
  maxPages = MAX_IMPORT_PAGES
): Promise<PageImagesResult> {
  const pdf = await deps.loadPdf(file);
  const warnings: string[] = [];
  const pages: PageImage[] = [];
  try {
    const pageCount = pdf.numPages;
    if (pageCount === 0) throw new Error('This file has no pages.');
    const count = Math.min(pageCount, maxPages);
    if (pageCount > maxPages) {
      warnings.push(
        `Only the first ${maxPages} of ${pageCount} pages were imported.`
      );
    }
    for (let n = 1; n <= count; n += 1) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pageRenderScale(base) });
      const width = Math.round(viewport.width);
      const height = Math.round(viewport.height);
      const blob = await page.renderToBlob(viewport);
      let text = '';
      try {
        text = pageTextFromItems((await page.getTextContent()).items);
      } catch (err) {
        // The picture is what matters; a page whose text won't read keeps it.
        console.warn('[pageImages] could not read page text', err);
      }
      pages.push({ blob, width, height, text });
    }
    return { pages, warnings, pageCount };
  } finally {
    await pdf.destroy?.();
  }
}

const baseName = (name: string) => name.replace(/\.[^./\\]+$/, '') || 'Slides';

/** Converts a PowerPoint to PDF through the teacher's Drive, deleting the temporary copy after. */
export async function pptxToPdf(file: Blob, name: string, drive: SlidesDrive) {
  // An empty type (some drag sources) would reach Drive as octet-stream, which it won't convert.
  const typed = file.type ? file : new Blob([file], { type: PPTX_MIME_TYPE });
  const fileId = await drive.importAsGoogleFile(
    typed,
    baseName(name),
    GOOGLE_SLIDES_MIME_TYPE
  );
  try {
    return await drive.exportAsPdf(fileId);
  } finally {
    await drive.deleteFile(fileId).catch((err: unknown) => {
      console.warn('[pageImages] could not delete the converted copy', err);
    });
  }
}

/** Pictures and text for a PDF or PowerPoint file. */
export async function readPageSource(
  file: File,
  options: { drive?: SlidesDrive | null; deps?: PageImageDeps } = {}
): Promise<PageImagesResult> {
  const kind = pageSourceKind(file);
  if (kind === 'pdf') return readPdfPages(file, options.deps);
  if (kind === 'pptx') {
    if (!options.drive) {
      throw new Error(
        'Connect Google Drive to import PowerPoint files, or save the slides as a PDF and import that.'
      );
    }
    const pdf = await pptxToPdf(file, file.name, options.drive);
    return readPdfPages(pdf, options.deps);
  }
  throw new Error('Choose a PDF or PowerPoint (.pptx) file.');
}

/** Pictures and text for a Google Slides deck the teacher picked from Drive. */
export async function readGoogleSlides(
  fileId: string,
  drive: SlidesDrive,
  deps?: PageImageDeps
): Promise<PageImagesResult> {
  return readPdfPages(await drive.exportAsPdf(fileId), deps);
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: string
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, type, PAGE_IMAGE_QUALITY)
  );
}

/** WebP, or JPEG where the browser can't encode WebP (Safari would hand back a large PNG). */
async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await encodeCanvas(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await encodeCanvas(canvas, 'image/jpeg');
  if (jpeg) return jpeg;
  if (webp) return webp;
  throw new Error('Could not draw this page.');
}

/** pdf.js and a canvas; loaded on demand so the reader costs nothing until used. */
export const browserPageImageDeps: PageImageDeps = {
  loadPdf: async (file) => {
    const bytes = await file.arrayBuffer();
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    const task = pdfjs.getDocument({ data: bytes, wasmUrl: '/pdfjs-wasm/' });
    const doc = await task.promise;
    return {
      numPages: doc.numPages,
      getPage: async (n) => {
        const page = await doc.getPage(n);
        return {
          // The real pdf.js viewport, so renderToBlob can hand it straight back.
          getViewport: (opts) => page.getViewport(opts),
          getTextContent: () => page.getTextContent(),
          renderToBlob: async (viewport) => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas is unavailable in this browser.');
            try {
              // Slides with no background are transparent; paint white like the deck shows.
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({
                canvasContext: ctx,
                canvas,
                viewport: viewport as PdfJsViewport,
              }).promise;
              return await canvasToBlob(canvas);
            } finally {
              canvas.width = 0;
              canvas.height = 0;
              page.cleanup();
            }
          },
        };
      },
      destroy: () => task.destroy(),
    };
  },
};
