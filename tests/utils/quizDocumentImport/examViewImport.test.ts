/**
 * ExamView layouts read without AI (docs/plans/shipped/QUIZ_EXAMVIEW_IMPORT.md E1–E4,
 * E8). Fixtures are synthetic and copy only ExamView's layout.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDocument,
  parseQuestionLines,
} from '@/utils/quizDocumentImport/parseQuestions';
import { isExamView } from '@/utils/quizDocumentImport/examView';
import type { DocLine, DocSegment } from '@/utils/quizDocumentImport/types';

const plain = (text: string): DocLine[] =>
  text.split('\n').map((t) => ({ text: t }));

/** An RTF table row: one segment per cell. */
const row = (...cells: string[]): DocLine => {
  const segments: DocSegment[] = cells.map((text) => ({ text }));
  return { text: cells.join(' '), segments };
};

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

const letters = (q: { options: { letter: string; text: string }[] }) =>
  q.options.map((o) => `${o.letter}:${o.text}`);

describe('question numbers (E1)', () => {
  it('keeps 357.4 and 3.5 as option text in an RTF grid', () => {
    const questions = parseQuestionLines([
      row('____', '1.', 'How many calories?'),
      row('a.', '357.4', 'd.', '35,740'),
      row('b.', '35.74', 'e.', '357,400'),
      row('c.', '3.5'),
      row('____', '2.', 'A bird is a'),
      row('a.', 'producer.', 'b.', 'consumer.'),
    ]);
    expect(questions).toHaveLength(2);
    expect(letters(questions[0])).toEqual([
      'A:357.4',
      'B:35.74',
      'C:3.5',
      'D:35,740',
      'E:357,400',
    ]);
    expect(questions[1].text).toBe('A bird is a');
  });

  it('keeps an out-of-sequence number inside a stem as text', () => {
    const questions = parseQuestionLines(
      plain(`1. First?
a. One
b. Two
2. Read these steps.
1. Boil water.
2. Serve.
a. Yes
b. No
3. Third?
a. One
b. Two`)
    );
    expect(questions.map((q) => q.ref?.item)).toEqual([1, 2, 3]);
  });

  it('opens a question after a small gap in the numbering and says so', () => {
    const questions = parseQuestionLines(
      plain(`1. First?
a. One
b. Two
3. Third?
a. One
b. Two`)
    );
    expect(questions.map((q) => q.ref?.item)).toEqual([1, 3]);
    expect(questions[1].warnings).toContain(
      'The numbering skips from 1 to 3. Check that no question is missing.'
    );
  });

  it('leaves a number indented under a PDF stem as text', () => {
    const questions = parseQuestionLines([
      pdfLine(1, 700, ['____', 36], ['1.', 73], ['Put these in order.', 90]),
      pdfLine(1, 688, ['2.', 100], ['Stir the pot.', 112]),
      pdfLine(1, 676, ['a.', 90], ['Yes', 108], ['b.', 302], ['No', 320]),
      pdfLine(1, 650, ['____', 36], ['2.', 73], ['Next?', 90]),
      pdfLine(1, 638, ['a.', 90], ['Yes', 108], ['b.', 302], ['No', 320]),
    ]);
    expect(questions).toHaveLength(2);
    expect(questions[0].text).toBe('Put these in order. 2. Stir the pot.');
  });
});

describe('plain-space option rows (E2)', () => {
  it('splits options typed with runs of spaces', () => {
    const [q] = parseQuestionLines(
      plain(`1. Which is a mammal?
a. whale    b. shark    c. trout`)
    );
    expect(letters(q)).toEqual(['A:whale', 'B:shark', 'C:trout']);
  });

  it('reads a spaced grid in column order', () => {
    const [q] = parseQuestionLines(
      plain(`1. Pick one.
A. Rome      C. Oslo
B. Paris     D. Bern`)
    );
    expect(letters(q)).toEqual(['A:Rome', 'B:Paris', 'C:Oslo', 'D:Bern']);
  });

  it('leaves spaced text whole when its letters are not a run', () => {
    const [q] = parseQuestionLines(
      plain(`1. Which plan?
A. Plan  B. then plan  A. again
B. Neither`)
    );
    expect(letters(q)).toEqual(['A:Plan B. then plan A. again', 'B:Neither']);
  });

  it('never splits at a single space', () => {
    const [q] = parseQuestionLines(
      plain(`1. Which vitamin?
A. Vitamin A. is good
B. Iron`)
    );
    expect(letters(q)).toEqual(['A:Vitamin A. is good', 'B:Iron']);
  });
});

