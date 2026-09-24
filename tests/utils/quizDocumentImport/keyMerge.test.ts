/**
 * Regression tests for the answer-key failures measured on real teacher files
 * (docs/plans/QUIZ_IMPORT_RELIABILITY.md "What fails today", R10–R13, R26,
 * R29). Fixtures are synthetic and copy only the layout.
 */
import { describe, it, expect } from 'vitest';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';
import { findAnswerKey } from '@/utils/quizDocumentImport/answerKey';
import { readKeyItems } from '@/utils/quizDocumentImport/keyForms';
import { mergeAnswerKey } from '@/utils/quizDocumentImport/mergeKey';
import { fillSavedQuizKey } from '@/utils/quizDocumentImport/savedQuizKey';
import {
  aiQuizToExtracted,
  type AiExtractedQuiz,
} from '@/utils/quizDocumentImport/aiReader';
import type {
  DocLine,
  DocSegment,
  ExtractedQuestion,
  ExtractedQuiz,
} from '@/utils/quizDocumentImport/types';
import type { QuizQuestion } from '@/types';

const plain = (text: string): DocLine[] =>
  text.split('\n').map((t) => ({ text: t }));

const row = (...cells: string[]): DocLine => {
  const segments: DocSegment[] = cells.map((text) => ({ text }));
  return { text: cells.join(' '), segments };
};

const pdfLine = (y: number, ...cells: Array<[string, number]>): DocLine => ({
  text: cells.map(([t]) => t).join(' '),
  segments: cells.map(([text, x]) => ({ text, x, xEnd: x + text.length * 5 })),
  page: 1,
  y,
});

const quizOf = (questions: ExtractedQuestion[]): ExtractedQuiz => ({
  title: 'Test',
  questions,
  images: [],
  warnings: [],
});

const read = (text: string, multiAnswer = false) =>
  parseDocument(plain(text), { multiAnswer });

describe('publisher answer guide (Great Minds layout)', () => {
  // Stem and Answer Key | Distractor Analysis | Scoring Rules, as a PDF table.
  const guide: DocLine[] = [
    pdfLine(
      760,
      ['Stem and Answer Key', 40],
      ['Distractor Analysis', 260],
      ['Scoring Rules', 440]
    ),
    pdfLine(740, ['ITEM 1 Which word describes the pond?', 40]),
    pdfLine(
      725,
      ['Correct Answer: c tranquil', 40],
      ['d Correct Answer: stormy is a misreading', 260],
      ['1 POINT', 440]
    ),
    pdfLine(700, ['ITEM 2', 40]),
    pdfLine(
      685,
      ['Part A Correct Answer: b', 40],
      ['a Students may confuse', 260],
      ['4 POINTS', 440]
    ),
    pdfLine(670, ['Part B Correct Answers: a, c', 40]),
    pdfLine(645, ['ITEM 3 Put the events in order.', 40]),
    pdfLine(630, [
      'Correct Answer: 1 The fox wakes 2 The fox hunts 3 The fox sleeps',
      40,
    ]),
    pdfLine(605, ['ITEM 4 Explain the theme.', 40]),
    pdfLine(
      590,
      ['Sample answer: courage matters.', 40],
      ['2 points: full', 440]
    ),
    pdfLine(560, ['Section 2', 40]),
    pdfLine(540, ['ITEM 1 Which is a simile?', 40]),
    pdfLine(525, ['Correct Answer: a', 40]),
  ];

  it('reads the ITEM column and ignores the distractor column', () => {
    const items = readKeyItems(guide, { multiAnswer: true });
    expect(items[0]).toMatchObject({ item: 1, answer: 'C' });
    expect(items[0].section?.ordinal).toBe(1);
  });

  it('reads Part A and Part B, with the item’s points to split', () => {
    const items = readKeyItems(guide, { multiAnswer: true });
    const parts = items.filter((k) => k.item === 2);
    expect(parts.map((k) => [k.part, k.answer])).toEqual([
      ['A', 'B'],
      ['B', 'A, C'],
    ]);
    expect(parts[0]).toMatchObject({ points: 4, pointsForItem: true });
  });

  it('reads an ordering answer, a rubric, and the second section', () => {
    const items = readKeyItems(guide, { multiAnswer: true });
    expect(items.find((k) => k.item === 3)?.ordering).toEqual([
      'The fox wakes',
      'The fox hunts',
      'The fox sleeps',
    ]);
    expect(items.find((k) => k.item === 4)?.rubric).toBe(true);
    expect(items.at(-1)).toMatchObject({
      item: 1,
      answer: 'A',
      section: { ordinal: 2, printed: 2 },
    });
  });
});

