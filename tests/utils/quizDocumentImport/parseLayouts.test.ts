/**
 * Regression tests for the parser failures measured on real teacher files
 * (docs/plans/QUIZ_IMPORT_RELIABILITY.md "What fails today", R5–R9, R23, R25).
 * Fixtures are synthetic and copy only the layout.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDocument,
  parseQuestionLines,
} from '@/utils/quizDocumentImport/parseQuestions';
import type { DocLine, DocSegment } from '@/utils/quizDocumentImport/types';

const plain = (text: string): DocLine[] =>
  text.split('\n').map((t) => ({ text: t }));

/** A line with column segments, as a table row or a tab would give it. */
const row = (...cells: string[]): DocLine => {
  const segments: DocSegment[] = cells.map((text) => ({ text }));
  return { text: cells.join(' '), segments };
};

/** A PDF line: page, baseline and segment positions. */
const pdfLine = (
  page: number,
  y: number,
  ...cells: Array<[string, number]>
): DocLine => ({
  text: cells.map(([t]) => t).join(' '),
  segments: cells.map(([text, x]) => ({ text, x, xEnd: x + text.length * 6 })),
  page,
  y,
});

describe('option grids (R5, R6)', () => {
  it('reads an ExamView a/d · b/e · c grid as five choices in order', () => {
    const [q] = parseQuestionLines([
      pdfLine(1, 700, ['1. Which is largest?', 72]),
      pdfLine(1, 680, ['a. 357.4', 108], ['d. 35,740', 320]),
      pdfLine(1, 665, ['b. 3,574', 108], ['e. 0.3574', 320]),
      pdfLine(1, 650, ['c. 35.74', 108]),
      pdfLine(1, 620, ['2. Next question?', 72]),
    ]);
    expect(q.options.map((o) => `${o.letter}:${o.text}`)).toEqual([
      'A:357.4',
      'B:3,574',
      'C:35.74',
      'D:35,740',
      'E:0.3574',
    ]);
    expect(q.warnings).toEqual([]);
  });

  it('reads Word options laid out in a table, row by row', () => {
    const [q] = parseQuestionLines([
      { text: '1. Pick one.' },
      row('a. Rome', 'd. Oslo'),
      row('b. Paris', 'e. Bern'),
      row('c. Lima', ''),
    ]);
    expect(q.options.map((o) => o.letter).join('')).toBe('ABCDE');
    expect(q.options[3].text).toBe('Oslo');
  });

  it('splits options separated by a tab and keeps bold on the right one', () => {
    const [q] = parseQuestionLines([
      { text: '1. Pick one.' },
      {
        text: 'a. Rome d. Oslo',
        segments: [{ text: 'a. Rome' }, { text: 'd. Oslo', emphasized: true }],
      },
      row('b. Paris', 'c. Bern'),
    ]);
    expect(q.options.map((o) => o.letter).join('')).toBe('ABCD');
    expect(q.correctAnswer).toBe('Oslo');
  });

  it('never splits a letter inside one segment', () => {
    const [q] = parseQuestionLines(
      plain(`1. Which vitamin helps?
A. Vitamin A. is good for eyes
B. Iron`)
    );
    expect(q.options.map((o) => o.text)).toEqual([
      'Vitamin A. is good for eyes',
      'Iron',
    ]);
  });

  it('flags a grid with a missing letter and keeps the letters as read', () => {
    const [q] = parseQuestionLines([
      { text: '1. Pick one.' },
      row('a. Rome', 'c. Oslo'),
      row('b. Paris', 'e. Bern'),
      { text: '2. Next?' },
    ]);
    expect(q.options.map((o) => o.letter).join('')).toBe('ACBE');
    expect(q.warnings).toContain(
      'Answer choices may be out of place — check them.'
    );
  });
});

describe('sections and restarted numbering (R7, R23)', () => {
  const GREAT_MINDS = plain(`Section 1
1. First?
a. One
b. Two
2. Second?
a. One
b. Two
Section 2
1. Third?
a. One
b. Two
2. Fourth?
a. One
b. Two
3. Fifth?
a. One
b. Two`);

  it('numbers questions straight through and keeps the printed label', () => {
    const questions = parseQuestionLines(GREAT_MINDS);
    expect(questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5]);
    expect(questions.map((q) => q.sourceLabel)).toEqual([
      '1·1',
      '1·2',
      '2·1',
      '2·2',
      '2·3',
    ]);
    expect(questions[4].ref).toEqual({
      section: 2,
      sectionName: 'Section 2',
      item: 3,
    });
    // Section 2's first question is not appended to section 1's last option.
    expect(questions[1].options[1].text).toBe('Two');
  });

  it('opens a new section when numbering drops back to 1 with no heading', () => {
    const questions = parseQuestionLines(
      plain(`1. A?
a. x
b. y
2. B?
a. x
b. y
1. C?
a. x
b. y`)
    );
    expect(questions).toHaveLength(3);
    expect(questions[2].ref?.section).toBe(2);
  });

  it('stores no label on a plain 1→N test', () => {
    const questions = parseQuestionLines(
      plain(`1. A?
a. x
2. B?
a. y`)
    );
    expect(questions.every((q) => q.sourceLabel === undefined)).toBe(true);
  });

  it('ends a question at a heading instead of appending it to option C', () => {
    const questions = parseQuestionLines(
      plain(`15. Which unit?
a. meter
b. liter
c. gram
Graphing Problem-5 points
16. Plot the points.`)
    );
    expect(questions[0].options[2].text).toBe('gram');
    expect(questions[1].text).toBe('Plot the points.');
  });
});

