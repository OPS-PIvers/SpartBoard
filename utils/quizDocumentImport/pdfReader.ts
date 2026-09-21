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

import type { DocLine } from './types';

/** Fragments within this many points of each other sit on the same line. */
const LINE_TOLERANCE_PT = 3;
/** Below this many characters a page is treated as having no text layer. */
const MIN_TEXT_LAYER_CHARS = 16;

export interface PdfTextItem {
  str: string;
  /** pdf.js transform: [a, b, c, d, x, y]. */
  transform: number[];
  hasEOL?: boolean;
}

export interface PdfPageLike {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
}

export interface PdfDocumentLike {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageLike>;
  destroy?: () => Promise<unknown> | void;
}

export interface PdfReaderDeps {
  loadPdf: (file: Blob) => Promise<PdfDocumentLike>;
  /** OCR for a page with no text layer; omitted means "skip those pages". */
  recognizePage?: (pageNumber: number) => Promise<string>;
}

export interface PdfContent {
  lines: DocLine[];
  /** Pages that had no text layer, 1-based. */
  scannedPages: number[];
  /** True once any page needed OCR. */
  usedOcr: boolean;
}

/** Group positioned fragments back into lines, top-to-bottom. */
export function groupItemsIntoLines(items: readonly PdfTextItem[]): string[] {
  const rows: Array<{ y: number; parts: Array<{ x: number; str: string }> }> =
    [];
  for (const item of items) {
    if (!item.str) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const row = rows.find((r) => Math.abs(r.y - y) <= LINE_TOLERANCE_PT);
    if (row) {
      row.parts.push({ x, str: item.str });
    } else {
      rows.push({ y, parts: [{ x, str: item.str }] });
    }
  }
  return (
    rows
      // A PDF's y axis runs up the page, so descending y is reading order.
      .sort((a, b) => b.y - a.y)
      .map((row) =>
        row.parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.str)
          .join('')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((line) => line.length > 0)
  );
}

/**
 * Text for every page. A page whose text layer is empty or near-empty is
 * handed to OCR when the caller supplied a recognizer, and otherwise reported
 * in `scannedPages` so the review table can say what was missed.
 */
export async function readPdf(
  file: Blob,
  deps: PdfReaderDeps
): Promise<PdfContent> {
  const pdf = await deps.loadPdf(file);
  const lines: DocLine[] = [];
  const scannedPages: number[] = [];
  let usedOcr = false;

  try {
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const pageLines = groupItemsIntoLines(content.items);
      const charCount = pageLines.join('').length;

      if (charCount >= MIN_TEXT_LAYER_CHARS) {
        for (const text of pageLines) lines.push({ text, page: n });
        continue;
      }

      scannedPages.push(n);
      if (!deps.recognizePage) continue;
      usedOcr = true;
      const recognized = await deps.recognizePage(n);
      for (const raw of recognized.split(/\r?\n/)) {
        const text = raw.replace(/\s+/g, ' ').trim();
        if (text) lines.push({ text, page: n });
      }
    }
  } finally {
    await pdf.destroy?.();
  }

  return { lines, scannedPages, usedOcr };
}
