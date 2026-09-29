/**
 * Case studies and passages found by their shape, behind `quiz-import-passages`.
 */
import { describe, it, expect } from 'vitest';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';
import { extractedToQuizData } from '@/utils/quizDocumentImport/toQuizData';

const lines = (...texts: string[]) => texts.map((text) => ({ text }));

const CASE =
  'FreshFuel Bowls sells customizable grain bowls to high school and college students. Students wanted healthier meals that were fast and easy to personalize, so FreshFuel created a simple menu. Competition increased when a national chain opened nearby.';

const MC = (n: number, stem: string) => [
  `${n}. ${stem}`,
  'A. Mass Marketing',
  'B. Customer Orientation',
];

const HEADED = lines(
  'SECTION 4 — Case Study + Questions',
  'Case Study: FreshFuel Bowls',
  CASE,
  'Questions:',
  ...MC(25, 'What concept is shown?'),
  ...MC(26, 'What risk does FreshFuel face?')
);

describe('passages found by their shape', () => {
  it('turns a titled case study under a heading into one stimulus for the section', () => {
    const { questions, texts } = parseDocument(HEADED, { passages: true });
    expect(texts).toEqual([
      { id: 'text-1', text: CASE, label: 'Case Study: FreshFuel Bowls' },
    ]);
    expect(questions.map((q) => q.sharedTextId)).toEqual(['text-1', 'text-1']);
    expect(questions[0].ref?.sectionDirections).toBeUndefined();
    expect(questions[0].warnings).toContain(
      '“Case Study: FreshFuel Bowls” was attached to questions 25–26 as a passage. Check that it belongs with them.'
    );
    expect(questions[1].warnings).toEqual([]);
  });

  it('leaves the text as section directions with the flag off', () => {
    const { questions, texts } = parseDocument(HEADED);
    expect(texts).toEqual([]);
    expect(questions[0].ref?.sectionDirections).toContain('FreshFuel Bowls');
  });

  it('shows the passage once when sections are on', () => {
    const read = parseDocument(HEADED, { passages: true });
    const quiz = extractedToQuizData(
      { title: 't', images: [], warnings: [], ...read },
      { sections: true }
    );
    expect(quiz.stimuli).toHaveLength(1);
    expect(quiz.stimuli?.[0].label).toBe('Case Study: FreshFuel Bowls');
    expect(quiz.sections?.[0].directions).toBeUndefined();
    expect(quiz.questions[0].stimulusIds).toEqual([quiz.stimuli?.[0].id]);
  });

  it('keeps a passage after a question’s choices off its last choice', () => {
    const { questions, texts } = parseDocument(
      lines(
        ...MC(24, 'Which method was taught?'),
        'Case Study: FreshFuel Bowls',
        CASE,
        ...MC(25, 'What concept is shown?')
      ),
      { passages: true }
    );
    expect(questions[0].options.map((o) => o.text)).toEqual([
      'Mass Marketing',
      'Customer Orientation',
    ]);
    expect(questions[0].sharedTextId).toBeUndefined();
    expect(questions[1].sharedTextId).toBe(texts[0].id);
  });

  it('splits a titled passage off a written question', () => {
    const { questions, texts } = parseDocument(
      lines(
        '21. Write the profitability formula:',
        'Case Study: FreshFuel Bowls',
        CASE,
        ...MC(22, 'What concept is shown?')
      ),
      { passages: true }
    );
    expect(questions[0].text).toBe('Write the profitability formula:');
    expect(questions[1].sharedTextId).toBe(texts[0].id);
  });

  it('keeps a short line after the choices where it was', () => {
    const { questions, texts } = parseDocument(
      lines(...MC(1, 'Pick one.'), 'Explain your choice.', ...MC(2, 'Next.')),
      { passages: true }
    );
    expect(texts).toEqual([]);
    expect(questions[0].options[1].text).toBe(
      'Customer Orientation Explain your choice.'
    );
  });

  it('never takes a directions paragraph for a passage', () => {
    const { texts } = parseDocument(
      lines(
        'Multiple Choice',
        'Directions: Read each question carefully before you answer it. Choose the one best answer for every question on this page. You may not use notes, a calculator or a phone during this part of the test.',
        ...MC(1, 'Pick one.')
      ),
      { passages: true }
    );
    expect(texts).toEqual([]);
  });

  it('keeps a printed question range and asks nothing of it', () => {
    const { questions, texts } = parseDocument(
      lines(
        'Use the case study to answer questions 1–2.',
        CASE,
        ...MC(1, 'First?'),
        ...MC(2, 'Second?'),
        ...MC(3, 'Third?')
      ),
      { passages: true }
    );
    expect(texts).toHaveLength(1);
    expect(questions.map((q) => q.sharedTextId)).toEqual([
      'text-1',
      'text-1',
      undefined,
    ]);
    expect(questions.flatMap((q) => q.warnings)).toEqual([]);
  });
});
