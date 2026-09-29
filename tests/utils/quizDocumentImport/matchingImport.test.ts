/**
 * Matching sections in any document, with a word bank that runs past F (E6).
 */
import { describe, it, expect } from 'vitest';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';
import { mergeAnswerKey } from '@/utils/quizDocumentImport/mergeKey';
import { listKeyItems } from '@/utils/quizDocumentImport/answerKey';
import type { DocLine } from '@/utils/quizDocumentImport/types';

const row = (...cells: string[]): DocLine =>
  cells.length === 1
    ? { text: cells[0] }
    : { text: cells.join(' '), segments: cells.map((text) => ({ text })) };

const lines = (...texts: string[]): DocLine[] => texts.map((t) => row(t));

const TERMS = [
  'Feature',
  'Profit',
  'Finance',
  'Brand',
  'Budget',
  'Revenue',
  'Expense',
  'Market',
  'Consumer',
  'Entrepreneur',
  'Loss',
];
const LETTERS = 'ABCDEFGHIJK'.split('');
const DEFINITIONS = [
  'A physical characteristic of a product.',
  'A company’s ability to generate more money than it spends.',
  'Managing money — budgeting, investing, and tracking business costs and revenue.',
  'A name or symbol that identifies a product.',
  'A plan for spending money.',
  'Money a business takes in.',
  'Money a business spends.',
  'The people who might buy a product.',
  'A person who buys goods.',
  'A person who starts a business.',
  'When costs are more than revenue.',
];
const KEY = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
const PAIRS = DEFINITIONS.map(
  (d, i) => `${d.replace(/:/g, '꞉')}:${TERMS[i]}`
).join('|');

const ITEMS = DEFINITIONS.map((d, i) => `${i + 1}. _____ ${d}`);
const BANK = TERMS.map((t, i) => `${LETTERS[i]}. ${t}`);

