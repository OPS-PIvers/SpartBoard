/**
 * Reads a PDF into lines, text layer first (docs/plans/QUIZ_DOCUMENT_IMPORT.md
 * D2). Most tests teachers hand us were printed from Word and carry a perfect
 * text layer; only a page that was genuinely scanned needs OCR, which is slow
 * and guesses at characters. `utils/paperQuestionOcr.ts`'s caller rasters and
 * OCRs every page unconditionally — that is the behaviour this replaces.
 *
 * pdf.js hands back positioned text fragments, not lines, so the fragments are
 * grouped back into lines by their y coordinate before anything is parsed.
 */

import { assertWithinPageLimit } from './limits';
import {
  layoutPage,
  ocrItems,
  stripRunningLines,
  type LayoutItem,
  type OcrPage,
  type PageLines,
} from './pdfLayout';
import type { DocLine } from './types';

/** Below this many characters a page is treated as having no text layer. */
const MIN_TEXT_LAYER_CHARS = 16;

export interface PdfTextItem {
  str: string;
  /** pdf.js transform: [a, b, c, d, x, y]. */
  transform: number[];
  hasEOL?: boolean;
  /** Advance width in points, as pdf.js reports it. */
  width?: number;
}

export interface PdfPageLike {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  /** Page height in points; places the header and footer zones (R4). */
  height?: number;
}

export interface PdfDocumentLike {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageLike>;
  destroy?: () => Promise<unknown> | void;
}

export interface PdfReaderDeps {
  loadPdf: (file: Blob) => Promise<PdfDocumentLike>;
  /** OCR for a page with no text layer: positioned words, or plain text. */
  recognizePage?: (pageNumber: number) => Promise<OcrPage | string>;
}

export interface PdfContent {
  lines: DocLine[];
  /** The document's own page count, whether or not a page yielded text. */
  pageCount: number;
  /** Pages that had no text layer, 1-based. */
  scannedPages: number[];
  /** True once any page needed OCR. */
  usedOcr: boolean;
}

export interface ReadPdfOptions {
  /** Refuse a longer document before any page is read. */
  maxPages?: number;
}

const toLayoutItem = (item: PdfTextItem): LayoutItem => ({
  str: item.str,
  x: item.transform[4],
  y: item.transform[5],
  ...(item.width !== undefined ? { width: item.width } : {}),
  fontSize: Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0),
});

/** Group positioned fragments back into lines, top-to-bottom. */
export function groupItemsIntoLines(items: readonly PdfTextItem[]): string[] {
  return layoutPage(items.map(toLayoutItem)).map((l) => l.text);
}

/**
 * Text for every page. A page whose text layer is empty or near-empty is
 * handed to OCR when the caller supplied a recognizer, and otherwise reported
 * in `scannedPages` so the review table can say what was missed.
 */
export async function readPdf(
  file: Blob,
  deps: PdfReaderDeps,
  options: ReadPdfOptions = {}
): Promise<PdfContent> {
  const pdf = await deps.loadPdf(file);
  const pageCount = pdf.numPages;
  const pages: PageLines[] = [];
  /** Plain-text OCR has no positions, so it skips the layout passes. */
  const plainOcr = new Map<number, DocLine[]>();
  const scannedPages: number[] = [];
  let usedOcr = false;

  try {
    // The page count is known as soon as the document opens, so an over-long
    // one is refused before a single page is parsed or OCR'd.
    if (options.maxPages !== undefined) {
      assertWithinPageLimit(pageCount, options.maxPages);
    }

    for (let n = 1; n <= pageCount; n += 1) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const pageLines = layoutPage(content.items.map(toLayoutItem));
      const charCount = pageLines.map((l) => l.text).join('').length;

      if (charCount >= MIN_TEXT_LAYER_CHARS) {
        pages.push({
          page: n,
          lines: pageLines,
          ...(page.height !== undefined ? { height: page.height } : {}),
        });
        continue;
      }

      scannedPages.push(n);
      if (!deps.recognizePage) continue;
      usedOcr = true;
      const recognized = await deps.recognizePage(n);
      if (typeof recognized === 'string') {
        const lines: DocLine[] = [];
        for (const raw of recognized.split(/\r?\n/)) {
          const text = raw.replace(/\s+/g, ' ').trim();
          if (text) lines.push({ text, page: n });
        }
        plainOcr.set(n, lines);
        continue;
      }
      pages.push({
        page: n,
        lines: layoutPage(ocrItems(recognized)),
        height: recognized.height / recognized.scale,
      });
    }
  } finally {
    await pdf.destroy?.();
  }

  const laidOut = new Map(stripRunningLines(pages).map((p) => [p.page, p]));
  const lines: DocLine[] = [];
  for (let n = 1; n <= pageCount; n += 1) {
    const page = laidOut.get(n);
    if (page) {
      for (const line of page.lines) {
        lines.push({
          text: line.text,
          segments: line.segments,
          page: n,
          y: line.y,
        });
      }
    }
    lines.push(...(plainOcr.get(n) ?? []));
  }

  return { lines, pageCount, scannedPages, usedOcr };
}
