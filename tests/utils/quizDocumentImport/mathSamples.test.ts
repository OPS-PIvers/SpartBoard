/**
 * Layouts from published math tests: equation-editor fonts, fractions set
 * over a drawn bar, choices that are pictures, tick boxes, score boxes and
 * numbers printed after an answer blank.
 */
import { describe, it, expect } from 'vitest';
import { symbolFontText } from '@/utils/quizDocumentImport/mathText';
import {
  layoutPage,
  type LayoutItem,
} from '@/utils/quizDocumentImport/pdfLayout';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';
import { boxFromKey, figureKey } from '@/utils/quizDocumentImport/pdfFigures';
import { readPdf } from '@/utils/quizDocumentImport/pdfReader';
import type { DocLine } from '@/utils/quizDocumentImport/types';

const item = (
  str: string,
  x: number,
  y: number,
  fontSize = 12,
  width = str.length * fontSize * 0.5
): LayoutItem => ({ str, x, y, width, fontSize });

const line = (text: string, extra: Partial<DocLine> = {}): DocLine => ({
  text,
  ...extra,
});

const row = (y: number, parts: Array<[string, number]>): DocLine => ({
  text: parts.map(([text]) => text).join(' '),
  segments: parts.map(([text, x]) => ({
    text,
    x,
    xEnd: x + text.length * 5,
  })),
  page: 1,
  y,
});

describe('an equation editor’s Symbol font', () => {
  it('reads its private-use characters as the signs and letters they print', () => {
    expect(symbolFontText('x  5  0')).toBe('x − 5 ≠ 0');
    expect(symbolFontText('3  4  2')).toBe('3 × 4 ÷ 2');
    expect(symbolFontText('  ')).toBe('α + β');
    expect(symbolFontText('plain text')).toBe('plain text');
  });

  it('is read that way in a PDF line', () => {
    const [only] = layoutPage([item('d  0', 36, 700)]);
    expect(only.text).toBe('d ≠ 0');
  });
});

describe('an equation set by position', () => {
  it('puts a space between terms set apart with no space character', () => {
    const [only] = layoutPage([
      item('3x', 36, 700),
      item('+', 60, 700, 12, 6),
      item('5', 78, 700),
    ]);
    expect(only.text).toBe('3x + 5');
  });

  it('writes text over and under a drawn bar as a fraction in its line', () => {
    const [only] = layoutPage(
      [
        item('Simplify', 36, 700),
        item('x + 1', 100, 707.5),
        item('2x', 109, 691),
        item('.', 144, 700),
      ],
      [{ x0: 98, x1: 134, y: 704 }]
    );
    expect(only.text).toBe('Simplify (x + 1)/2x .');
  });

  it('leaves underlined text alone', () => {
    const lines = layoutPage(
      [item('Name the term', 36, 700), item('below it', 36, 684)],
      [{ x0: 36, x1: 114, y: 698.5 }]
    );
    expect(lines.map((l) => l.text)).toEqual(['Name the term', 'below it']);
  });
});

