/**
 * Underlined and highlighted answers in a PDF: both are shapes drawn with the
 * words, so they are read from the page's drawing and laid over the text.
 */
import { describe, it, expect } from 'vitest';
import {
  isDrawnMarked,
  textMarks,
  type PdfMarkOps,
} from '@/utils/quizDocumentImport/pdfMarks';
import { markBoldItems } from '@/utils/quizDocumentImport/pdfReader';
import { layoutPage } from '@/utils/quizDocumentImport/pdfLayout';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';

const OPS: PdfMarkOps = {
  save: 1,
  restore: 2,
  transform: 3,
  paintFormXObjectBegin: 4,
  paintFormXObjectEnd: 5,
  constructPath: 6,
  setFillRGBColor: 7,
  fill: 22,
  eoFill: 23,
};
const STROKE = 20;

type Op = [number, unknown[]];
const list = (ops: Op[]) => ({
  fnArray: ops.map(([fn]) => fn),
  argsArray: ops.map(([, args]) => args),
});
/** A rectangle filled the way pdf.js reports it: moved into place, then drawn from the origin. */
const filledRect = (
  colour: string,
  x: number,
  y: number,
  width: number,
  height: number
): Op[] => [
  [OPS.save, []],
  [OPS.setFillRGBColor as number, [colour]],
  [OPS.transform, [1, 0, 0, 1, x, y]],
  [OPS.constructPath as number, [OPS.fill, [], [0, 0, width, height]]],
  [OPS.restore, []],
];
const strokedLine = (x0: number, x1: number, y: number): Op[] => [
  [OPS.constructPath as number, [STROKE, [], [x0, y, x1, y]]],
];

const text = (str: string, x: number, y: number) => ({
  str,
  transform: [12, 0, 0, 12, x, y],
  width: str.length * 6,
  height: 12,
});

describe('marks drawn on a PDF page', () => {
  it('finds an underline, whether it was stroked or filled as a thin box', () => {
    const marks = textMarks(
      list([
        ...strokedLine(54, 100, 558),
        ...filledRect('#000000', 54, 497.5, 31, 0.8),
      ]),
      OPS
    );
    expect(marks.underlines).toHaveLength(2);
    expect(isDrawnMarked(text('b. whale', 54, 560), marks)).toBe(true);
    expect(isDrawnMarked(text('a. this', 54, 500), marks)).toBe(true);
    expect(isDrawnMarked(text('a. trout', 54, 580), marks)).toBe(false);
  });

  it('finds a highlight, and not white, black or grey boxes', () => {
    const marks = textMarks(
      list([
        ...filledRect('#ffff00', 53, 657, 40, 14),
        ...filledRect('#ffffff', 53, 457, 40, 14),
        ...filledRect('#d9d9d9', 53, 437, 40, 14),
        ...filledRect('#000000', 53, 417, 40, 14),
      ]),
      OPS
    );
    expect(marks.highlights).toHaveLength(1);
    expect(isDrawnMarked(text('b. arid', 54, 660), marks)).toBe(true);
    expect(isDrawnMarked(text('c. other', 54, 460), marks)).toBe(false);
  });

  it('leaves a rule across the page, and one under a single word of a sentence, alone', () => {
    const marks = textMarks(
      list([...strokedLine(36, 576, 698), ...strokedLine(36, 60, 598)]),
      OPS
    );
    expect(isDrawnMarked(text('Part One', 36, 700), marks, 612)).toBe(false);
    expect(
      isDrawnMarked(text('Arid means which of these words?', 36, 600), marks)
    ).toBe(false);
  });

  it('makes the underlined and highlighted choices the answers', async () => {
    const page = {
      getOperatorList: () =>
        Promise.resolve(
          list([
            ...filledRect('#ffff00', 53, 657, 42, 14),
            ...strokedLine(54, 102, 558),
          ])
        ),
      commonObjs: { get: () => ({}) },
    };
    const items = await markBoldItems(
      page,
      [
        text('1. Which word means dry?', 36, 700),
        text('a. wet', 54, 680),
        text('b. arid', 54, 660),
        text('c. cold', 54, 640),
        text('2. Which is a mammal?', 36, 600),
        text('a. trout', 54, 580),
        text('b. whale', 54, 560),
        text('c. shark', 54, 540),
      ],
      { ops: OPS, pageWidth: 612 }
    );
    const lines = layoutPage(
      items.map((i) => ({
        str: i.str,
        x: i.transform[4],
        y: i.transform[5],
        width: i.width,
        fontSize: 12,
        bold: i.bold === true || i.marked === true,
      }))
    ).map((l) => ({
      text: l.text,
      segments: l.segments,
      page: 1,
      y: l.y,
      ...(l.segments.some((s) => s.emphasized) ? { emphasized: true } : {}),
    }));
    const { questions } = parseDocument(lines);
    expect(questions.map((q) => q.correctAnswer)).toEqual(['arid', 'whale']);
  });
});
