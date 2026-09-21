/**
 * The answer-key block (docs/plans/QUIZ_DOCUMENT_IMPORT.md D2).
 *
 * A key entry is written exactly like a numbered question whose text is a
 * single letter, so the risk runs both ways: miss the key and every question
 * needs an answer typed in, mistake a question for the key and real questions
 * vanish from the import. Both directions are covered here.
 */
import { describe, it, expect } from 'vitest';
import { findAnswerKey } from '@/utils/quizDocumentImport/answerKey';
import { parseQuestionLines } from '@/utils/quizDocumentImport/parseQuestions';
import type { DocLine } from '@/utils/quizDocumentImport/types';

const lines = (text: string): DocLine[] =>
  text.split('\n').map((t) => ({ text: t }));

describe('findAnswerKey', () => {
  it('reads a run of one-per-line entries', () => {
    const { letterByNumber } = findAnswerKey(
      lines(`1. B
2. C
3. A`)
    );
    expect([...letterByNumber]).toEqual([
      [1, 'B'],
      [2, 'C'],
      [3, 'A'],
    ]);
  });

  it('reads entries packed onto one line', () => {
    const { letterByNumber } = findAnswerKey(lines('1. B  2. C  3. A'));
    expect(letterByNumber.get(2)).toBe('C');
  });

  it('accepts the dash and colon styles, and lowercase letters', () => {
    const { letterByNumber } = findAnswerKey(
      lines(`1-b
2: c
3 a`)
    );
    expect([...letterByNumber.values()]).toEqual(['B', 'C', 'A']);
  });

  it('trusts a short run when a heading names it', () => {
    const { letterByNumber, keyLineIndexes } = findAnswerKey(
      lines(`Answer Key
1. B`)
    );
    expect(letterByNumber.get(1)).toBe('B');
    // The heading is withheld from the question parser too.
    expect([...keyLineIndexes].sort()).toEqual([0, 1]);
  });

  it('ignores a lone unheaded entry — too short to be a key', () => {
    const { letterByNumber } = findAnswerKey(lines('1. B'));
    expect(letterByNumber.size).toBe(0);
  });

  it('is not fooled by a numbered question whose text is words', () => {
    const { letterByNumber } = findAnswerKey(
      lines(`1. Because the moon orbits
2. Since the earth spins
3. As the sun sets`)
    );
    expect(letterByNumber.size).toBe(0);
  });

  it('takes the last run when a document has more than one', () => {
    const { letterByNumber } = findAnswerKey(
      lines(`1. A
2. A
3. A

some prose

1. B
2. C
3. D`)
    );
    expect([...letterByNumber.values()]).toEqual(['B', 'C', 'D']);
  });
});

describe('a key at the back of a test', () => {
  const doc = `1. Which planet is closest to the sun?
A. Mercury
B. Venus
C. Mars
2. Which planet is largest?
A. Earth
B. Jupiter
C. Mars

Answer Key
1. A
2. B`;

  it('fills the answers and leaves the questions intact', () => {
    const questions = parseQuestionLines(lines(doc));
    expect(questions).toHaveLength(2);
    expect(questions[0].correctAnswer).toBe('Mercury');
    expect(questions[1].correctAnswer).toBe('Jupiter');
    expect(questions.flatMap((q) => q.warnings)).toEqual([]);
  });

  it('warns when the key names an option the question does not have', () => {
    const questions = parseQuestionLines(
      lines(`1. Which planet is closest to the sun?
A. Mercury
B. Venus

Answer Key
1. D`)
    );
    expect(questions[0].correctAnswer).toBe('');
    expect(questions[0].warnings.join(' ')).toMatch(/no option D/i);
  });

  it('leaves a question the key skipped needing an answer', () => {
    const questions = parseQuestionLines(
      lines(`1. First?
A. Yes
B. No
2. Second?
A. Yes
B. No
3. Third?
A. Yes
B. No

Answer Key
1. A
2. B
3. A`)
    );
    expect(questions.map((q) => q.correctAnswer)).toEqual(['Yes', 'No', 'Yes']);
  });
});