describe('how a math test letters and numbers its questions', () => {
  it('reads "A )" as a choice', () => {
    const { questions } = parseDocument([
      line('1) Which number is prime?'),
      line('A ) 4'),
      line('B ) 7'),
      line('C ) 9'),
    ]);
    expect(questions[0].options.map((o) => o.text)).toEqual(['4', '7', '9']);
  });

  it('letters the tick boxes of a select-all question', () => {
    const { questions } = parseDocument([
      line('1) Select all the even numbers.'),
      line('☐ 2'),
      line('☐ 3'),
      line('☐ 4'),
      line('2) Select all the odd numbers.'),
      line('☐ 5'),
      line('☐ 6'),
    ]);
    expect(questions.map((q) => q.options.map((o) => o.letter))).toEqual([
      ['A', 'B', 'C'],
      ['A', 'B'],
    ]);
    expect(questions[0].options[2].text).toBe('4');
  });

  it('opens a question at a number printed after its answer blank', () => {
    const { questions } = parseDocument([
      line('____ 1) What is 2 + 2?'),
      line('A) 3'),
      line('B) 4'),
      line('____ 2) What is 3 + 3?'),
      line('A) 6'),
      line('B) 9'),
    ]);
    expect(questions.map((q) => q.text)).toEqual([
      'What is 2 + 2?',
      'What is 3 + 3?',
    ]);
  });

  it('drops the box for a question’s marks', () => {
    const { questions } = parseDocument([
      row(700, [
        ['1.', 73],
        ['Expand and simplify (x + 5)(x – 3).', 90],
        ['K ____/2', 522],
      ]),
      row(600, [
        ['2.', 73],
        ['Factor n² + 4n + 3.', 90],
        ['K ____/2', 522],
      ]),
    ]);
    expect(questions.map((q) => q.text)).toEqual([
      'Expand and simplify (x + 5)(x – 3).',
      'Factor n² + 4n + 3.',
    ]);
  });

  it('keeps lettered parts that each ask something as one written question', () => {
    const { questions } = parseDocument([
      line('1) Sara and Liz are shopping for a family party.'),
      line(
        'A ) It takes Sara 50 minutes to shop and Liz 75 minutes with the same list. How quickly can they shop together?'
      ),
      line(
        'B ) One grocery bag holds 300 cubic inches and is 10 inches tall. What is the area of its base?'
      ),
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe('free-response');
    expect(questions[0].options).toEqual([]);
    expect(questions[0].text).toContain('B) One grocery bag');
  });

  it('still reads choices that are questions under a stem that asks', () => {
    const { questions } = parseDocument([
      line('1) Which of the following questions is about nature and nurture?'),
      line(
        'A) Is perception a passive detection of images or an active detection of information?'
      ),
      line(
        'B) Is intelligence the result of one’s environment, or of one’s genetic makeup?'
      ),
    ]);
    expect(questions[0].options).toHaveLength(2);
  });
});

describe('parts of a test', () => {
  const test = [
    row(700, [['1. What is 2 + 2?', 36]]),
    row(680, [['a. 3', 54]]),
    row(660, [['b. 4', 54]]),
    row(600, [
      [
        'Full Solution - Write clear and thorough solutions to the following problems.',
        36,
      ],
    ]),
    row(560, [['2. Expand (x + 1)².', 36]]),
  ];

  it('starts a part at directions for "the following problems"', () => {
    const { questions, texts } = parseDocument(test, { passages: true });
    expect(texts).toEqual([]);
    expect(questions[1].ref?.sectionName).toBe('Full Solution');
  });

  it('never names a part after the page’s "Name:" field', () => {
    const { questions } = parseDocument([
      line('1. What is 2 + 2?'),
      line('a. 3'),
      line('b. 4'),
      line('NAME:', { emphasized: true, page: 2 }),
      line('2. What is 3 + 3?'),
      line('a. 6'),
      line('b. 9'),
    ]);
    expect(questions.map((q) => q.ref?.sectionName)).toEqual([
      undefined,
      undefined,
    ]);
  });
});

describe('letters set in bold on nearly every choice', () => {
  it('are formatting, not a marked answer', () => {
    const bold = { emphasized: true };
    const { questions } = parseDocument([
      line('1. What is 2 + 2?'),
      line('A) 3', bold),
      line('B) 4', bold),
      line('C) 5', bold),
      line('D) 6', bold),
      line('2. What is 3 + 3?'),
      line('A) 5', bold),
      line('B) 6', bold),
      line('C) 7', bold),
      line('D) 8'),
    ]);
    expect(questions.map((q) => q.correctAnswer)).toEqual(['', '']);
    expect(questions.flatMap((q) => q.warnings).join(' ')).not.toMatch(
      /More than one/
    );
  });
});

describe('a question whose choices are pictures', () => {
  const text = (str: string, x: number, y: number) => ({
    str,
    transform: [12, 0, 0, 12, x, y],
    width: str.length * 6,
  });
  const viewport = {
    width: 612,
    height: 792,
    transform: [1, 0, 0, -1, 0, 792],
  };
  const read = (inline: Array<{ x: number; y: number }>) =>
    readPdf(
      new Blob([]),
      {
        loadPdf: () =>
          Promise.resolve({
            numPages: 1,
            getPage: () =>
              Promise.resolve({
                height: 792,
                getTextContent: () =>
                  Promise.resolve({
                    items: [
                      text('1. Simplify:', 36, 700),
                      text('A)', 54, 660),
                      text('B)', 300, 660),
                      text('C)', 54, 630),
                      text('D)', 300, 630),
                      text('2. What is 2 + 2?', 36, 560),
                      text('A) 3', 54, 540),
                      text('B) 4', 54, 520),
                    ],
                  }),
                getPictures: () =>
                  Promise.resolve({
                    pictures: [],
                    viewport,
                    inline: inline.map((at) => ({
                      ...at,
                      width: 0.08,
                      height: 0.03,
                    })),
                  }),
              }),
          }),
      },
      { pictures: true }
    );

  it('comes in as a picture of the whole question, its choices named by letter', async () => {
    const pdf = await read([]);
    const { questions } = parseDocument(pdf.lines);
    expect(questions[0].options.map((o) => o.text)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(questions[0].warnings.join(' ')).toMatch(/whole question/);
    const box = boxFromKey(questions[0].imageIds[0]);
    expect(questions[0].imageIds).toHaveLength(1);
    expect(box?.page).toBe(1);
    // From just above question 1 to just above question 2.
    expect(box?.y).toBeCloseTo(92 / 792 - 0.02, 2);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(232 / 792 - 0.02);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(162 / 792);
    expect(questions[1].imageIds).toEqual([]);
  });

  it('reaches up to an equation that stands taller than its line', async () => {
    const pdf = await read([{ x: 0.2, y: 0.085 }]);
    const { questions } = parseDocument(pdf.lines);
    const box = boxFromKey(questions[0].imageIds[0]);
    expect(box?.y).toBeLessThanOrEqual(0.085);
  });

  it('reads a picture’s place back from its key', () => {
    const box = { page: 3, x: 0.04, y: 0.125, width: 0.92, height: 0.2 };
    expect(boxFromKey(figureKey(box))).toEqual(box);
    expect(boxFromKey('pdf-figure-1')).toBeNull();
  });
});
