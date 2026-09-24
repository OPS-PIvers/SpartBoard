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
    const { answerByNumber } = findAnswerKey(
      lines(`1. B
2. C
3. A`)
    );
    expect([...answerByNumber]).toEqual([
      [1, 'B'],
      [2, 'C'],
      [3, 'A'],
    ]);
  });

  it('reads entries packed onto one line', () => {
    const { answerByNumber } = findAnswerKey(lines('1. B  2. C  3. A'));
    expect(answerByNumber.get(2)).toBe('C');
  });

  it('accepts the dash and colon styles, and lowercase letters', () => {
    const { answerByNumber } = findAnswerKey(
      lines(`1-b
2: c
3 a`)
    );
    expect([...answerByNumber.values()]).toEqual(['B', 'C', 'A']);
  });

  it('trusts a short run when a heading names it', () => {
    const { answerByNumber, keyLineIndexes } = findAnswerKey(
      lines(`Answer Key
1. B`)
    );
    expect(answerByNumber.get(1)).toBe('B');
    // The heading is withheld from the question parser too.
    expect([...keyLineIndexes].sort()).toEqual([0, 1]);
  });

  it('ignores a lone unheaded entry — too short to be a key', () => {
    const { answerByNumber } = findAnswerKey(lines('1. B'));
    expect(answerByNumber.size).toBe(0);
  });

  it('is not fooled by a numbered question whose text is words', () => {
    const { answerByNumber } = findAnswerKey(
      lines(`1. Because the moon orbits
2. Since the earth spins
3. As the sun sets`)
    );
    expect(answerByNumber.size).toBe(0);
  });

  it('takes the last run when a document has more than one', () => {
    const { answerByNumber } = findAnswerKey(
      lines(`1. A
2. A
3. A

some prose

1. B
2. C
3. D`)
    );
    expect([...answerByNumber.values()]).toEqual(['B', 'C', 'D']);
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

describe('the other ways teachers write a key', () => {
  it('reads a letter followed by the choice it names', () => {
    const { answerByNumber } = findAnswerKey(
      lines(`1. B - Venus
2. C. Mars
3) a) Mercury`)
    );
    expect([...answerByNumber.values()]).toEqual(['B', 'C', 'A']);
  });

  it('reads true and false answers', () => {
    const { answerByNumber } = findAnswerKey(
      lines(`Answer Key
1. T
2. False
3. F`)
    );
    expect([...answerByNumber.values()]).toEqual(['T', 'False', 'F']);
  });

  it('reads written answers under a heading, and not without one', () => {
    const headed = findAnswerKey(
      lines(`1. Pick one.
2. What do plants do with light?
Unit 3 Test - Answer Key
1. B
2. photosynthesis`)
    );
    expect([...headed.answerByNumber]).toEqual([
      [1, 'B'],
      [2, 'photosynthesis'],
    ]);
    expect(headed.keyLineIndexes.has(2)).toBe(true);
  });

  it('does not take new questions under a "Key:" line for a key', () => {
    const questions = parseQuestionLines(
      lines(`Key: Vocabulary
1. Define osmosis.
2. Define diffusion.`)
    );
    expect(questions.map((q) => q.number)).toEqual([1, 2]);
  });

  it('reads a key table whose cells came out as separate lines', () => {
    const { answerByNumber } = findAnswerKey(
      lines(`Question | Answer
1
B
2
D`)
    );
    expect([...answerByNumber]).toEqual([
      [1, 'B'],
      [2, 'D'],
    ]);
  });

  it('does not take "Answer the following" for a heading', () => {
    const questions = parseQuestionLines(
      lines(`Answer the following questions.
1. Pick one.
A. Yes
B. No`)
    );
    expect(questions).toHaveLength(1);
  });
});

describe('a test-bank (ExamView) answer section', () => {
  const test = `Honors Biology-Ecology Test 2026
Multiple Choice
Identify the choice that best completes the statement or answers the question.
____ 1. A bird that has eaten an insect that fed on a plant is considered a
a. producer.
b. primary consumer.
c. secondary consumer.
2. Which level holds the most energy?
a. producers
b. herbivores
c. carnivores
3. True or false: energy is recycled.
a. True
b. False
4. The organ that senses light is the
5. Name a plant that pandas eat.
6. Explain why food chains are short.
Honors Biology-Ecology Test 2026
Answer Section
MULTIPLE CHOICE
1. ANS: C PTS: 1
2.ANS:APTS:1
3. ANS: F PTS: 1 DIF: Easy
SHORT ANSWER
4. ANS:
eyes
PTS: 1
5. ANS:
bamboo
PTS: 1 REF: 12.3
ESSAY
6. ANS:
Answers will vary, but most energy is lost as heat.
PTS: 1`;

  it('reads every entry, including answers on the line below ANS', () => {
    const { answerByNumber } = findAnswerKey(lines(test));
    expect([...answerByNumber]).toEqual([
      [1, 'C'],
      [2, 'A'],
      [3, 'F'],
      [4, 'eyes'],
      [5, 'bamboo'],
      [6, 'Answers will vary, but most energy is lost as heat.'],
    ]);
  });

  it('applies the key and keeps the answer section out of the questions', () => {
    const questions = parseQuestionLines(lines(test));
    expect(questions).toHaveLength(6);
    expect(questions.map((q) => q.correctAnswer)).toEqual([
      'secondary consumer.',
      'producers',
      'False',
      'eyes',
      'bamboo',
      '',
    ]);
    expect(questions[3].type).toBe('FIB');
    expect(questions[5].type).toBe('free-response');
    // The repeated title and "Answer Section" don't trail onto question 6.
    expect(questions[5].text).toBe('Explain why food chains are short.');
  });

  it('reads ANS lines printed under each question', () => {
    const questions = parseQuestionLines(
      lines(`1. Which planet is closest to the sun?
A. Mercury
B. Venus
ANS: A PTS: 1
DIF: Easy
2. Which planet is largest?
A. Earth
B. Jupiter
ANS: B PTS: 1`)
    );
    expect(questions.map((q) => q.correctAnswer)).toEqual([
      'Mercury',
      'Jupiter',
    ]);
    expect(questions[0].options).toHaveLength(2);
  });
});

const MULTI = { multiAnswer: true };

describe('a key with several letters for one question', () => {
  it('ignores a letter list while choose-all is off', () => {
    const { answerByNumber } = findAnswerKey(
      lines(`Answer Key
1. A, C`)
    );
    expect(answerByNumber.get(1)).not.toBe('A, C');
  });

  it('reads `3. A, C` as one entry and keys a choose-all question', () => {
    const [, , q3] = parseQuestionLines(
      lines(`1. Pick one.
A. Yes
B. No
2. Pick one.
A. Up
B. Down
3. Which are mammals?
A. Whale
B. Shark
C. Bat
Answer Key
1. A
2. B
3. A, C`),
      MULTI
    );
    expect(q3.type).toBe('MA');
    expect(q3.correctAnswer).toBe('Whale|Bat');
    expect(q3.warnings.join(' ')).toMatch(/choose all that apply/i);
  });

  it('reads `A and C` and `A & C` the same way', () => {
    const { answerByNumber } = findAnswerKey(
      lines(`Answer Key
1. a and c
2. B & D`),
      MULTI
    );
    expect(answerByNumber.get(1)).toBe('A, C');
    expect(answerByNumber.get(2)).toBe('B, D');
  });

  it('notes a listed letter the question does not have', () => {
    const [q] = parseQuestionLines(
      lines(`1. Which are mammals?
A. Whale
B. Shark
Answer Key
1. A, D`),
      MULTI
    );
    expect(q.correctAnswer).toBe('');
    expect(q.warnings.join(' ')).toMatch(/no option D/);
  });
});
