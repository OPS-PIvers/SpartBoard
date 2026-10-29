import { describe, expect, it } from 'vitest';
import { splitBlanks } from '@/utils/quizFibBlanks';
import { toQuizQuestion } from '@/utils/quizDocumentImport/toQuizData';
import fixture from './fixtures/classicQuiz.json';
import {
  classicFormEntries,
  classicQuestionList,
  readClassicQuiz,
  type FormEntries,
} from './classicReader';
import { SchoologyReadError } from './readResult';

const input = {
  title: fixture.title,
  questions: fixture.questions.map((q) => ({
    type: q.type,
    entries: q.entries as FormEntries,
  })),
  settings: fixture.settings as FormEntries,
};

describe('readClassicQuiz on the Sample Test/Quiz', () => {
  const read = readClassicQuiz(input);
  const q = read.quiz.questions;

  it('reads every question with its points', () => {
    expect(read.quiz.title).toBe('Sample Test/Quiz');
    expect(q).toHaveLength(9);
    expect(q.map((x) => x.points)).toEqual([1, 1, 2, 5, 1, 1, 1, 1, 1]);
    expect(read.unsupported).toEqual([]);
  });

  it('turns True/False into a keyed two-choice question', () => {
    expect(q[0]).toMatchObject({
      type: 'MC',
      text: 'Here is a sample True/False question',
      options: [
        { letter: 'A', text: 'True' },
        { letter: 'B', text: 'False' },
      ],
      correctAnswer: 'False',
    });
    expect(q[0].imageIds).toEqual([
      'https://orono.schoology.com/file_download/d709093d-adc9-4446-815c-22f7e5cc2aa8',
    ]);
  });

  it('keys multiple choice and moves a choice picture onto the question', () => {
    expect(q[1].type).toBe('MC');
    expect(q[1].correctAnswer).toBe('choice 1 (correct answer selected)');
    expect(q[1].options.map((o) => o.text)).toEqual([
      'choice 1 (correct answer selected)',
      'choice 2',
      'choice 3',
      'choice 4',
    ]);
    expect(q[1].imageIds).toHaveLength(1);
    expect(q[1].warnings[0]).toMatch(/Choice A had a picture/);
  });

  it('puts ordering items in Schoology order', () => {
    expect(q[2]).toMatchObject({
      type: 'Ordering',
      correctAnswer: 'Item 1|Item 2|Item 3|Item 4',
      allowPartialCredit: true,
    });
  });

  it('keeps the essay as a written question and names the character limit', () => {
    expect(q[3].type).toBe('free-response');
    expect(q[3].warnings[0]).toMatch(/400 characters/);
  });

  it('reads a blank with two accepted answers', () => {
    expect(q[4].type).toBe('FIB');
    expect(q[4].text).toBe(
      'Fill in the blank question text with one ___ that has two possibilities.'
    );
    expect(q[4].correctAnswer).toBe('answer');
    expect(q[4].blankAlternates).toEqual([['response']]);
    expect(toQuizQuestion(q[4]).alternateAnswers).toEqual(['response']);
  });

  it('reads matching pairs and the filler words', () => {
    expect(q[5]).toMatchObject({
      type: 'Matching',
      correctAnswer:
        'Question A:Answer A|Question B:Answer B|Question C:Answer C|Question D:Answer D',
      matchingDistractors: ['Filler Word E', 'Filler Word F'],
    });
  });

  it('makes several correct choices a choose-all question', () => {
    expect(q[7].type).toBe('MA');
    expect(q[7].correctAnswer).toBe('choice 1|choice 2');
    expect(q[7].options).toHaveLength(5);
  });

  it('reads a question with two blanks', () => {
    expect(q[8].text).toBe(
      'Fill in the blank with ___ blanks in ___ sentence.'
    );
    expect(splitBlanks(q[8].correctAnswer)).toEqual(['two', 'one']);
    expect(q[8].warnings).toEqual([]);
  });

  it('collects each picture once', () => {
    expect(read.imageUrls).toHaveLength(4);
  });

  it('reads the quiz settings', () => {
    expect(read.settings).toEqual({ shuffleQuestions: false, attempts: 1 });
  });

  it('turns every question into a quiz question with a key', () => {
    const quizQuestions = q.map(toQuizQuestion);
    expect(quizQuestions.filter((x) => x.needsKey)).toEqual([]);
  });
});

describe('classic reader edges', () => {
  it('keeps an unknown question type as a placeholder to look at', () => {
    const read = readClassicQuiz({
      title: 'X',
      questions: [
        {
          type: 'formula',
          entries: [
            ['title', '<p>What is 2 + 2?</p>'],
            ['points', '3'],
          ],
        },
      ],
    });
    expect(read.unsupported).toEqual([1]);
    expect(read.quiz.questions[0]).toMatchObject({
      type: 'free-response',
      text: 'What is 2 + 2?',
      points: 3,
    });
  });

  it('leaves an unkeyed choice question without an answer', () => {
    const read = readClassicQuiz({
      title: 'X',
      questions: [
        {
          type: 'multiple_choice',
          entries: [
            ['title', 'Pick one'],
            ['multiple_choice[choice][0][text]', 'a'],
            ['multiple_choice[choice][1][text]', 'b'],
          ],
        },
      ],
    });
    expect(toQuizQuestion(read.quiz.questions[0]).needsKey).toBe(true);
  });

  it('keeps the first accepted answer first when the form lists them out of order', () => {
    const read = readClassicQuiz({
      title: 'X',
      questions: [
        {
          type: 'fitb',
          entries: [
            ['title', 'A _ day'],
            ['blanks[delta][0][answer][10]', 'tenth'],
            ['blanks[delta][0][answer][2]', 'second'],
            ['blanks[delta][0][answer][0]', 'first'],
          ],
        },
      ],
    });
    expect(read.quiz.questions[0]).toMatchObject({
      correctAnswer: 'first',
      blankAlternates: [['second', 'tenth']],
    });
  });

  it('refuses a quiz with no questions', () => {
    expect(() => readClassicQuiz({ title: 'X', questions: [] })).toThrow(
      SchoologyReadError
    );
  });
});

describe('classic page parsing', () => {
  it('lists question rows in order', () => {
    const html = `
      <div class="component-summary-wrapper component-true_false"><a href="/assignment/1/assessment_questions/edit_question/11">Edit</a></div>
      <div class="component-summary-wrapper component-fitb"><a href="/assignment/1/assessment_questions/edit_question/12">Edit</a></div>`;
    expect(classicQuestionList(html)).toEqual([
      { type: 'true_false', questionId: '11' },
      { type: 'fitb', questionId: '12' },
    ]);
  });

  it('reads a form as a submit would, without unchecked boxes', () => {
    const html = `<form><input name="q"></form>
      <form id="edit">
        <textarea name="title">&lt;p&gt;Hi&lt;/p&gt;</textarea>
        <input type="checkbox" name="multiple_choice[choice][0][is_answer]" value="1" checked>
        <input type="checkbox" name="multiple_choice[choice][1][is_answer]" value="1">
        <select name="correct"><option value="t">True</option><option value="f" selected>False</option></select>
        <input type="submit" name="op" value="Save">
      </form>`;
    expect(classicFormEntries(html)).toEqual([
      ['title', '<p>Hi</p>'],
      ['multiple_choice[choice][0][is_answer]', '1'],
      ['correct', 'f'],
    ]);
  });
});