describe('key tables', () => {
  it('reads only the number and answer columns of a 4-column Word table', () => {
    const items = readKeyItems([
      row('Question #', 'Answer', 'Vocabulary word', 'Notes'),
      row('1', 'B', 'osmosis', 'see page 4'),
      row('2', 'D', 'diffusion', 'C is close'),
    ]);
    expect(items).toEqual([
      { item: 1, answer: 'B' },
      { item: 2, answer: 'D' },
    ]);
  });

  it('reads side-by-side number and answer pairs', () => {
    const items = readKeyItems([
      row('#', 'Ans', '#', 'Ans'),
      row('1', 'A', '4', 'C'),
      row('2', 'B', '5', 'True'),
    ]);
    expect(items.map((k) => [k.item, k.answer])).toEqual([
      [1, 'A'],
      [4, 'C'],
      [2, 'B'],
      [5, 'True'],
    ]);
  });
});

describe('key layouts that must not read as sections', () => {
  const six = [1, 2, 3, 4, 5, 6]
    .map((n) => `${n}. Pick ${n}.\na. A${n}\nb. B${n}\nc. C${n}\nd. D${n}`)
    .join('\n');

  it('reads a two-column key row by row without splitting it', () => {
    const { questions, warnings } = read(`${six}
Answer Key
1. A    4. D
2. B    5. A
3. C    6. B`);
    expect(questions.map((q) => q.correctAnswer)).toEqual([
      'A1',
      'B2',
      'C3',
      'D4',
      'A5',
      'B6',
    ]);
    expect(warnings).toEqual([]);
  });

  it('treats a key printed twice as one key', () => {
    const items = readKeyItems(plain('1. A\n2. B\n3. C\n1. A\n2. B\n3. C'));
    expect(items.every((k) => !k.section)).toBe(true);
    const merged = mergeAnswerKey(
      quizOf(read(six.split('\n').slice(0, 15).join('\n')).questions),
      items
    );
    expect(merged.warnings).toEqual([]);
  });
});

describe('keys printed in the test', () => {
  const test = `1. Pick one.
a. First
b. Second
2. Pick again.
a. Up
b. Down`;

  it('applies an unheaded two-entry key at the end, with points', () => {
    const { questions } = read(`${test}

1. B 2pts
2. A`);
    expect(questions.map((q) => q.correctAnswer)).toEqual(['Second', 'Up']);
    expect(questions[0].points).toBe(2);
    // The key is never appended to the last option (R8).
    expect(questions[1].options.at(-1)?.text).toBe('Down');
  });

  it('reads entries with page references and test-bank points', () => {
    const { answerByNumber, items } = findAnswerKey(
      plain(`${test}
Answer Key
1. B (p. 4)
2. A PTS: 1`)
    );
    expect([...answerByNumber]).toEqual([
      [1, 'B'],
      [2, 'A'],
    ]);
    expect(items[1].points).toBe(1);
  });

  it('matches a sectioned key to a test whose numbering restarts', () => {
    const { questions } = read(`Section 1
1. Pick one.
a. First
b. Second
Section 2
1. Pick again.
a. Up
b. Down
Answer Key
Section 1
1. A
Section 2
1. B`);
    expect(questions.map((q) => q.correctAnswer)).toEqual(['First', 'Down']);
  });

  it('keeps the marking warning on a restarted item the key doesn’t cover', () => {
    const { questions } = read(`Section 1
1. Pick one.
a. First
b. Second
Section 2
1. Pick again.
*a. Up
*b. Down
Answer Key
1. A`);
    expect(questions[0].correctAnswer).toBe('First');
    expect(questions[1].correctAnswer).toBe('');
    expect(questions[1].warnings).toContain(
      'More than one answer choice is marked, so the answer was left blank.'
    );
  });
});

