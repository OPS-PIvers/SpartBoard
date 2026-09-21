/**
 * Parser fixtures for the layouts a real classroom test actually uses
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D2). Every case here is "what the
 * document said", never a guess: a question the reader can't type comes back
 * as written-response with a warning rather than an invented key.
 */
import { describe, it, expect } from 'vitest';
import {
  parseQuestionLines,
  isTrueFalse,
} from '@/utils/quizDocumentImport/parseQuestions';
import type { DocLine } from '@/utils/quizDocumentImport/types';

const lines = (text: string): DocLine[] =>
  text.split('\n').map((t) => ({ text: t }));

describe('parseQuestionLines — stems and options', () => {
  it('reads a numbered stem with lettered options', () => {
    const [q] = parseQuestionLines(
      lines(`1. Which planet is closest to the sun?
A. Mercury
B. Venus
C. Mars`)
    );
    expect(q.number).toBe(1);
    expect(q.text).toBe('Which planet is closest to the sun?');
    expect(q.type).toBe('MC');
    expect(q.options.map((o) => o.text)).toEqual(['Mercury', 'Venus', 'Mars']);
  });

  it('accepts the `1)` and `(A)` punctuation styles', () => {
    const [q] = parseQuestionLines(
      lines(`1) Capital of France?
(A) Paris
(B) Lyon`)
    );
    expect(q.text).toBe('Capital of France?');
    expect(q.options.map((o) => o.letter)).toEqual(['A', 'B']);
  });

  it('reads a test whose questions are labelled, not numbered', () => {
    const [one, two] = parseQuestionLines(
      lines(`Question 1: Which planet is closest to the sun?
A. Mercury
B. Venus
Question 2: Name the largest ocean.
A. Atlantic
B. Pacific`)
    );
    expect(one.number).toBe(1);
    expect(one.text).toBe('Which planet is closest to the sun?');
    expect(one.options.map((o) => o.text)).toEqual(['Mercury', 'Venus']);
    expect(two.number).toBe(2);
    expect(two.text).toBe('Name the largest ocean.');
  });

  it('does not read a "Questions 1-5 refer to…" heading as question 1', () => {
    const questions = parseQuestionLines(
      lines(`Questions 1-5 refer to the passage below.
1. Who narrates the story?
A. Jim
B. Ada`)
    );
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe('Who narrates the story?');
  });

  it('keeps 2 and 5 option questions as written, with no minimum', () => {
    const [two, five] = parseQuestionLines(
      lines(`1. Is the sky blue?
A. Yes
B. No
2. Pick a prime.
A. 4
B. 6
C. 7
D. 8
E. 9`)
    );
    expect(two.options).toHaveLength(2);
    expect(five.options).toHaveLength(5);
  });

  it('joins a stem that wraps across lines', () => {
    const [q] = parseQuestionLines(
      lines(`1. Explain why the moon appears to change
shape over the course of a month.
A. Its orbit
B. Its shadow`)
    );
    expect(q.text).toBe(
      'Explain why the moon appears to change shape over the course of a month.'
    );
  });

  it('joins an option that wraps across lines', () => {
    const [q] = parseQuestionLines(
      lines(`1. Which is true?
A. The moon orbits the earth
roughly once a month
B. The earth orbits the moon`)
    );
    expect(q.options[0].text).toBe(
      'The moon orbits the earth roughly once a month'
    );
  });

  it('does not let a number inside a sentence restart the count', () => {
    const questions = parseQuestionLines(
      lines(`1. In 1849, what happened?
2. gold was found, some say
A. In California
B. In Nevada`)
    );
    expect(questions).toHaveLength(2);
    expect(questions[1].number).toBe(2);
  });

  it('does not read a stray letter line as an option out of sequence', () => {
    const [q] = parseQuestionLines(
      lines(`1. Which is true?
A. First
C. Not second`)
    );
    // `C.` cannot follow `A.`, so it continues the option above it.
    expect(q.options).toHaveLength(1);
    expect(q.options[0].text).toBe('First C. Not second');
  });
});

describe('parseQuestionLines — typing', () => {
  it('calls a question with no options a written response, and says why', () => {
    const [q] = parseQuestionLines(
      lines('1. Describe the water cycle in your own words.')
    );
    expect(q.type).toBe('free-response');
    expect(q.correctAnswer).toBe('');
    expect(q.warnings.join(' ')).toMatch(/written-response/i);
  });

  it('recognises True/False written as two options', () => {
    const [q] = parseQuestionLines(
      lines(`1. The sun is a star.
A. True
B. False`)
    );
    expect(q.type).toBe('MC');
    expect(isTrueFalse(q)).toBe(true);
  });

  it('warns when only one option was found', () => {
    const [q] = parseQuestionLines(
      lines(`1. Which is true?
A. Only this one`)
    );
    expect(q.warnings.join(' ')).toMatch(/only one answer choice/i);
  });
});

describe('parseQuestionLines — keys marked on the option', () => {
  it('reads a leading asterisk as the answer', () => {
    const [q] = parseQuestionLines(
      lines(`1. Which planet is closest to the sun?
* A. Mercury
B. Venus`)
    );
    expect(q.correctAnswer).toBe('Mercury');
  });

  it('reads an emphasized option as the answer', () => {
    const [q] = parseQuestionLines([
      { text: '1. Which planet is closest to the sun?' },
      { text: 'A. Mercury', emphasized: true },
      { text: 'B. Venus' },
    ]);
    expect(q.correctAnswer).toBe('Mercury');
  });

  it('leaves the answer blank and warns when several are marked', () => {
    const [q] = parseQuestionLines([
      { text: '1. Which are planets?' },
      { text: 'A. Mercury', emphasized: true },
      { text: 'B. Venus', emphasized: true },
    ]);
    expect(q.correctAnswer).toBe('');
    expect(q.warnings.join(' ')).toMatch(/more than one/i);
  });

  it('leaves the answer blank when the document marked nothing', () => {
    const [q] = parseQuestionLines(
      lines(`1. Which planet is closest to the sun?
A. Mercury
B. Venus`)
    );
    expect(q.correctAnswer).toBe('');
    expect(q.warnings).toEqual([]);
  });
});

describe('a key for a question that parsed with no choices', () => {
  it('says the choices were probably missed (deferred from #3219)', () => {
    // The document answered question 2, so it had choices there. Reading it
    // as written-response silently would leave the teacher wondering why one
    // question came out the wrong type on a test where the rest are fine.
    const [, second] = parseQuestionLines(
      lines(`1. Which planet is closest to the sun?
A. Mercury
B. Venus
2. Name the largest planet in the solar system
Answer Key
1. A
2. B`)
    );
    expect(second.type).toBe('free-response');
    expect(second.warnings.join(' ')).toMatch(
      /answer key says B for this question, so its answer choices were probably missed/i
    );
  });

  it('says nothing extra when the key had no answer for it either', () => {
    const [q] = parseQuestionLines(lines(`1. Explain why the moon has phases`));
    expect(q.type).toBe('free-response');
    expect(q.warnings.join(' ')).not.toMatch(/probably missed/i);
  });
});
