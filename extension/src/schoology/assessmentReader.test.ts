import { describe, expect, it } from 'vitest';
import { splitBlanks } from '@/utils/quizFibBlanks';
import { toQuizQuestion } from '@/utils/quizDocumentImport/toQuizData';
import fixture from './fixtures/assessment.json';
import { readAssessment } from './assessmentReader';
import { SchoologyReadError } from './readResult';

/** A one-question assessment around a Learnosity definition. */
const single = (definition: object, points = 1) => ({
  assessment: { data: { commonAssessment: { title: 'T' } } },
  components: {
    data: {
      components: [
        {
          metadata: {
            points,
            question_domain: {
              current_version: { definition: JSON.stringify(definition) },
            },
          },
        },
      ],
    },
  },
});

describe('readAssessment on the Sample Assessment', () => {
  const read = readAssessment(fixture);
  const q = read.quiz.questions;

  it('reads all five questions', () => {
    expect(read.quiz.title).toBe('Sample Assessment');
    expect(q.map((x) => x.type)).toEqual([
      'MC',
      'Matching',
      'Ordering',
      'FIB',
      'free-response',
    ]);
    expect(q.every((x) => x.points === 1)).toBe(true);
    expect(read.unsupported).toEqual([]);
  });

  it('keys multiple choice by option value', () => {
    expect(q[0].correctAnswer).toBe('option A (correct answer selected)');
    expect(q[0].options).toHaveLength(4);
  });

  it('pairs matching stems with their answers', () => {
    expect(q[1].correctAnswer).toBe(
      'Question A:Answer A|Question B:Answer B|Question C:Answer C|Question D:Answer D'
    );
    expect(q[1].matchingDistractors).toBeUndefined();
  });

  it('orders the list by the key indexes', () => {
    expect(q[2].correctAnswer).toBe('Item 1|Item 2|Item 3|Item 4');
  });

  it('turns a cloze template into a blank', () => {
    expect(q[3].text).toBe('Fill in the blank question type with one ___.');
    expect(q[3].correctAnswer).toBe('answer');
  });

  it('reads the settings', () => {
    expect(read.settings).toEqual({ shuffleQuestions: false, attempts: 1 });
  });

  it('needs no key filled in by hand', () => {
    expect(q.map(toQuizQuestion).filter((x) => x.needsKey)).toEqual([]);
  });
});

describe('Learnosity types beyond the fixture', () => {
  it('makes several keyed options a choose-all question', () => {
    const read = readAssessment(
      single({
        type: 'mcq',
        stimulus: 'Pick two',
        multiple_responses: true,
        options: [
          { label: 'a', value: '0' },
          { label: 'b', value: '1' },
          { label: 'c', value: '2' },
        ],
        validation: { valid_response: { value: ['0', '2'] } },
      })
    );
    expect(read.quiz.questions[0]).toMatchObject({
      type: 'MA',
      correctAnswer: 'a|c',
    });
  });

  it('keeps alternate cloze answers per blank', () => {
    const read = readAssessment(
      single({
        type: 'clozetext',
        template: '{{response}} and {{response}}',
        validation: {
          valid_response: { value: ['red', 'blue'] },
          alt_responses: [{ value: ['Red', 'blue'] }],
        },
      })
    );
    const question = read.quiz.questions[0];
    expect(splitBlanks(question.correctAnswer)).toEqual(['red', 'blue']);
    expect(question.blankAlternates).toEqual([['Red'], []]);
  });

  it('turns a one-blank dropdown into multiple choice', () => {
    const read = readAssessment(
      single({
        type: 'clozedropdown',
        stimulus: 'Choose',
        template: 'The sky is {{response}}.',
        possible_responses: [['green', 'blue']],
        validation: { valid_response: { value: ['blue'] } },
      })
    );
    expect(read.quiz.questions[0]).toMatchObject({
      type: 'MC',
      text: 'Choose\nThe sky is ___.',
      correctAnswer: 'blue',
    });
  });

  it('lists unused word-bank answers as matching distractors', () => {
    const read = readAssessment(
      single({
        type: 'association',
        stimulus_list: ['1', '2'],
        possible_responses: ['one', 'two', 'three'],
        validation: { valid_response: { value: ['one', 'two'] } },
      })
    );
    expect(read.quiz.questions[0].matchingDistractors).toEqual(['three']);
  });

  it('reads a short-text key', () => {
    const read = readAssessment(
      single({
        type: 'shorttext',
        stimulus: 'Capital of France?',
        validation: {
          valid_response: { value: 'Paris' },
          alt_responses: [{ value: 'paris' }],
        },
      })
    );
    expect(read.quiz.questions[0]).toMatchObject({
      type: 'FIB',
      correctAnswer: 'Paris',
      blankAlternates: [['paris']],
    });
  });

  it('keeps a hotspot question as a placeholder to look at', () => {
    const read = readAssessment(
      single({ type: 'hotspot', stimulus: '<p>Click the heart</p>' }, 4)
    );
    expect(read.unsupported).toEqual([1]);
    expect(read.quiz.questions[0]).toMatchObject({
      type: 'free-response',
      text: 'Click the heart',
      points: 4,
    });
  });

  it('collects pictures with the page origin', () => {
    const read = readAssessment({
      ...single({ type: 'longtextV2', stimulus: '<img src="/file_download/x">' }),
      origin: 'https://orono.schoology.com',
    });
    expect(read.imageUrls).toEqual([
      'https://orono.schoology.com/file_download/x',
    ]);
  });

  it('refuses data in a shape it does not know', () => {
    expect(() => readAssessment({ assessment: {}, components: {} })).toThrow(
      SchoologyReadError
    );
  });
});