describe('mergeAnswerKey', () => {
  it('prefers the key file over the test’s own key and says so (R10)', () => {
    const { questions } = read(`1. Pick one.
a. First
b. Second
c. Third
Answer Key
1. C`);
    const merged = mergeAnswerKey(quizOf(questions), [
      { item: 1, answer: 'B' },
    ]);
    expect(merged.questions[0].correctAnswer).toBe('Second');
    expect(merged.questions[0].warnings).toContain(
      'Test file said C, key file said B — using B.'
    );
    expect(merged.keySummary).toEqual({
      source: 'file',
      entries: 1,
      matched: 1,
      unmatchedLabels: [],
      conflicts: 1,
    });
  });

  it('never drops an entry silently (R13)', () => {
    const { questions } = read(`1. Pick one.
a. First
b. Second`);
    const merged = mergeAnswerKey(quizOf(questions), [
      { item: 1, answer: 'A' },
      { item: 7, answer: 'B' },
    ]);
    expect(merged.warnings).toEqual([
      'The answer key has an answer for question 7, which isn’t in this test.',
    ]);
    expect(merged.keySummary?.unmatchedLabels).toEqual(['7']);
  });

  it('turns several letters into choose-all only when that is on', () => {
    const { questions } = read(`1. Pick.
a. Cat
b. Dog
c. Fish`);
    const on = mergeAnswerKey(
      quizOf(questions),
      [{ item: 1, answer: 'A, C' }],
      'file',
      { multiAnswer: true }
    );
    expect(on.questions[0].type).toBe('MA');
    const off = mergeAnswerKey(quizOf(questions), [
      { item: 1, answer: 'A, C' },
    ]);
    expect(off.questions[0].type).toBe('MC');
    expect(off.questions[0].correctAnswer).toBe('');
    expect(off.questions[0].warnings.at(-1)).toContain('more than one answer');
  });

  it('matches Part A and Part B, splitting the item’s points (R12)', () => {
    const { questions } = read(`1. Read the poem.
Part A
Which word rhymes?
a. Cat
b. Dog
Part B
Which line shows it?
a. Line 1
b. Line 2`);
    const merged = mergeAnswerKey(quizOf(questions), [
      { item: 1, part: 'A', answer: 'B', points: 4, pointsForItem: true },
      { item: 1, part: 'B', answer: 'A', points: 4, pointsForItem: true },
    ]);
    expect(merged.questions.map((q) => q.correctAnswer)).toEqual([
      'Dog',
      'Line 1',
    ]);
    expect(merged.questions.map((q) => q.points)).toEqual([2, 2]);
  });

  it('puts an ordering item in the key’s order', () => {
    const { questions } = read(`1. Number the events in the order they happened.
a. The fox ran.
b. The dog barked.
c. The gate closed.`);
    const merged = mergeAnswerKey(quizOf(questions), [
      {
        item: 1,
        answer: '',
        ordering: ['The gate closed', 'The fox ran', 'The dog barked'],
      },
    ]);
    expect(merged.questions[0].correctAnswer).toBe(
      'The gate closed.|The fox ran.|The dog barked.'
    );
  });

  it('makes an unanswered choice question ordering when the key orders it', () => {
    const { questions } = read(`1. Which shows the events in order?
a. The fox ran.
b. The dog barked.`);
    expect(questions[0].type).toBe('MC');
    const merged = mergeAnswerKey(quizOf(questions), [
      { item: 1, answer: '', ordering: ['The dog barked', 'The fox ran'] },
    ]);
    expect(merged.questions[0]).toMatchObject({
      type: 'Ordering',
      correctAnswer: 'The dog barked.|The fox ran.',
    });
  });

  it('notes a rubric and suggests unticking an item not scored', () => {
    const { questions } = read(`1. Explain the theme.
2. How did you feel?`);
    const merged = mergeAnswerKey(quizOf(questions), [
      { item: 1, answer: '', rubric: true },
      { item: 2, answer: '', notScored: true },
    ]);
    expect(merged.questions[0].warnings).toContain(
      'The key has a scoring rubric for this item — add it in the editor.'
    );
    expect(merged.questions[1].suggestUntick).toBeTruthy();
  });
});

