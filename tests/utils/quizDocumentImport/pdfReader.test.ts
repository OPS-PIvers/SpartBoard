/**
 * The PDF reader (docs/plans/QUIZ_DOCUMENT_IMPORT.md D2). pdf.js is injected
 * so the line-grouping and the text-layer-vs-OCR decision are testable
 * without a real PDF; the grouping is the part that decides whether a test
 * printed from Word reads correctly.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  groupItemsIntoLines,
  readPdf,
  type PdfDocumentLike,
  type PdfTextItem,
} from '@/utils/quizDocumentImport/pdfReader';
import { parseQuestionLines } from '@/utils/quizDocumentImport/parseQuestions';

/** A fragment at (x, y); pdf.js puts those at transform[4] and [5]. */
const item = (str: string, x: number, y: number): PdfTextItem => ({
  str,
  transform: [1, 0, 0, 1, x, y],
});

const pdfOf = (pages: PdfTextItem[][]): PdfDocumentLike => ({
  numPages: pages.length,
  getPage: (n) =>
    Promise.resolve({
      getTextContent: () => Promise.resolve({ items: pages[n - 1] }),
    }),
});

const blob = new Blob(['%PDF-']);

describe('groupItemsIntoLines', () => {
  it('reads down the page, since a PDF y axis runs up it', () => {
    expect(
      groupItemsIntoLines([item('second', 0, 500), item('first', 0, 700)])
    ).toEqual(['first', 'second']);
  });

  it('joins fragments on one line left to right', () => {
    expect(
      groupItemsIntoLines([
        item('closest to the sun?', 120, 700),
        item('1. Which planet is ', 0, 700),
      ])
    ).toEqual(['1. Which planet is closest to the sun?']);
  });

  it('tolerates a fragment sitting a point or two off the baseline', () => {
    expect(
      groupItemsIntoLines([item('A. ', 0, 700), item('Mercury', 20, 702)])
    ).toEqual(['A. Mercury']);
  });

  it('keeps separate lines apart', () => {
    expect(
      groupItemsIntoLines([
        item('A. Mercury', 0, 700),
        item('B. Venus', 0, 680),
      ])
    ).toEqual(['A. Mercury', 'B. Venus']);
  });

  it('drops empty and whitespace-only fragments', () => {
    expect(
      groupItemsIntoLines([item('', 0, 700), item('   ', 0, 680)])
    ).toEqual([]);
  });
});

describe('readPdf', () => {
  it('reads a whole question off the text layer, with no OCR', async () => {
    const recognizePage = vi.fn();
    const { lines, usedOcr, scannedPages } = await readPdf(blob, {
      loadPdf: () =>
        Promise.resolve(
          pdfOf([
            [
              item('1. Which planet is closest to the sun?', 0, 700),
              item('A. Mercury', 0, 680),
              item('B. Venus', 0, 660),
            ],
          ])
        ),
      recognizePage,
    });

    expect(recognizePage).not.toHaveBeenCalled();
    expect(usedOcr).toBe(false);
    expect(scannedPages).toEqual([]);

    const [q] = parseQuestionLines(lines);
    expect(q.text).toBe('Which planet is closest to the sun?');
    expect(q.options.map((o) => o.text)).toEqual(['Mercury', 'Venus']);
  });

  it('records the page each line came from', async () => {
    const { lines } = await readPdf(blob, {
      loadPdf: () =>
        Promise.resolve(
          pdfOf([
            [item('1. A long enough first page line', 0, 700)],
            [item('2. A long enough second page line', 0, 700)],
          ])
        ),
    });
    expect(lines.map((l) => l.page)).toEqual([1, 2]);
  });

  it('falls back to OCR only on a page with no text layer', async () => {
    const recognizePage = vi
      .fn()
      .mockResolvedValue('2. Scanned question?\nA. Yes');
    const { lines, usedOcr, scannedPages } = await readPdf(blob, {
      loadPdf: () =>
        Promise.resolve(
          pdfOf([[item('1. A page with a real text layer on it', 0, 700)], []])
        ),
      recognizePage,
    });

    expect(recognizePage).toHaveBeenCalledTimes(1);
    expect(recognizePage).toHaveBeenCalledWith(2);
    expect(usedOcr).toBe(true);
    expect(scannedPages).toEqual([2]);
    expect(lines.map((l) => l.text)).toContain('2. Scanned question?');
  });

  it('treats a page with only a stray character as scanned', async () => {
    const recognizePage = vi.fn().mockResolvedValue('');
    const { scannedPages } = await readPdf(blob, {
      loadPdf: () => Promise.resolve(pdfOf([[item('3', 0, 700)]])),
      recognizePage,
    });
    expect(scannedPages).toEqual([1]);
  });

  it('reports scanned pages rather than failing when no recognizer is given', async () => {
    const { lines, scannedPages, usedOcr } = await readPdf(blob, {
      loadPdf: () => Promise.resolve(pdfOf([[]])),
    });
    expect(lines).toEqual([]);
    expect(scannedPages).toEqual([1]);
    expect(usedOcr).toBe(false);
  });

  it('releases the document even when a page throws', async () => {
    const destroy = vi.fn();
    await expect(
      readPdf(blob, {
        loadPdf: () =>
          Promise.resolve({
            numPages: 1,
            getPage: () => Promise.reject(new Error('broken page')),
            destroy,
          }),
      })
    ).rejects.toThrow('broken page');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
