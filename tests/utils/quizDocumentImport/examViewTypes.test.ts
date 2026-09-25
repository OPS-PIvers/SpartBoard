/**
 * Every ExamView question type, keys, points and metadata
 * (docs/plans/QUIZ_EXAMVIEW_IMPORT.md E5–E10, E17). The fixture copies
 * ExamView's RTF layout: answer blanks and option letters in their own
 * table cells, and the Answer Section at the back.
 */
import { describe, it, expect } from 'vitest';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';
import { mergeAnswerKey } from '@/utils/quizDocumentImport/mergeKey';
import { listKeyItems } from '@/utils/quizDocumentImport/answerKey';
import { extractedToQuizData } from '@/utils/quizDocumentImport/toQuizData';
import type {
  DocLine,
  ExtractedQuestion,
} from '@/utils/quizDocumentImport/types';

const row = (...cells: string[]): DocLine =>
  cells.length === 1
    ? { text: cells[0] }
    : { text: cells.join(' '), segments: cells.map((text) => ({ text })) };

const TEST: DocLine[] = [
  row('Ecology Unit Test'),
  row('True/False'),
  row('Indicate whether the statement is true or false.'),
  row('____', '1.', 'Producers make their own food.'),
  row('____', '2.', 'Decomposers are consumers of living plants.'),
  row('Modified True/False'),
  row(
    'Indicate whether the statement is true or false. If false, change the identified word or phrase to make the statement true.'
  ),
  row('____', '3.', 'A hawk is a carnivore. _________________________'),
  row('____', '4.', 'A cow is a carnivore. _________________________'),
  row('Multiple Choice'),
  row(
    'Identify the letter of the choice that best completes the statement or answers the question.'
  ),
  row('____', '5.', 'Which is a producer?'),
  row('a.', 'grass', 'c.', 'hawk'),
  row('b.', 'mouse', 'd.', 'fungus'),
  row('Completion'),
  row('Complete each statement.'),
  row('', '6.', 'Plants make food by ____________________.'),
  row('Matching'),
  row('Match each item with the correct statement below.'),
  row('a.', 'producer', 'd.', 'herbivore'),
  row('b.', 'decomposer', 'e.', 'omnivore'),
  row('c.', 'carnivore'),
  row('____', '7.', 'makes its own food'),
  row('____', '8.', 'breaks down dead matter'),
  row('____', '9.', 'eats only meat'),
  row('Numeric Response'),
  row('', '10.', 'How many trophic levels does this food chain have?'),
  row('Short Answer-2 points each'),
  row('', '11.', 'Explain what a food web shows.'),
  row('Essay'),
  row('', '12.', 'Describe how energy flows through an ecosystem.'),
  row('Ecology Unit Test'),
  row('Answer Section'),
  row('TRUE/FALSE'),
  row(
    '',
    '1.',
    'ANS:',
    'T',
    'PTS:',
    '1',
    'DIF:',
    'I',
    'OBJ:',
    '1.1 Describe producers'
  ),
  row('', '2.', 'ANS:', 'F', 'PTS:', '1', 'TOP:', 'Food chains'),
  row('MODIFIED TRUE/FALSE'),
  row('', '3.', 'ANS:', 'T', 'PTS:', '1'),
  row('', '4.', 'ANS:', 'F, herbivore', 'PTS:', '2'),
  row('MULTIPLE CHOICE'),
  row(
    '',
    '5.',
    'ANS:',
    'A',
    'PTS:',
    '1',
    'NAT:',
    'UCP.1 | C.4',
    'STA:',
    '9.4.2.1'
  ),
  row('COMPLETION'),
  row('', '6.', 'ANS:', 'photosynthesis', 'PTS:', '1'),
  row('MATCHING'),
  row('', '7.', 'ANS:', 'A', 'PTS:', '1'),
  row('', '8.', 'ANS:', 'B', 'PTS:', '1'),
  row('', '9.', 'ANS:', 'C', 'PTS:', '1'),
  row('NUMERIC RESPONSE'),
  row('', '10.', 'ANS:', '4', 'PTS:', '1'),
  row('SHORT ANSWER'),
  row('', '11.', 'ANS:'),
  row('It shows who eats whom.'),
  row('PTS:', '1'),
  row('ESSAY'),
  row('', '12.', 'ANS:'),
  row('Answers will vary.'),
  row('PTS:', '1'),
];