describe('AI reader printed numbers (R29)', () => {
  const ai = (
    extra: Array<{ section?: string; label?: string }>
  ): AiExtractedQuiz => ({
    title: 'T',
    warnings: [],
    questions: extra.map((e, i) => ({
      number: i + 1,
      text: `Q${i}`,
      type: 'MC',
      options: [
        { letter: 'A', text: 'x' },
        { letter: 'B', text: 'y' },
      ],
      correctAnswer: '',
      warnings: [],
      ...e,
    })),
  });

  it('keeps the section and printed number when the function sends them', () => {
    const quiz = aiQuizToExtracted(
      ai([
        { section: 'Section 1', label: '1' },
        { section: 'Section 2', label: '1' },
      ]),
      'fallback'
    );
    expect(quiz.questions.map((q) => q.number)).toEqual([1, 2]);
    expect(quiz.questions[1].ref).toMatchObject({
      section: 2,
      sectionNumber: 2,
      item: 1,
    });
    expect(quiz.questions[1].sourceLabel).toBe('2·1');
    const merged = mergeAnswerKey(quiz, [
      { item: 1, answer: 'A', section: { ordinal: 1, printed: 1 } },
      { item: 1, answer: 'B', section: { ordinal: 2, printed: 2 } },
    ]);
    expect(merged.questions.map((q) => q.correctAnswer)).toEqual(['x', 'y']);
  });

  it('falls back to the AI’s own numbers when labels are missing', () => {
    const raw = ai([{}, {}, {}]);
    raw.questions.forEach((q, i) => {
      q.number = 21 + i;
    });
    const quiz = aiQuizToExtracted(raw, 'fallback');
    expect(quiz.questions.map((q) => q.number)).toEqual([1, 2, 3]);
    expect(quiz.questions.map((q) => q.sourceLabel)).toEqual([
      '21',
      '22',
      '23',
    ]);
    const merged = mergeAnswerKey(quiz, [
      { item: 21, answer: 'B' },
      { item: 23, answer: 'A' },
    ]);
    expect(merged.questions.map((q) => q.correctAnswer)).toEqual([
      'y',
      '',
      'x',
    ]);
    expect(merged.warnings).toEqual([]);
  });

  it('still matches the other questions when one printed number is unreadable', () => {
    const raw = ai([{}, {}, {}]);
    raw.questions.forEach((q, i) => {
      q.number = 21 + i;
    });
    raw.questions[1].number = Number.NaN;
    const quiz = aiQuizToExtracted(raw, 'fallback');
    expect(quiz.questions[1].ref).toBeUndefined();
    const merged = mergeAnswerKey(quiz, [
      { item: 21, answer: 'B' },
      { item: 22, answer: 'B' },
      { item: 23, answer: 'A' },
    ]);
    expect(merged.questions.map((q) => q.correctAnswer)).toEqual([
      'y',
      '',
      'x',
    ]);
    expect(merged.keySummary?.unmatchedLabels).toEqual(['22']);
  });

  it('reads labels printed with a point or a Q', () => {
    const quiz = aiQuizToExtracted(
      ai([{ label: '21.' }, { label: 'Q22' }]),
      'fallback'
    );
    expect(quiz.questions.map((q) => q.ref?.item)).toEqual([21, 22]);
  });

  it('falls back to position when nothing is numbered', () => {
    const raw = ai([{}, {}]);
    raw.questions.forEach((q) => {
      q.number = Number.NaN;
    });
    const quiz = aiQuizToExtracted(raw, 'fallback');
    expect(quiz.questions.map((q) => [q.number, q.ref])).toEqual([
      [1, undefined],
      [2, undefined],
    ]);
    const merged = mergeAnswerKey(quiz, [{ item: 2, answer: 'B' }]);
    expect(merged.questions[1].correctAnswer).toBe('y');
  });
});

