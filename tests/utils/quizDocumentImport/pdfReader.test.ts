/**
 * The PDF reader (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D2). pdf.js is injected
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
import { bandOf, columnBands } from '@/utils/quizDocumentImport/pdfLayout';
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

/* ─── Layout (docs/plans/shipped/QUIZ_IMPORT_RELIABILITY.md R2–R4) ────────────────── */

/** A 12pt fragment with a realistic advance width (6pt a character). */
const text12 = (str: string, x: number, y: number): PdfTextItem => ({
  str,
  transform: [12, 0, 0, 12, x, y],
  width: str.length * 6,
});

const LETTER_PAGE = 792;

const pdfWithHeight = (pages: PdfTextItem[][]): PdfDocumentLike => ({
  numPages: pages.length,
  getPage: (n) =>
    Promise.resolve({
      height: LETTER_PAGE,
      getTextContent: () => Promise.resolve({ items: pages[n - 1] }),
    }),
});

describe('readPdf — column gaps (R2)', () => {
  it('splits an ExamView option grid into segments at the gap', async () => {
    const { lines } = await readPdf(blob, {
      loadPdf: () =>
        Promise.resolve(
          pdfWithHeight([
            [
              text12('1. Which is largest?', 72, 700),
              text12('a. 357.4', 108, 680),
              text12('d. 35,740', 320, 680),
            ],
          ])
        ),
    });
    expect(lines[1].segments?.map((s) => s.text)).toEqual([
      'a. 357.4',
      'd. 35,740',
    ]);
    expect(lines[1].segments?.[1].x).toBe(320);
    expect(lines[1].text).toBe('a. 357.4 d. 35,740');
  });

  it('keeps ordinary word spacing inside one segment', () => {
    expect(
      groupItemsIntoLines([
        text12('Which planet', 72, 700),
        text12('is closest?', 72 + 12 * 6 + 3, 700),
      ])
    ).toEqual(['Which planetis closest?']);
  });
});

describe('readPdf — running headers and footers (R4)', () => {
  const page = (n: number, body: string): PdfTextItem[] => [
    text12('Chapter Test', 72, 760),
    text12(body, 72, 500),
    text12(`© 2025 Publisher ${n} | Module 1`, 72, 30),
  ];

  it('drops a footer that recurs on three pages', async () => {
    const { lines } = await readPdf(blob, {
      loadPdf: () =>
        Promise.resolve(
          pdfWithHeight([
            page(1, '1. First question here?'),
            page(2, '2. Second question here?'),
            page(3, '3. Third question here?'),
          ])
        ),
    });
    expect(lines.map((l) => l.text)).toEqual([
      '1. First question here?',
      '2. Second question here?',
      '3. Third question here?',
    ]);
  });

  it('on two pages drops only a line with a page number or copyright', async () => {
    const { lines } = await readPdf(blob, {
      loadPdf: () =>
        Promise.resolve(
          pdfWithHeight([
            page(1, '1. First question here?'),
            page(2, '2. Second question here?'),
          ])
        ),
    });
    expect(lines.map((l) => l.text)).toEqual([
      'Chapter Test',
      '1. First question here?',
      'Chapter Test',
      '2. Second question here?',
    ]);
  });

  it('keeps a line that recurs mid-page', async () => {
    const { lines } = await readPdf(blob, {
      loadPdf: () =>
        Promise.resolve(
          pdfWithHeight(
            [1, 2, 3].map((n) => [
              text12(`${n}. Question number ${n} here?`, 72, 600),
              text12('Show your work.', 72, 400),
            ])
          )
        ),
    });
    expect(lines.filter((l) => l.text === 'Show your work.')).toHaveLength(3);
  });
});

describe('readPdf — two-column pages (R4)', () => {
  it('reads the left column, then the right', async () => {
    const left = [1, 2, 3].flatMap((n, i) => [
      text12(`${n}. Left question ${n}?`, 40, 700 - i * 200),
      text12('A. Yes', 50, 680 - i * 200),
    ]);
    const right = [4, 5, 6].flatMap((n, i) => [
      text12(`${n}. Right question ${n}?`, 320, 700 - i * 200),
      text12('A. No', 330, 680 - i * 200),
    ]);
    const { lines } = await readPdf(blob, {
      loadPdf: () =>
        Promise.resolve(
          pdfWithHeight([[text12('Chapter Quiz', 200, 750), ...left, ...right]])
        ),
    });
    expect(lines.map((l) => l.text)).toEqual([
      'Chapter Quiz',
      '1. Left question 1?',
      'A. Yes',
      '2. Left question 2?',
      'A. Yes',
      '3. Left question 3?',
      'A. Yes',
      '4. Right question 4?',
      'A. No',
      '5. Right question 5?',
      'A. No',
      '6. Right question 6?',
      'A. No',
    ]);
  });

  it('leaves a short option grid in reading order', async () => {
    const items = [1, 2, 3].flatMap((n, i) => [
      text12(`${n}. Question ${n}?`, 72, 700 - i * 100),
      text12('a. 1', 108, 680 - i * 100),
      text12('c. 3', 302, 680 - i * 100),
      text12('b. 2', 108, 665 - i * 100),
      text12('d. 4', 302, 665 - i * 100),
    ]);
    const { lines } = await readPdf(blob, {
      loadPdf: () => Promise.resolve(pdfWithHeight([items])),
    });
    expect(lines.slice(0, 3).map((l) => l.text)).toEqual([
      '1. Question 1?',
      'a. 1 c. 3',
      'b. 2 d. 4',
    ]);
  });
});

describe('readPdf — OCR word boxes (R3)', () => {
  it('builds the same segments from recorded Tesseract words', async () => {
    const word = (text: string, x0: number, y1: number) => ({
      text,
      bbox: { x0, y0: y1 - 33, x1: x0 + text.length * 17, y1 },
    });
    const line = (words: ReturnType<typeof word>[]) => ({
      words,
      bbox: {
        x0: words[0].bbox.x0,
        y0: words[0].bbox.y0,
        x1: words[words.length - 1].bbox.x1,
        y1: words[0].bbox.y1,
      },
    });
    const recognizePage = vi.fn().mockResolvedValue({
      height: 2200,
      scale: 200 / 72,
      lines: [
        line([
          word('1.', 200, 300),
          word('Which', 250, 300),
          word('is', 360, 300),
        ]),
        line([word('a.', 300, 360), word('357.4', 345, 360)]),
        // Tesseract often reports the second column as its own line.
        line([word('d.', 890, 361), word('35,740', 935, 361)]),
      ],
    });
    const { lines, usedOcr } = await readPdf(blob, {
      loadPdf: () => Promise.resolve(pdfOf([[]])),
      recognizePage,
    });
    expect(usedOcr).toBe(true);
    expect(lines.map((l) => l.text)).toEqual([
      '1. Which is',
      'a. 357.4 d. 35,740',
    ]);
    expect(lines[1].segments?.map((s) => s.text)).toEqual([
      'a. 357.4',
      'd. 35,740',
    ]);
  });
});

describe('columnBands', () => {
  it('clusters left edges into bands and places an edge in its band', () => {
    const bands = columnBands([72, 74, 300, 302, 460, 71]);
    expect(bands).toEqual([71, 300, 460]);
    expect(bandOf(bands, 303)).toBe(1);
    expect(bandOf(bands, 40)).toBe(0);
  });
});
