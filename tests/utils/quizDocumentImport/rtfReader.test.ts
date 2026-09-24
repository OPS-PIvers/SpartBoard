/**
 * The rich text reader. A .rtf is the one format that states its own
 * paragraphs and its own emphasis, so what these guard is that the reader
 * keeps both and that the control groups holding fonts, colours and pictures
 * never leak into the questions.
 */

import { describe, it, expect } from 'vitest';
import { parseRtf, readRtf } from '@/utils/quizDocumentImport/rtfReader';
import { readQuizDocument } from '@/utils/quizDocumentImport';

const rtfFile = (body: string, name = 'Unit 3 Test.rtf'): File =>
  new File([body], name, { type: 'application/rtf' });

const HEADER = '{\\rtf1\\ansi\\deff0';

describe('parseRtf', () => {
  it('splits paragraphs on \\par and drops empty ones', () => {
    const lines = parseRtf(
      `${HEADER}\\pard First line\\par\\par Second line\\par}`
    );
    expect(lines.map((l) => l.text.trim())).toEqual([
      'First line',
      'Second line',
    ]);
  });

  it('throws away the font, colour and stylesheet tables', () => {
    const lines = parseRtf(
      `${HEADER}{\\fonttbl{\\f0\\froman Times New Roman;}}` +
        `{\\colortbl;\\red0\\green0\\blue0;}` +
        `{\\stylesheet{\\s0 Normal;}}` +
        `\\pard 1. What is the capital of France?\\par}`
    );
    expect(lines.map((l) => l.text.trim())).toEqual([
      '1. What is the capital of France?',
    ]);
  });

  it('drops an ignorable destination whole, including a picture', () => {
    const lines = parseRtf(
      `${HEADER}{\\*\\generator Riched20 10.0;}` +
        `{\\pict\\pngblip 89504e470d0a}` +
        `\\pard Keep this\\par}`
    );
    expect(lines.map((l) => l.text.trim())).toEqual(['Keep this']);
  });

  it('marks a line whose run is bold, underlined or highlighted', () => {
    const lines = parseRtf(
      `${HEADER}\\pard A. Rome\\par` +
        `\\pard B. {\\b Paris}\\par` +
        `\\pard C. {\\ul Madrid}\\par` +
        `\\pard D. {\\highlight3 Berlin}\\par}`
    );
    expect(lines.map((l) => [l.text.trim(), l.emphasized === true])).toEqual([
      ['A. Rome', false],
      ['B. Paris', true],
      ['C. Madrid', true],
      ['D. Berlin', true],
    ]);
  });

  it('turns emphasis back off with \\b0, \\ulnone and \\plain', () => {
    const lines = parseRtf(
      `${HEADER}\\pard \\b Bold\\b0  plain again\\par` +
        `\\pard \\ul Under\\ulnone  plain\\par` +
        `\\pard \\b Bold\\plain\\par` +
        `\\pard Nothing here\\par}`
    );
    expect(lines[3].emphasized).toBeUndefined();
    // The emphasis opened earlier in the paragraph still counts for its line.
    expect(lines[0].emphasized).toBe(true);
  });

  it('does not let emphasis leak past the group that set it', () => {
    const lines = parseRtf(
      `${HEADER}\\pard {\\b B. Paris}\\par\\pard C. Madrid\\par}`
    );
    expect(lines[0].emphasized).toBe(true);
    expect(lines[1].emphasized).toBeUndefined();
  });

  it('decodes hex escapes, unicode and the punctuation control words', () => {
    const lines = parseRtf(
      `${HEADER}\\pard Caf\\'e9 \\u8212 ? a \\ldblquote quote\\rdblquote\\par}`
    );
    expect(lines[0].text.trim()).toBe('Café — a “quote”');
  });

  it('decodes hex escapes in the codepage \\ansicpg declares', () => {
    const cyrillic = parseRtf(
      `{\\rtf1\\ansi\\ansicpg1251\\deff0\\pard \\'cc\\'e8\\'f0\\par}`
    );
    expect(cyrillic[0].text.trim()).toBe('Мир');
    const japanese = parseRtf(
      `{\\rtf1\\ansi\\ansicpg932\\deff0\\pard \\'82\\'a0\\par}`
    );
    expect(japanese[0].text.trim()).toBe('あ');
  });

  it('honours \\ucN when skipping a unicode substitute', () => {
    const lines = parseRtf(`${HEADER}\\uc2\\pard x\\u233 ??y\\par}`);
    expect(lines[0].text.trim()).toBe('xéy');
  });

  it('reads a table row as one line with a segment per cell', () => {
    const lines = parseRtf(
      `${HEADER}\\pard\\intbl A. Rome\\cell B. Paris\\cell\\row}`
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].segments?.map((s) => s.text.trim())).toEqual([
      'A. Rome',
      'B. Paris',
    ]);
    expect(lines[0].text).toBe('A. Rome B. Paris');
  });

  it('keeps a cell with two paragraphs in one segment', () => {
    const lines = parseRtf(
      `${HEADER}\\pard\\intbl 1\\cell First part\\par second part\\cell\\row}`
    );
    expect(lines[0].segments?.map((s) => s.text.trim())).toEqual([
      '1',
      'First part second part',
    ]);
  });

  it('breaks a segment at a tab and keeps bold on the piece it covers', () => {
    const lines = parseRtf(
      `${HEADER}\\pard a. 357.4\\tab {\\b d. 35,740}\\par}`
    );
    expect(lines[0].segments?.map((s) => s.text.trim())).toEqual([
      'a. 357.4',
      'd. 35,740',
    ]);
    expect(lines[0].segments?.[0].emphasized).toBeUndefined();
    expect(lines[0].segments?.[1].emphasized).toBe(true);
  });

  it('flattens a nested cell into a segment break, not a new line', () => {
    const lines = parseRtf(
      `${HEADER}\\pard\\intbl\\itap2 A. One\\nestcell B. Two\\nestcell{\\*\\nesttableprops\\nestrow}\\itap1 C. Three\\cell\\row}`
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].text.replace(/\s+/g, ' ')).toBe('A. One B. Two C. Three');
  });

  it('keeps literal braces and backslashes', () => {
    const lines = parseRtf(`${HEADER}\\pard a \\{b\\} \\\\c\\par}`);
    expect(lines[0].text.trim()).toBe('a {b} \\c');
  });
});