describe('spill guards (R8)', () => {
  it('does not append an unheaded key to the last option', () => {
    const questions = parseQuestionLines(
      plain(`1. A?
a. x
b. y
2. B?
a. x
b. y
1. B
2. A`)
    );
    expect(questions).toHaveLength(2);
    expect(questions[1].options[1].text).toBe('y');
  });

  it('drops text after the last option of a Word test', () => {
    const questions = parseQuestionLines(
      plain(`1. A?
a. x
b. y
1. B 2pts
Created with a test generator`)
    );
    expect(questions[0].options[1].text).toBe('y');
  });

  it('keeps a PDF wrap at the option indent after the last question', () => {
    const [q] = parseQuestionLines([
      pdfLine(1, 700, ['1. Which is true?', 72]),
      pdfLine(1, 680, ['a. The moon orbits', 90]),
      pdfLine(1, 666, ['the earth', 104]),
      pdfLine(1, 600, ['Answers: 1. A', 72]),
    ]);
    expect(q.options[0].text).toBe('The moon orbits the earth');
  });
});

describe('item shapes (R9, R25)', () => {
  it('splits Part A and Part B into two questions sharing a short lead-in', () => {
    const questions = parseQuestionLines(
      plain(`5. Read paragraph 8.
Part A
What does the word mean?
a. happy
b. sad
Part B
Which phrase helps?
a. first
b. second
6. Next?`)
    );
    expect(questions.map((q) => q.sourceLabel)).toEqual(['5A', '5B', '6']);
    expect(questions[0].text).toBe(
      'Read paragraph 8. What does the word mean?'
    );
    expect(questions[1].text).toBe('Read paragraph 8. Which phrase helps?');
    expect(questions[1].options.map((o) => o.text)).toEqual([
      'first',
      'second',
    ]);
    expect(questions[1].warnings).toContain(
      'Part B credit doesn’t depend on Part A here.'
    );
    expect(questions.map((q) => q.number)).toEqual([1, 2, 3]);
  });

  it('turns a long Part A/B lead-in into one shared passage', () => {
    const passage =
      'The river rose slowly through the night, and by morning the lower fields were under water. Farmers moved their animals to the hill and waited for the rain to stop.';
    const { questions, texts } = parseDocument(
      plain(`3. Read the passage. ${passage}
Part A
What happened?
a. flood
b. fire
Part B
Which detail shows it?
a. water
b. hill`)
    );
    expect(texts).toHaveLength(1);
    expect(texts[0].text).toBe(passage);
    expect(questions[0].sharedTextId).toBe(texts[0].id);
    expect(questions[1].sharedTextId).toBe(texts[0].id);
    expect(questions[0].text).toBe('Read the passage. What happened?');
  });

  it('links a passage under "answer questions n–m" to those questions only', () => {
    const passage =
      'A fox lived at the edge of the wood. Every evening it crept to the farm and every evening the dog chased it home again, barking at the gate.';
    const { questions, texts } = parseDocument(
      plain(`1. Warm-up?
a. x
b. y
Read the story and answer questions 2–3.
${passage}
2. Who chased the fox?
a. dog
b. cat
3. Where did it live?
a. wood
b. farm
4. Unrelated?
a. x
b. y`)
    );
    expect(texts.map((t) => t.text)).toEqual([passage]);
    expect(questions.map((q) => q.sharedTextId ?? null)).toEqual([
      null,
      texts[0].id,
      texts[0].id,
      null,
    ]);
    expect(questions[0].options[1].text).toBe('y');
  });

  it('reads an ordering item as Ordering', () => {
    const [q] = parseQuestionLines(
      plain(`1. Number the events in the order they happened.
a. The fox ran.
b. The dog barked.
c. The gate closed.`)
    );
    expect(q.type).toBe('Ordering');
    expect(q.options).toHaveLength(3);
  });

  it('lists a sorting table cleanly as a written question', () => {
    const [q] = parseQuestionLines([
      { text: '4. Draw a line to sort each phrase into the correct column.' },
      row('Literal', 'Figurative'),
      row('the dog ran', 'time flies'),
      row('it rained', 'a heart of gold'),
    ]);
    expect(q.type).toBe('free-response');
    expect(q.text).toBe(
      'Draw a line to sort each phrase into the correct column. Literal: the dog ran; it rained / Figurative: time flies; a heart of gold'
    );
    expect(q.warnings.join(' ')).toMatch(/sorting question/i);
  });

  it('lifts learning-target lines out of the stems', () => {
    const questions = parseQuestionLines(
      plain(`ELT 1.1-I can explain the metric system.
1. Which is largest?
a. mm
b. km
2. Which is smallest?
a. mm
b. km
LT3: I can graph data.
3. Plot it.`)
    );
    expect(questions[0].text).toBe('Which is largest?');
    expect(questions[0].suggestedTarget).toEqual({
      code: 'ELT 1.1',
      label: 'I can explain the metric system.',
    });
    expect(questions[1].suggestedTarget?.code).toBe('ELT 1.1');
    expect(questions[2].suggestedTarget).toEqual({
      code: 'LT3',
      label: 'I can graph data.',
    });
    expect(questions[1].options[1].text).toBe('km');
  });

  it('suggests unticking self-reflection items instead of merging them', () => {
    const questions = parseQuestionLines(
      plain(`8. Which is right?
a. x
b. y
Self-Reflection
9. How confident do you feel?
a. Very
b. Somewhat`)
    );
    expect(questions[0].options[1].text).toBe('y');
    expect(questions[0].suggestUntick).toBeUndefined();
    expect(questions[1].suggestUntick).toMatch(/self-reflection/i);
  });
});
