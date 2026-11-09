/**
 * Reads a PDF into lines, text layer first (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md
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
  hasUnreadableMath,
  layoutPage,
  ocrItems,
  stripRunningLines,
  type LayoutItem,
  type LayoutLine,
  type OcrPage,
  type PageLines,
} from './pdfLayout';
import { figureKey, type FigureBox } from './pdfFigures';
import {
  isDrawnMarked,
  textMarks,
  type MarkRect,
  type PdfMarkOps,
  type TextMarks,
} from './pdfMarks';
import {
  dropRepeatedEdgePictures,
  growPicturesToLabels,
  placePictureLines,
  sharePicturesAcrossRanges,
  type PageBox,
  type PdfOperatorListLike,
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
  /** pdf.js's id for the font, like `g_d0_f2`. */
  fontName?: string;
  /** Set in a bold font, which is one way a teacher marks the answer. */
  bold?: boolean;
  /** Underlined or highlighted, which are the other ways. */
  marked?: boolean;
}

/** A font's real name says bold: `Arial-BoldMT`, `Calibri,Bold`, `Roboto-Black`. */
export const isBoldFontName = (name: string | undefined): boolean =>
  /bold|black|heavy|demi/i.test(name ?? '');

/** What finding a page's bold fonts needs of pdf.js. */
export interface PdfFontPage {
  getOperatorList: () => Promise<unknown>;
  commonObjs: { get: (id: string) => unknown };
}

/** The items with their bold, underline and highlight marks. */
export async function markBoldItems(
  page: PdfFontPage,
  items: PdfTextItem[],
  drawing?: { ops: PdfMarkOps; pageWidth?: number }
): Promise<PdfTextItem[]> {
  return (await readPageText(page, items, drawing)).items;
}

/**
 * Marks the items set in a bold font and, given pdf.js's `OPS`, the ones
 * underlined or highlighted, and returns the page's thin rules for the
 * layout to find fraction bars among. The document must be opened with
 * `fontExtraProperties`.
 */
export async function readPageText(
  page: PdfFontPage,
  items: PdfTextItem[],
  drawing?: { ops: PdfMarkOps; pageWidth?: number }
): Promise<{ items: PdfTextItem[]; rules: MarkRect[] }> {
  return markedItems(page, items, drawing);
}

async function markedItems(
  page: PdfFontPage,
  items: PdfTextItem[],
  drawing?: { ops: PdfMarkOps; pageWidth?: number }
): Promise<{ items: PdfTextItem[]; rules: MarkRect[] }> {
  const ids = new Set(items.map((i) => i.fontName).filter(Boolean));
  if (ids.size === 0 && !drawing) return { items, rules: [] };
  const bold = new Set<string>();
  let marks: TextMarks | null = null;
  try {
    // Fonts resolve as the page's drawing is read.
    const list = await page.getOperatorList();
    for (const id of ids) {
      const font = page.commonObjs.get(id as string) as { name?: string };
      if (isBoldFontName(font?.name)) bold.add(id as string);
    }
    if (drawing) marks = textMarks(list as PdfOperatorListLike, drawing.ops);
  } catch (err) {
    console.warn('[quizDocumentImport] could not read the fonts', err);
    return { items, rules: [] };
  }
  const rules = marks?.underlines ?? [];
  const drawn =
    marks && marks.underlines.length + marks.highlights.length > 0
      ? marks
      : null;
  if (bold.size === 0 && !drawn) return { items, rules };
  const result = items.map((i) => {
    const isBold = Boolean(i.fontName && bold.has(i.fontName));
    const marked =
      drawn !== null && isDrawnMarked(i, drawn, drawing?.pageWidth);
    if (!isBold && !marked) return i;
    return {
      ...i,
      ...(isBold ? { bold: true } : {}),
      ...(marked ? { marked: true } : {}),
    };
  });
  return { items: result, rules };
}