describe('fillSavedQuizKey (R26)', () => {
  const q = (over: Partial<QuizQuestion>): QuizQuestion => ({
    id: 'q',
    timeLimit: 0,
    text: 'Pick',
    type: 'MC',
    correctAnswer: '',
    incorrectAnswers: ['Red', 'Blue', 'Green', 'Gold'],
    needsKey: true,
    ...over,
  });

  it('fills a needs-key question by letter', () => {
    const result = fillSavedQuizKey(
      [q({ id: 'a' })],
      [{ item: 1, answer: 'C' }]
    );
    expect(result.questions[0]).toMatchObject({
      correctAnswer: 'Green',
      incorrectAnswers: ['Red', 'Blue', 'Gold'],
    });
    expect(result.questions[0].needsKey).toBeUndefined();
    expect(result.filled).toEqual(['a']);
  });

  it('skips an answered question and a letter past the choices', () => {
    const result = fillSavedQuizKey(
      [
        q({
          id: 'a',
          needsKey: undefined,
          correctAnswer: 'Red',
          incorrectAnswers: ['Blue'],
        }),
        q({ id: 'b' }),
      ],
      [
        { item: 1, answer: 'B' },
        { item: 2, answer: 'E' },
      ]
    );
    expect(result.filled).toEqual([]);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      'already answered — skipped',
      'key says E, question has 4 choices',
    ]);
    expect(result.questions[0].correctAnswer).toBe('Red');
  });

  it('moves every keyed option into a choose-all answer', () => {
    const result = fillSavedQuizKey(
      [q({ id: 'a', type: 'MA' })],
      [{ item: 1, answer: 'A, D' }]
    );
    expect(result.questions[0]).toMatchObject({
      correctAnswer: 'Red|Gold',
      incorrectAnswers: ['Blue', 'Green'],
    });
  });

  it('matches by printed label before position', () => {
    const result = fillSavedQuizKey(
      [q({ id: 'a', sourceLabel: '1·1' }), q({ id: 'b', sourceLabel: '2·1' })],
      [{ item: 1, answer: 'A', section: { ordinal: 2, printed: 2 } }]
    );
    expect(result.filled).toEqual(['b']);
  });

  it('never overwrites an answer typed in while needsKey is still set', () => {
    const typed = q({
      id: 'a',
      correctAnswer: 'blue',
      incorrectAnswers: ['red', 'green', 'yellow'],
    });
    const result = fillSavedQuizKey([typed], [{ item: 1, answer: 'B' }]);
    expect(result.filled).toEqual([]);
    expect(result.questions[0]).toBe(typed);
    expect(result.skipped[0].reason).toBe('already answered — skipped');
  });

  it('falls back to position for sectioned entries on an unlabelled quiz', () => {
    const result = fillSavedQuizKey(
      [q({ id: 'a' }), q({ id: 'b' }), q({ id: 'c' }), q({ id: 'd' })],
      [
        { item: 1, answer: 'B', section: { ordinal: 1, printed: 1 } },
        { item: 2, answer: 'A', section: { ordinal: 1, printed: 1 } },
        { item: 3, answer: 'C', section: { ordinal: 2, printed: 2 } },
        { item: 4, answer: 'D', section: { ordinal: 2, printed: 2 } },
      ]
    );
    expect(result.filled).toEqual(['a', 'b', 'c', 'd']);
    expect(result.questions.map((x) => x.correctAnswer)).toEqual([
      'Blue',
      'Red',
      'Green',
      'Gold',
    ]);
  });

  it('does not guess a position when sections repeat an item number', () => {
    const result = fillSavedQuizKey(
      [q({ id: 'a' }), q({ id: 'b' })],
      [
        { item: 1, answer: 'B', section: { ordinal: 1, printed: 1 } },
        { item: 1, answer: 'A', section: { ordinal: 2, printed: 2 } },
      ]
    );
    expect(result.filled).toEqual([]);
  });
});