describe('a Matching section with a bank past F', () => {
  it('reads items printed above the bank as one Matching question', () => {
    const { questions } = parseDocument(
      lines(
        'Matching (Write the Letter on the Line Next to the Correct Number)',
        ...ITEMS,
        ...BANK,
        'Multiple Choice',
        '1. Which is a cost?',
        'A. Rent',
        'B. Sales',
        'Answer Key',
        'Matching',
        ...KEY.map((k, i) => `${i + 1}. ${k}`),
        'Multiple Choice',
        '1. A'
      )
    );
    expect(questions.map((q) => q.type)).toEqual(['Matching', 'MC']);
    expect(questions[0].correctAnswer).toBe(PAIRS);
    expect(questions[0].points).toBe(11);
    expect(questions[1].options.map((o) => o.text)).toEqual(['Rent', 'Sales']);
    expect(questions[1].correctAnswer).toBe('Rent');
  });

  it('reads a bank printed above the items, in a grid', () => {
    const grid: DocLine[] = [];
    for (let i = 0; i < 6; i += 1) {
      const right = i + 6;
      grid.push(
        right < 11
          ? row(`${LETTERS[i]}.`, TERMS[i], `${LETTERS[right]}.`, TERMS[right])
          : row(`${LETTERS[i]}.`, TERMS[i])
      );
    }
    const { questions } = parseDocument([
      row('Matching'),
      row('Match each term with its definition.'),
      ...grid,
      ...ITEMS.map((t) => row(t)),
      row('Answer Key'),
      ...KEY.map((k, i) => row(`${i + 1}. ${k}`)),
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe('Matching');
    expect(questions[0].text).toBe('Match each term with its definition.');
    expect(questions[0].correctAnswer).toBe(PAIRS);
  });

  it('reads a term printed beside each item', () => {
    const { questions } = parseDocument([
      row('Matching'),
      ...DEFINITIONS.map((d, i) =>
        row(`${i + 1}.`, `_____ ${d}`, `${LETTERS[i]}.`, TERMS[i])
      ),
      row('Answer Key'),
      ...KEY.map((k, i) => row(`${i + 1}. ${k}`)),
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].correctAnswer).toBe(PAIRS);
  });

  it('takes a letter written in the blank as the key', () => {
    const { questions } = parseDocument(
      lines(
        'Matching',
        ...DEFINITIONS.map((d, i) => `${i + 1}. __${KEY[i]}__ ${d}`),
        ...BANK
      )
    );
    expect(questions).toHaveLength(1);
    expect(questions[0].correctAnswer).toBe(PAIRS);
  });

  it('keeps unused terms as distractors', () => {
    const { questions } = parseDocument(
      lines(
        'Matching',
        ...ITEMS.slice(0, 3),
        ...BANK,
        'Answer Key',
        '1. A',
        '2. B',
        '3. C'
      )
    );
    expect(questions[0].type).toBe('Matching');
    expect(questions[0].matchingDistractors).toEqual(TERMS.slice(3));
  });

  it('leaves unkeyed items as multiple choice over the whole bank', () => {
    const { questions } = parseDocument(lines('Matching', ...ITEMS, ...BANK));
    expect(questions).toHaveLength(11);
    expect(questions[0].type).toBe('MC');
    expect(questions[0].text).toBe(DEFINITIONS[0]);
    expect(questions[0].options.map((o) => o.letter)).toEqual(LETTERS);
  });

  it('applies a separate key file with letters past F', () => {
    const read = parseDocument(lines('Matching', ...ITEMS, ...BANK));
    const keyed = mergeAnswerKey(
      { title: '', questions: read.questions, images: [], warnings: [] },
      listKeyItems(lines(...KEY.map((k, i) => `${i + 1}) ${k.toLowerCase()}`))),
      'file'
    );
    expect(keyed.questions).toHaveLength(1);
    expect(keyed.questions[0].correctAnswer).toBe(PAIRS);
  });

  it('ends a set opened by directions alone when lettered choices start over', () => {
    const { questions } = parseDocument(
      lines(
        'Match each term with its definition.',
        ...BANK,
        ...ITEMS,
        '12. Which is a cost?',
        'A. Rent',
        'B. Sales',
        'Answer Key',
        ...KEY.map((k, i) => `${i + 1}. ${k}`),
        '12. A'
      )
    );
    expect(questions.map((q) => q.type)).toEqual(['Matching', 'MC']);
    expect(questions[1].options.map((o) => o.text)).toEqual(['Rent', 'Sales']);
    expect(questions[1].correctAnswer).toBe('Rent');
  });

  it('reads an ExamView term list past F', () => {
    const { questions } = parseDocument([
      row('Matching'),
      row('Match each item with the correct statement below.'),
      ...TERMS.map((t, i) => row(`${LETTERS[i].toLowerCase()}.`, t)),
      ...DEFINITIONS.map((d, i) => row('____', `${i + 1}.`, d)),
      row('Answer Section'),
      row('MATCHING'),
      ...KEY.map((k, i) => row('', `${i + 1}.`, 'ANS:', k, 'PTS:', '1')),
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe('Matching');
    expect(questions[0].correctAnswer).toBe(PAIRS);
  });
});

describe('a teacher-made test with a running header and a teacher key', () => {
  const { questions, warnings } = parseDocument(
    lines(
      'VERSION A',
      'SECTION 1 — Matching (Write the Letter on the Line Next to the Correct Number)',
      'Terms:',
      ...BANK,
      'Definitions:',
      ...ITEMS.slice(0, 6),
      'VERSION A',
      ...ITEMS.slice(6),
      'VERSION A',
      'SECTION 2 — Multiple Choice',
      '12. Which is a cost?',
      'A. Rent',
      'B. Sales',
      'VERSION A — TEACHER KEY',
      'Section 1:',
      ...KEY.map((k, i) => `${i + 1}. ${k} — ${TERMS[i]}`),
      'Section 2:',
      '12-A'
    )
  );

  it('keeps the set whole across the page header', () => {
    expect(warnings).toEqual([]);
    expect(questions.map((q) => q.type)).toEqual(['Matching', 'MC']);
    expect(questions[0].correctAnswer).toBe(PAIRS);
    expect(questions[1].correctAnswer).toBe('Rent');
  });

  it('takes the heading’s parenthetical over label-only directions', () => {
    expect(questions[0].text).toBe(
      'Write the Letter on the Line Next to the Correct Number'
    );
  });
});

describe('lines that repeat without being a running header', () => {
  it('keeps an answer printed on its own line', () => {
    const { questions } = parseDocument(
      lines(
        '1. The sun is a star',
        'TRUE',
        '2. The moon is a planet',
        'TRUE',
        '3. Water boils at 100 °C',
        'TRUE'
      )
    );
    expect(questions.map((q) => q.text)).toEqual([
      'The sun is a star TRUE',
      'The moon is a planet TRUE',
      'Water boils at 100 °C TRUE',
    ]);
  });

  it('keeps an all-caps line repeated close together', () => {
    const { questions } = parseDocument(
      lines(
        '1. Label the parts',
        'SEE DIAGRAM',
        '2. Name the organ',
        'SEE DIAGRAM',
        '3. Name the bone',
        'SEE DIAGRAM'
      )
    );
    expect(questions).toHaveLength(3);
    expect(questions[2].text).toBe('Name the bone SEE DIAGRAM');
  });

  it('skips a header printed on every PDF page', () => {
    const { questions } = parseDocument([
      { text: 'VERSION A', page: 1, y: 700 },
      { text: '1. First question?', page: 1, y: 650 },
      { text: 'VERSION A', page: 2, y: 700 },
      { text: 'more of the first question.', page: 2, y: 650 },
      { text: 'VERSION A', page: 3, y: 700 },
      { text: '2. Second question?', page: 3, y: 650 },
    ]);
    expect(questions.map((q) => q.text)).toEqual([
      'First question? more of the first question.',
      'Second question?',
    ]);
  });
});

describe('key entries past F', () => {
  it('needs punctuation, so a unit label is not a key', () => {
    expect(listKeyItems(lines('10 m', '6 m', '8 m'))).toEqual([]);
    expect(listKeyItems(lines('1. g', '2) K'))).toEqual([
      { item: 1, answer: 'G' },
      { item: 2, answer: 'K' },
    ]);
  });
});

describe('a stem that opens with a later-letter initial', () => {
  it('stays a question outside a key', () => {
    const { questions, warnings } = parseDocument(
      lines(
        '1. Which planet is largest?',
        'A. Jupiter',
        'B. Mars',
        '2. J. K. Rowling first published which book?',
        'A. Harry Potter',
        'B. Dune',
        '3. Which gas do plants take in?',
        'A. Carbon dioxide',
        'B. Helium'
      )
    );
    expect(warnings).toEqual([]);
    expect(questions).toHaveLength(3);
    expect(questions[1].text).toBe('J. K. Rowling first published which book?');
  });
});