export interface PdfPageLike {
  /** `rules` are the page's thin horizontal lines in points, when the wiring reads them. */
  getTextContent: () => Promise<{ items: PdfTextItem[]; rules?: MarkRect[] }>;
  /** Page height in points; places the header and footer zones (R4). */
  height?: number;
  /** The page's pictures and its viewport; absent means pictures are skipped. */
  getPictures?: (items: readonly PdfTextItem[]) => Promise<{
    pictures: PageBox[];
    viewport: PdfViewportLike;
    /** Images too small to be pictures of their own. */
    inline?: PageBox[];
  }>;
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
  /** Each page's top lines before running headers are stripped, where version headings sit. */
  pageHeads: string[][];
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

/** A line's text reaches this far above its baseline, as a share of the page. */
const INLINE_REACH = 0.02;

/** The line with room for what is stacked over and under it, as fractions of the viewport. */
function mathBox(line: LayoutLine, viewport: PdfViewportLike): PageBox | null {
  const xs = line.segments.flatMap((s) =>
    s.x === undefined ? [] : [s.x, s.xEnd ?? s.x]
  );
  if (xs.length === 0) return null;
  const size = line.size ?? 12;
  const [a, b, c, d, e, f] = viewport.transform;
  const at = (x: number, y: number) => ({
    x: (a * x + c * y + e) / viewport.width,
    y: (b * x + d * y + f) / viewport.height,
  });
  const p = at(Math.min(...xs), line.y + 1.6 * size);
  const q = at(Math.max(...xs), line.y - size);
  const box = {
    x: Math.min(p.x, q.x),
    y: Math.min(p.y, q.y),
    width: Math.abs(q.x - p.x),
    height: Math.abs(q.y - p.y),
  };
  return box.width > 0 && box.height > 0 ? box : null;
}

const toLayoutItem = (item: PdfTextItem): LayoutItem => ({
  str: item.str,
  x: item.transform[4],
  y: item.transform[5],
  ...(item.width !== undefined ? { width: item.width } : {}),
  fontSize: Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0),
  ...(item.bold || item.marked ? { bold: true } : {}),
});

/** How far down a page a version heading may sit. */
const HEAD_LINES = 3;

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
    { pictures: PageBox[]; viewport: PdfViewportLike; inline?: PageBox[] }
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
      const pageLines = layoutPage(
        content.items.map(toLayoutItem),
        (content.rules ?? []).map((r) => ({
          x0: r.x0,
          x1: r.x1,
          y: (r.y0 + r.y1) / 2,
        }))
      );
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

  const headsByPage = new Map(
    pages.map((p) => [p.page, p.lines.map((l) => l.text)])
  );
  for (const [n, ocrLines] of plainOcr)
    headsByPage.set(
      n,
      ocrLines.map((l) => l.text)
    );
  const pageHeads = Array.from({ length: pageCount }, (_, i) =>
    (headsByPage.get(i + 1) ?? []).slice(0, HEAD_LINES)
  );
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
        ...(line.segments.some((s) => s.emphasized)
          ? { emphasized: true }
          : {}),
        page: n,
        y: line.y,
      }));
      const onPage = kept.get(n) ?? [];
      const viewport = picturesByPage.get(n)?.viewport;
      if (viewport) {
        const tops = page.lines.map(
          (_, i) => positionLine(pageLines[i], viewport).top
        );
        tops.forEach((top, i) => {
          pageLines[i].top = top;
        });
        // An equation set as an image belongs to the last line that starts above its middle.
        for (const box of picturesByPage.get(n)?.inline ?? []) {
          const middle = box.y + box.height / 2;
          let at = -1;
          tops.forEach((top, i) => {
            if (top - INLINE_REACH <= middle && (at < 0 || top >= tops[at])) {
              at = i;
            }
          });
          if (at < 0) continue;
          const had = pageLines[at].inlineImage;
          pageLines[at].inlineImage = {
            top: Math.min(had?.top ?? 1, box.y),
            bottom: Math.max(had?.bottom ?? 0, box.y + box.height),
          };
        }
        // Math that plain text gets wrong also comes in as a picture of the line.
        page.lines.forEach((line, i) => {
          const box = hasUnreadableMath(line.text)
            ? mathBox(line, viewport)
            : null;
          if (!box) return;
          pageLines[i].imageIds = [figureKey({ page: n, ...box })];
          pageLines[i].mathPicture = true;
          pictures.push({ page: n, ...box });
        });
      }
      if (viewport && onPage.length > 0) {
        const positioned = pageLines.map((line) =>
          positionLine(line, viewport)
        );
        const grown = growPicturesToLabels(positioned, onPage);
        lines.push(...placePictureLines(n, positioned, grown));
        pictures.push(...grown.map((box) => ({ page: n, ...box })));
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
    pageHeads,
  };
}
