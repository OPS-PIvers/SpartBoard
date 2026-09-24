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
import type { FigureBox } from './pdfFigures';
import {
  dropRepeatedEdgePictures,
  placePictureLines,
  sharePicturesAcrossRanges,
  type PageBox,
  type PdfViewportLike,
  type PositionedLine,
} from './pdfPictures';
import { lineSegments, type DocLine } from './types';

/** Below this many characters a page is treated as having no text layer. */
const MIN_TEXT_LAYER_CHARS = 16;

export interface PdfTextItem {
  str: string;
  /** pdf.js transform: [a, b, c, d, x, y]. */
  transform: number[];
  hasEOL?: boolean;
  /** Advance width in points, as pdf.js reports it. */
  width?: number;
  /** Glyph height in points, as pdf.js reports it. */
  height?: number;
}

export interface PdfPageLike {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  /** Page height in points; places the header and footer zones (R4). */
  height?: number;
  /** The page's pictures and its viewport; absent means pictures are skipped. */
  getPictures?: (
    items: readonly PdfTextItem[]
  ) => Promise<{ pictures: PageBox[]; viewport: PdfViewportLike }>;
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
  /** Pictures placed among `lines`; their `figureKey`s are the lines' image ids. */
  pictures: FigureBox[];
}

export interface ReadPdfOptions {
  /** Refuse a longer document before any page is read. */
  maxPages?: number;
  /** Find each text page's pictures and place them among its lines. */
  pictures?: boolean;
}

/** A laid-out line's baseline and horizontal span as fractions of the viewport. */
function positionLine(
  line: DocLine,
  viewport: PdfViewportLike
): PositionedLine {
  const [a, b, c, d, e, f] = viewport.transform;
  const at = (x: number, y: number) => ({
    x: (a * x + c * y + e) / viewport.width,
    y: (b * x + d * y + f) / viewport.height,
  });
  const segments = lineSegments(line);
  const x0 = segments[0]?.x;
  const last = segments[segments.length - 1];
  const x1 = last?.xEnd ?? last?.x;
  const y = line.y ?? 0;
  const start = at(x0 ?? 0, y);
  if (x0 === undefined || x1 === undefined || x1 <= x0) {
    return { line, top: start.y };
  }
  const end = at(x1, y);
  return {
    line,
    top: start.y,
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
  };
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
  const picturesByPage = new Map<
    number,
    { pictures: PageBox[]; viewport: PdfViewportLike }
  >();

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
        if (options.pictures && page.getPictures) {
          try {
            picturesByPage.set(n, await page.getPictures(content.items));
          } catch (err) {
            // A page whose drawing won't read still gives its text.
            console.warn('[quizDocumentImport] could not find pictures', err);
          }
        }
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
  const pictureNumbers = [...picturesByPage.keys()];
  const kept = new Map(
    dropRepeatedEdgePictures(
      pictureNumbers.map((n) => picturesByPage.get(n)?.pictures ?? [])
    ).map((boxes, i) => [pictureNumbers[i], boxes])
  );
  const lines: DocLine[] = [];
  const pictures: FigureBox[] = [];
  for (let n = 1; n <= pageCount; n += 1) {
    const page = laidOut.get(n);
    if (page) {
      const pageLines: DocLine[] = page.lines.map((line) => ({
        text: line.text,
        segments: line.segments,
        page: n,
        y: line.y,
      }));
      const onPage = kept.get(n) ?? [];
      const viewport = picturesByPage.get(n)?.viewport;
      if (viewport && onPage.length > 0) {
        lines.push(
          ...placePictureLines(
            n,
            pageLines.map((line) => positionLine(line, viewport)),
            onPage
          )
        );
        pictures.push(...onPage.map((box) => ({ page: n, ...box })));
      } else {
        lines.push(...pageLines);
      }
    }
    lines.push(...(plainOcr.get(n) ?? []));
  }

  return {
    lines: pictures.length > 0 ? sharePicturesAcrossRanges(lines) : lines,
    pageCount,
    scannedPages,
    usedOcr,
    pictures,
  };
}
