/** A PDF that marks its answers in bold: the font's name is the only sign of it. */
import { describe, it, expect } from 'vitest';
import {
  isBoldFontName,
  markBoldItems,
  type PdfTextItem,
} from '@/utils/quizDocumentImport/pdfReader';
import { layoutPage } from '@/utils/quizDocumentImport/pdfLayout';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';
import type { DocLine } from '@/utils/quizDocumentImport/types';

const item = (str: string, x: number, y: number, bold = false) => ({
  str,
  x,
  y,
  width: str.length * 6,
  fontSize: 12,
  ...(bold ? { bold: true } : {}),
});

const toDocLines = (items: ReturnType<typeof item>[]): DocLine[] =>
  layoutPage(items).map((line) => ({
    text: line.text,
    segments: line.segments,
    ...(line.segments.some((s) => s.emphasized) ? { emphasized: true } : {}),
  }));

describe('bold font names', () => {
  it('knows the names PDFs give bold fonts', () => {
    expect(isBoldFontName('AAAAAA+TimesNewRomanPS-BoldMT')).toBe(true);
    expect(isBoldFontName('Calibri,Bold')).toBe(true);
    expect(isBoldFontName('BAAAAA+TimesNewRomanPSMT')).toBe(false);
    expect(isBoldFontName(undefined)).toBe(false);
  });

  it('marks the items whose font is bold', async () => {
    const items: PdfTextItem[] = [
      { str: 'a. Rome', transform: [12, 0, 0, 12, 0, 0], fontName: 'f1' },
      { str: 'b. Oslo', transform: [12, 0, 0, 12, 0, 0], fontName: 'f2' },
    ];
    const fonts: Record<string, { name: string }> = {
      f1: { name: 'Arial-BoldMT' },
      f2: { name: 'ArialMT' },
    };
    const marked = await markBoldItems(
      {
        getOperatorList: () => Promise.resolve(null),
        commonObjs: { get: (id) => fonts[id] },
      },
      items
    );
    expect(marked.map((i) => i.bold ?? false)).toEqual([true, false]);
  });

  it('reads the page as it is when the fonts will not load', async () => {
    const items: PdfTextItem[] = [
      { str: 'a. Rome', transform: [12, 0, 0, 12, 0, 0], fontName: 'f1' },
    ];
    const marked = await markBoldItems(
      {
        getOperatorList: () => Promise.reject(new Error('no fonts')),
        commonObjs: { get: () => undefined },
      },
      items
    );
    expect(marked).toEqual(items);
  });
});

describe('an answer marked in bold', () => {
  it('takes the one bold choice as the answer', () => {
    const { questions } = parseDocument(
      toDocLines([
        item('1. What is the capital of Norway?', 50, 700),
        item('a. Rome', 60, 680),
        item('b. Oslo', 60, 660, true),
        item('c. Paris', 60, 640),
      ])
    );
    expect(questions[0].correctAnswer).toBe('Oslo');
    expect(questions[0].warnings).toEqual([]);
  });

  it('takes a choice whose letter alone is bold', () => {
    const { questions } = parseDocument(
      toDocLines([
        item('1. What is the capital of Norway?', 50, 700),
        item('a.', 60, 680),
        item('Rome', 75, 680),
        item('b.', 60, 660, true),
        item('Oslo', 75, 660),
      ])
    );
    expect(questions[0].correctAnswer).toBe('Oslo');
  });

  it('does not take one bold word inside a choice as marking it', () => {
    const { questions } = parseDocument(
      toDocLines([
        item('1. Which is true?', 50, 700),
        item('a. It is ', 60, 680),
        item('not', 114, 680, true),
        item(' a planet at all', 132, 680),
        item('b. It is a star', 60, 660),
      ])
    );
    expect(questions[0].correctAnswer).toBe('');
  });

  it('reads every choice in bold as formatting, with no answer and no note', () => {
    const { questions } = parseDocument(
      toDocLines([
        item('1. What is the capital of Norway?', 50, 700),
        item('a. Rome', 60, 680, true),
        item('b. Oslo', 60, 660, true),
        item('c. Paris', 60, 640, true),
      ])
    );
    expect(questions[0].correctAnswer).toBe('');
    expect(questions[0].warnings).toEqual([]);
  });
});