describe('readRtf', () => {
  it('refuses a file that is not RTF at all', async () => {
    await expect(readRtf(rtfFile('just some text'))).rejects.toThrow(
      /rich text/i
    );
  });

  it('reads a file that opens with whitespace before the header', async () => {
    const { lines } = await readRtf(rtfFile(`\n${HEADER}\\pard Hello\\par}`));
    expect(lines[0].text.trim()).toBe('Hello');
  });
});

describe('readQuizDocument — .rtf', () => {
  const TEST = `${HEADER}{\\fonttbl{\\f0\\froman Times;}}
\\pard 1. What is the capital of France?\\par
\\pard A. Rome\\par
\\pard B. {\\b Paris}\\par
\\pard 2. What is 2 + 2?\\par
\\pard A. 3\\par
\\pard B. 4\\par
\\pard Answer Key\\par
\\pard 2. B\\par}`;

  it('reads questions, options and the marked answer out of a Word-saved .rtf', async () => {
    const quiz = await readQuizDocument(rtfFile(TEST));
    expect(quiz.title).toBe('Unit 3 Test');
    expect(quiz.questions).toHaveLength(2);
    expect(quiz.questions[0].type).toBe('MC');
    expect(quiz.questions[0].options.map((o) => o.text)).toEqual([
      'Rome',
      'Paris',
    ]);
    expect(quiz.questions[0].correctAnswer).toBe('Paris');
  });

  it('applies an answer key printed at the back of the same file', async () => {
    const quiz = await readQuizDocument(rtfFile(TEST));
    // The key names question 2; its own lines must not become a question.
    expect(quiz.questions[1].correctAnswer).toBe('4');
    expect(quiz.questions.map((q) => q.number)).toEqual([1, 2]);
  });

  it('says pictures are not brought in', async () => {
    const quiz = await readQuizDocument(rtfFile(TEST));
    expect(quiz.images).toEqual([]);
    expect(quiz.warnings.join(' ')).toMatch(/Pictures in a rich text file/i);
  });
});
