/**
 * Math in a test: stacked fractions and exponents in a PDF, equations in a
 * Word file, questions printed side by side, and math that only a picture
 * of the line can show.
 */
import { describe, it, expect } from 'vitest';
import {
  fraction,
  isScriptRun,
  ommlText,
  toScript,
} from '@/utils/quizDocumentImport/mathText';
import {
  hasUnreadableMath,
  layoutPage,
  type LayoutItem,
} from '@/utils/quizDocumentImport/pdfLayout';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';
import { readPdf } from '@/utils/quizDocumentImport/pdfReader';
import type { DocLine } from '@/utils/quizDocumentImport/types';

const item = (
  str: string,
  x: number,
  y: number,
  fontSize = 12,
  width = str.length * fontSize * 0.5
): LayoutItem => ({ str, x, y, width, fontSize });

describe('math as plain text', () => {
  it('writes a fraction on one line, bracketing anything longer than a term', () => {
    expect(fraction('2', '3')).toBe('2/3');
    expect(fraction('x + 1', '2x − 5')).toBe('(x + 1)/(2x − 5)');
    expect(fraction('(x + 1)', '4')).toBe('(x + 1)/4');
  });

  it('raises and lowers digits, signs and letters', () => {
    expect(toScript('2', 'sup')).toBe('²');
    expect(toScript('n+1', 'sup')).toBe('ⁿ⁺¹');
    expect(toScript('2', 'sub')).toBe('₂');
    expect(toScript('AB', 'sup')).toBe('^(AB)');
    expect(toScript('q', 'sub')).toBe('_q');
  });

  it('knows an exponent from the end of an ordinal', () => {
    expect(isScriptRun('2')).toBe(true);
    expect(isScriptRun('n')).toBe(true);
    expect(isScriptRun('2x')).toBe(true);
    expect(isScriptRun('th')).toBe(false);
    expect(isScriptRun('nd')).toBe(false);
    expect(isScriptRun('heat')).toBe(false);
  });
});

describe('a Word equation', () => {
  const M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
  const read = (inner: string): string =>
    ommlText(
      new DOMParser().parseFromString(
        `<m:oMath xmlns:m="${M}">${inner}</m:oMath>`,
        'application/xml'
      ).documentElement
    );
  const r = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;

  it('keeps a fraction’s top and bottom apart', () => {
    expect(
      read(
        `${r('y = ')}<m:f><m:num>${r('x + 1')}</m:num><m:den>${r('2')}</m:den></m:f>`
      )
    ).toBe('y = (x + 1)/2');
  });

  it('writes powers, subscripts and roots', () => {
    expect(
      read(`<m:sSup><m:e>${r('x')}</m:e><m:sup>${r('2')}</m:sup></m:sSup>`)
    ).toBe('x²');
    expect(
      read(`<m:sSub><m:e>${r('a')}</m:e><m:sub>${r('n')}</m:sub></m:sSub>`)
    ).toBe('aₙ');
    expect(
      read(
        `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${r('x + 1')}</m:e></m:rad>`
      )
    ).toBe('√(x + 1)');
    expect(
      read(`<m:rad><m:deg>${r('3')}</m:deg><m:e>${r('8')}</m:e></m:rad>`)
    ).toBe('∛8');
  });

  it('keeps brackets and nests one form in another', () => {
    expect(
      read(
        `<m:f><m:num>${r('−b ± ')}<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:sSup><m:e>${r('b')}</m:e><m:sup>${r('2')}</m:sup></m:sSup>${r(' − 4ac')}</m:e></m:rad></m:num><m:den>${r('2a')}</m:den></m:f>`
      )
    ).toBe('(−b ± √(b² − 4ac))/2a');
    expect(
      read(
        `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e>${r('0, 5')}</m:e></m:d>`
      )
    ).toBe('[0, 5]');
  });
});

describe('a stacked fraction in a PDF', () => {
  it('joins the line it sits in', () => {
    const [line] = layoutPage([
      item('1. Graph y = −', 36, 652, 12, 88),
      item('2', 126, 659, 8.5, 5),
      item('3', 126, 646, 8.5, 5),
      item('|x + 3| − 4.', 133, 652, 12, 60),
    ]);
    expect(line.text).toBe('1. Graph y = − 2/3 |x + 3| − 4.');
  });

  it('brackets a top or bottom of more than one term', () => {
    const [line] = layoutPage([
      item('2. Simplify', 36, 500, 12, 62),
      item('x + 1', 104, 507, 8.5, 22),
      item('2x', 110, 494, 8.5, 9),
    ]);
    expect(line.text).toBe('2. Simplify (x + 1)/2x');
  });

  it('leaves an exponent and a subscript alone', () => {
    const [line] = layoutPage([
      item('3. y = 2(x + 1)', 36, 365, 12, 75),
      item('2', 111.5, 368, 8, 4.4),
      item(' + H', 117, 365, 12, 21),
      item('2', 138, 363, 8, 4.4),
      item('O', 142.5, 365, 12, 8),
    ]);
    expect(line.text).toBe('3. y = 2(x + 1)² + H₂O');
  });

  it('does not take three lines of ordinary text for a fraction', () => {
    const lines = layoutPage([
      item('first line of a paragraph', 36, 500),
      item('second line', 36, 486),
      item('third line', 36, 472),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'first line of a paragraph',
      'second line',
      'third line',
    ]);
  });
});