const byLabel = (questions: readonly ExtractedQuestion[], label: string) =>
  questions.find((q) => (q.sourceLabel ?? String(q.ref?.item)) === label);

describe('ExamView types by section (E5)', () => {
  const { questions } = parseDocument(TEST);

  it('reads every item once, with Matching as one question and 4F split in two', () => {
    expect(
      questions.map((q) => `${q.sourceLabel ?? q.ref?.item}:${q.type}`)
    ).toEqual([
      '1:MC',
      '2:MC',
      '3:MC',
      '4A:MC',
      '4B:FIB',
      '5:MC',
      '6:FIB',
      '7–9:Matching',
      '10:FIB',
      '11:free-response',
      '12:free-response',
    ]);
    expect(questions.map((q) => q.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('keys True/False items from T and F', () => {
    expect(byLabel(questions, '1')?.options.map((o) => o.text)).toEqual([
      'True',
      'False',
    ]);
    expect(byLabel(questions, '1')?.correctAnswer).toBe('True');
    expect(byLabel(questions, '2')?.correctAnswer).toBe('False');
  });

  it('keys completion and numeric response as fill in the blank', () => {
    expect(byLabel(questions, '6')?.correctAnswer).toBe('photosynthesis');
    expect(byLabel(questions, '10')?.correctAnswer).toBe('4');
  });

  it('keeps written items unkeyed with the key text as a sample', () => {
    const q11 = byLabel(questions, '11');
    expect(q11?.correctAnswer).toBe('');
    expect(q11?.warnings).toContain(
      'Key’s sample answer: It shows who eats whom.'
    );
    expect(byLabel(questions, '12')?.type).toBe('free-response');
  });
});

describe('Modified True/False (E7)', () => {
  const { questions } = parseDocument(TEST);

  it('keeps a true item as one True/False question without its blank', () => {
    const q3 = byLabel(questions, '3');
    expect(q3?.text).toBe('A hawk is a carnivore.');
    expect(q3?.correctAnswer).toBe('True');
  });

  it('splits a false item into the True/False part and the correction', () => {
    const a = byLabel(questions, '4A');
    const b = byLabel(questions, '4B');
    expect(a?.correctAnswer).toBe('False');
    expect(b?.correctAnswer).toBe('herbivore');
    expect(b?.text).toBe(
      'If false, write the word or phrase that makes it true: A cow is a carnivore.'
    );
    expect(a?.points).toBe(1);
    expect(b?.points).toBe(1);
    expect(a?.warnings).toContain(
      'Part A (true or false) and Part B (the correction) are scored separately.'
    );
  });
});

describe('Matching (E6)', () => {
  const { questions } = parseDocument(TEST);

  it('builds one Matching question from the term list and its keyed items', () => {
    const m = byLabel(questions, '7–9');
    expect(m?.text).toBe('Match each item with the correct statement below.');
    expect(m?.correctAnswer).toBe(
      'makes its own food:producer|breaks down dead matter:decomposer|eats only meat:carnivore'
    );
    expect(m?.matchingDistractors).toEqual(['herbivore', 'omnivore']);
    expect(m?.points).toBe(3);
    expect(m?.allowPartialCredit).toBe(true);
  });

  it('sums the items’ PTS for the Matching question', () => {
    const lines = TEST.map((l) =>
      l.text.trim() === '8. ANS: B PTS: 1'
        ? row('', '8.', 'ANS:', 'B', 'PTS:', '3')
        : l
    );
    const m = byLabel(parseDocument(lines).questions, '7–9');
    expect(m?.points).toBe(5);
  });

  it('carries distractors and partial credit into the saved quiz', () => {
    const quiz = extractedToQuizData({
      title: 't',
      questions,
      images: [],
      warnings: [],
    });
    const m = quiz.questions.find((q) => q.type === 'Matching');
    expect(m?.matchingDistractors).toEqual(['herbivore', 'omnivore']);
    expect(m?.allowPartialCredit).toBe(true);
    expect(m?.needsKey).toBeUndefined();
  });

  it('falls back to one multiple-choice question per item when a term is reused', () => {
    const reused = TEST.map((l) =>
      l.text.trim() === '8. ANS: B PTS: 1'
        ? row('', '8.', 'ANS:', 'A', 'PTS:', '1')
        : l
    );
    const { questions: read } = parseDocument(reused);
    const items = read.filter((q) => q.examView === 'matching');
    expect(items.map((q) => q.type)).toEqual(['MC', 'MC', 'MC']);
    expect(items[1].correctAnswer).toBe('producer');
    expect(items[0].warnings[0]).toMatch(/share an answer/);
  });
});

describe('points (E9)', () => {
  const { questions } = parseDocument(TEST);

  it('takes a heading’s points over the default PTS: 1', () => {
    expect(byLabel(questions, '11')?.points).toBe(2);
  });

  it('keeps a non-default PTS and notes the conflict', () => {
    const lines = TEST.map((l) =>
      l.text.trim() === '11. ANS:' ? row('', '11.', 'ANS:', 'PTS:', '4') : l
    );
    const q11 = byLabel(parseDocument(lines).questions, '11');
    expect(q11?.points).toBe(4);
    expect(q11?.warnings).toContain(
      'The heading gives 2 points, but the key gives 4, so the key’s points were used.'
    );
  });
});

describe('key metadata (E10)', () => {
  const { questions } = parseDocument(TEST);

  it('offers OBJ, else TOP, as the suggested target', () => {
    expect(byLabel(questions, '1')?.suggestedTarget).toEqual({
      code: '1.1',
      label: 'Describe producers',
    });
    expect(byLabel(questions, '2')?.suggestedTarget).toEqual({
      label: 'Food chains',
    });
  });

  it('keeps NAT and STA codes for the standards match', () => {
    expect(byLabel(questions, '5')?.standardCodes).toEqual([
      'UCP.1',
      'C.4',
      '9.4.2.1',
    ]);
  });

  it('never leaves metadata in an answer', () => {
    expect(byLabel(questions, '5')?.correctAnswer).toBe('grass');
  });
});

describe('key forms', () => {
  it('reads a key-only file holding just the Answer Section', () => {
    const answerSection = TEST.slice(
      TEST.findIndex((l) => l.text === 'Answer Section')
    );
    const items = listKeyItems(answerSection);
    expect(items).toHaveLength(12);
    expect(items[3]).toMatchObject({
      item: 4,
      answer: 'F, herbivore',
      points: 2,
    });
  });

  it('applies a key file to the student copy the same way', () => {
    const studentCopy = TEST.slice(
      0,
      TEST.findIndex((l) => l.text === 'Answer Section') - 1
    );
    const read = parseDocument(studentCopy);
    expect(read.questions.find((q) => q.examView === 'matching')?.type).toBe(
      'MC'
    );
    const keyed = mergeAnswerKey(
      { title: '', questions: read.questions, images: [], warnings: [] },
      listKeyItems(
        TEST.slice(TEST.findIndex((l) => l.text === 'Answer Section'))
      ),
      'file'
    );
    expect(keyed.questions.map((q) => q.sourceLabel ?? q.ref?.item)).toEqual([
      1,
      2,
      3,
      '4A',
      '4B',
      5,
      6,
      '7–9',
      10,
      11,
      12,
    ]);
  });

  it('reads answers printed under each question', () => {
    const { questions } = parseDocument([
      row('Multiple Choice'),
      row(
        'Identify the letter of the choice that best completes the statement or answers the question.'
      ),
      row('____', '1.', 'Which is a producer?'),
      row('a.', 'grass', 'b.', 'hawk'),
      row('ANS:', 'A', 'PTS:', '1', 'OBJ:', '2.1 Name producers'),
      row('Short Answer'),
      row('', '2.', 'Explain a food web.'),
      row('ANS:'),
      row('Who eats whom.'),
      row('PTS:', '1'),
    ]);
    expect(questions[0].correctAnswer).toBe('grass');
    expect(questions[0].suggestedTarget?.code).toBe('2.1');
    expect(questions[1].text).toBe('Explain a food web.');
    expect(questions[1].warnings).toContain(
      'Key’s sample answer: Who eats whom.'
    );
  });
});