describe('Roman-numeral statements (E3)', () => {
  const EXPECTED =
    'Which apply?\nI. producer\nII. primary\nIII. secondary\nIV. tertiary';

  it('sorts a two-column list typed with spaces onto lines of its own', () => {
    const [q] = parseQuestionLines(
      plain(`1. Which apply?
I. producer          III.  secondary
II. primary          IV.  tertiary
a. I only   b. II only`)
    );
    expect(q.text).toBe(EXPECTED);
    expect(letters(q)).toEqual(['A:I only', 'B:II only']);
  });

  it('sorts a two-column PDF list', () => {
    const [q] = parseQuestionLines([
      pdfLine(1, 700, ['1.', 73], ['Which apply?', 90]),
      pdfLine(1, 688, ['I. producer', 90], ['III.', 288], ['secondary', 310]),
      pdfLine(1, 676, ['II. primary', 90], ['IV.', 267], ['tertiary', 290]),
      pdfLine(
        1,
        664,
        ['a.', 90],
        ['I only', 108],
        ['b.', 302],
        ['II only', 320]
      ),
    ]);
    expect(q.text).toBe(EXPECTED);
    expect(q.options).toHaveLength(2);
  });
});

const EXAMVIEW = `Biology Test
Multiple Choice
Identify the letter of the choice that best completes the statement or answers the question.
____ 1. Which is a producer?
a. grass    b. hawk
Short Answer-PICK TWO (2) QUESTIONS TO ANSWER-3 points each
2. Explain what producers do.
3. Describe a food chain.
4. Name a decomposer.
Biology Test
Answer Section
MULTIPLE CHOICE
1. ANS: A PTS: 1
SHORT ANSWER
2. ANS: jj PTS: 1
3. ANS: cvcx PTS: 1
4. ANS: fungi PTS: 1`;

describe('ExamView profile (E4, E8)', () => {
  it('recognises an ExamView document by two of its fingerprints', () => {
    expect(isExamView(plain(EXAMVIEW))).toBe(true);
    expect(isExamView(plain('Multiple Choice\n1. Which?\na. One'))).toBe(false);
  });

  it('reads a heading with ExamView directions after it as a section', () => {
    const { questions } = parseDocument(plain(EXAMVIEW));
    expect(questions.map((q) => q.ref?.section)).toEqual([1, 2, 2, 2]);
  });

  it('keeps short-answer items written and shows the key text as a sample', () => {
    const { questions } = parseDocument(plain(EXAMVIEW));
    expect(questions[0].correctAnswer).toBe('grass');
    for (const q of questions.slice(1)) {
      expect(q.type).toBe('free-response');
      expect(q.correctAnswer).toBe('');
    }
    expect(questions[1].warnings).toEqual(['Key’s sample answer: jj']);
    expect(questions[3].warnings).toEqual(['Key’s sample answer: fungi']);
  });

  it('still reads a short key as fill in the blank outside ExamView', () => {
    const { questions } = parseDocument(
      plain(`1. The powerhouse of the cell is the ____.
Answer Key
1. mitochondria`)
    );
    expect(questions[0].type).toBe('FIB');
    expect(questions[0].correctAnswer).toBe('mitochondria');
  });
});

describe('PDF learning targets', () => {
  it('joins a target that wrapped onto a second line', () => {
    const [q] = parseQuestionLines([
      pdfLine(
        1,
        700,
        ['____', 36],
        ['1.', 73],
        ['ELT 1.2-I can describe how nutrients cycle and', 90]
      ),
      pdfLine(1, 683, ['explain how humans interfere.', 90]),
      pdfLine(1, 658, ['Which is recycled?', 90]),
      pdfLine(
        1,
        646,
        ['a.', 90],
        ['energy', 108],
        ['b.', 302],
        ['carbon', 320]
      ),
    ]);
    expect(q.text).toBe('Which is recycled?');
    expect(q.suggestedTarget).toEqual({
      code: 'ELT 1.2',
      label:
        'I can describe how nutrients cycle and explain how humans interfere.',
    });
  });
});