describe('a raised letter in a PDF', () => {
  it('is an exponent when it is small and touches the text before it', () => {
    const [line] = layoutPage([
      item('4. Simplify x', 36, 400, 12, 70),
      item('n', 106.5, 404.5, 8, 4.4),
      item(' · x', 111, 400, 12, 17),
    ]);
    expect(line.text).toBe('4. Simplify xⁿ · x');
  });

  it('is left alone at the end of an ordinal', () => {
    const [line] = layoutPage([
      item('On the 4', 36, 400, 12, 46),
      item('th', 82.5, 404.5, 8, 7),
      item(' of July', 90, 400, 12, 39),
    ]);
    expect(line.text).toBe('On the 4th of July');
  });
});

describe('questions printed side by side', () => {
  const seg = (text: string, x: number) => ({
    text,
    x,
    xEnd: x + text.length * 5,
  });
  const row = (y: number, parts: Array<[string, number]>): DocLine => ({
    text: parts.map(([text]) => text).join(' '),
    segments: parts.map(([text, x]) => seg(text, x)),
    page: 1,
    y,
  });
  const test = [
    row(700, [['1. Graph y = 2x + 1. Describe it.', 36]]),
    row(660, [['For 2 and 3, convert each equation to standard form.', 36]]),
    row(640, [
      ['2. y = 3(x + 1)(x – 4)', 36],
      ['3. f(x) = − (x – 2)² + 6', 288],
    ]),
    row(500, [
      ['2. ______________', 36],
      ['3. ______________', 288],
    ]),
    row(460, [['For 4 and 5, write the equation of the function.', 36]]),
    row(440, [
      ['4. x-intercepts: (3, 0), (-2, 0)', 36],
      ['5. vertex: (3, -4)', 288],
    ]),
    row(425, [
      ['point: (2, -5)', 49],
      ['point: (0, 7)', 301],
    ]),
    row(300, [
      ['4. ______________', 36],
      ['5. ______________', 288],
    ]),
  ];

  it('reads each number as its own question, without the answer blanks', () => {
    const { questions } = parseDocument(test);
    expect(questions.map((q) => q.text)).toEqual([
      'Graph y = 2x + 1. Describe it.',
      'y = 3(x + 1)(x – 4)',
      'f(x) = − (x – 2)² + 6',
      'x-intercepts: (3, 0), (-2, 0) point: (2, -5)',
      'vertex: (3, -4) point: (0, 7)',
    ]);
  });

  it('keeps "For 2 and 3, …" as directions for those questions', () => {
    const { texts } = parseDocument(test);
    expect(texts.map((t) => t.text)).toEqual([
      'For 2 and 3, convert each equation to standard form.',
      'For 4 and 5, write the equation of the function.',
    ]);
  });
});

describe('math that plain text can’t show', () => {
  it('flags a root over several terms, and a sum, but not a root of one number', () => {
    expect(hasUnreadableMath('Simplify √x + 1')).toBe(true);
    expect(hasUnreadableMath('Evaluate ∑ k')).toBe(true);
    expect(hasUnreadableMath('What is √2?')).toBe(false);
    expect(hasUnreadableMath('Which is larger, √5 or 2?')).toBe(false);
  });

  it('adds a picture of that line to its question, with a note', async () => {
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
    const pdf = await readPdf(
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
                      text('1. Simplify √x + 1 − 3', 36, 700),
                      text('a. 2', 54, 680),
                      text('b. 4', 54, 660),
                      text('2. What is 2 + 2?', 36, 620),
                      text('a. 3', 54, 600),
                      text('b. 4', 54, 580),
                    ],
                  }),
                getPictures: () => Promise.resolve({ pictures: [], viewport }),
              }),
          }),
      },
      { pictures: true }
    );
    expect(pdf.pictures).toHaveLength(1);
    const { questions } = parseDocument(pdf.lines);
    expect(questions[0].imageIds).toHaveLength(1);
    expect(questions[0].warnings.join(' ')).toMatch(/added as a picture/);
    expect(questions[1].imageIds).toEqual([]);
  });
});
