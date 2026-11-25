import { describe, expect, it, vi } from 'vitest';
import type { GuidedLearningResponse, GuidedLearningStep } from '@/types';

const exportResultsToSheet = vi.fn((..._args: unknown[]) =>
  Promise.resolve('https://sheet')
);
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/quizDriveService', () => ({
  QuizDriveService: class {
    exportResultsToSheet = exportResultsToSheet;
  },
}));

import {
  buildResultsSheetData,
  formatQuizAnswerPlain,
} from '@/utils/assignmentExportShared';
import {
  exportGuidedLearningResults,
  glSheetGrade,
  glSheetQuestions,
  glSheetResponses,
} from '@/utils/guidedLearningResultsExport';

const step = (
  id: string,
  question: GuidedLearningStep['question']
): GuidedLearningStep => ({
  id,
  xPct: 0,
  yPct: 0,
  imageIndex: 0,
  interactionType: 'question',
  question,
});

const mc = (id: string, text: string, correct: string) =>
  step(id, {
    type: 'multiple-choice',
    text,
    choices: [correct, 'wrong'],
    correctAnswer: correct,
  });

const response = (
  answers: GuidedLearningResponse['answers'],
  extra: Partial<GuidedLearningResponse> = {}
): GuidedLearningResponse => ({
  sessionId: 's1',
  studentAnonymousId: 'uid-1',
  startedAt: 0,
  completedAt: 1000,
  score: null,
  answers,
  ...extra,
});

const sheet = (
  responses: GuidedLearningResponse[],
  steps: GuidedLearningStep[],
  names?: Map<string, { givenName: string; familyName: string }>
) =>
  buildResultsSheetData(
    glSheetResponses(responses, steps),
    glSheetQuestions(steps),
    glSheetGrade,
    { byStudentUid: names, formatAnswer: formatQuizAnswerPlain }
  );

describe('Guided Learning results on the shared sheet builder', () => {
  it('names students "Last, First" instead of their pseudonym id', () => {
    const steps = [mc('s1', 'What is 1+1?', '2')];
    const { headers, dataRows } = sheet(
      [response([{ stepId: 's1', answer: '2', isCorrect: null }])],
      steps,
      new Map([['uid-1', { givenName: 'Ada', familyName: 'Lovelace' }]])
    );
    expect(headers[3]).toBe('Student');
    expect(dataRows[0][3]).toBe('Lovelace, Ada');
    expect(dataRows[0].join()).not.toContain('uid-1');
  });

  it('scores each question 1 point with the Guided Learning answer key', () => {
    const steps = [mc('s1', 'One?', 'a'), mc('s2', 'Two?', 'b')];
    const { headers, dataRows } = sheet(
      [
        response([
          { stepId: 's1', answer: 'a', isCorrect: null },
          { stepId: 's2', answer: 'nope', isCorrect: null },
        ]),
      ],
      steps
    );
    const col = (h: string) => headers.indexOf(h);
    expect(dataRows[0][col('Score (%)')]).toBe('50%');
    expect(dataRows[0][col('Points Earned')]).toBe('1');
    expect(dataRows[0][col('Max Points')]).toBe('2');
    expect(dataRows[0][col('Q1 Answer')]).toBe('a');
    expect(dataRows[0][col('Q2 Answer')]).toBe('nope');
  });

  it('keeps the first answer per step and the first copy of a step', () => {
    const steps = [mc('s1', 'Original', 'right'), mc('s1', 'Copy', 'right')];
    const { headers, dataRows } = sheet(
      [
        response([
          { stepId: 's1', answer: 'right', isCorrect: null },
          { stepId: 's1', answer: 'wrong', isCorrect: null },
        ]),
      ],
      steps
    );
    expect(headers.filter((h) => /^Q\d+ \(/.test(h))).toEqual([
      'Q1 (1pt): Original',
    ]);
    expect(dataRows[0][headers.indexOf('Points Earned')]).toBe('1');
  });

  it('shows matching and sorting answers as readable text and grades them', () => {
    const steps = [
      step('m', {
        type: 'matching',
        text: 'Match',
        matchingPairs: [
          { left: 'cat', right: 'meow' },
          { left: 'dog', right: 'woof' },
        ],
      }),
      step('o', { type: 'sorting', text: 'Order', sortingItems: ['a', 'b'] }),
    ];
    const { headers, dataRows } = sheet(
      [
        response([
          { stepId: 'm', answer: ['cat:meow', 'dog:woof'], isCorrect: null },
          { stepId: 'o', answer: ['b', 'a'], isCorrect: null },
        ]),
      ],
      steps
    );
    expect(dataRows[0][headers.indexOf('Q1 Answer')]).toBe(
      'cat → meow; dog → woof'
    );
    expect(dataRows[0][headers.indexOf('Q2 Answer')]).toBe('1. b; 2. a');
    expect(dataRows[0][headers.indexOf('Points Earned')]).toBe('1');
  });

  it('leaves the score blank until the student finishes', () => {
    const steps = [mc('s1', 'Q', 'a')];
    const { headers, dataRows } = sheet(
      [
        response([{ stepId: 's1', answer: 'a', isCorrect: null }], {
          completedAt: null,
        }),
      ],
      steps
    );
    expect(dataRows[0][headers.indexOf('Status')]).toBe('in-progress');
    expect(dataRows[0][headers.indexOf('Score (%)')]).toBe('');
  });

  it('adds an Email column for staff rows', () => {
    const steps = [mc('s1', 'Q', 'a')];
    const { headers, dataRows } = sheet(
      [
        response([], {
          staffEmail: 'pat@orono.k12.mn.us',
          staffName: 'Pat T',
        }),
      ],
      steps
    );
    expect(headers[4]).toBe('Email');
    expect(dataRows[0][3]).toBe('Pat T');
    expect(dataRows[0][4]).toBe('pat@orono.k12.mn.us');
  });

  it('exports through the Quiz sheet exporter with a Final score column', async () => {
    const steps = [mc('s1', 'Q', 'a')];
    const r = response([{ stepId: 's1', answer: 'a', isCorrect: null }]);
    await exportGuidedLearningResults('tok', 'Title', [r], steps, {
      finalScore: () => 'Excused',
    });
    const [title, responses, , options] = exportResultsToSheet.mock
      .calls[0] as [
      string,
      unknown[],
      unknown,
      {
        gradeFn: unknown;
        formatAnswer: unknown;
        extraColumn: { header: string; cell: (r: unknown) => string };
      },
    ];
    expect(title).toBe('Title');
    expect(options.gradeFn).toBe(glSheetGrade);
    expect(options.formatAnswer).toBe(formatQuizAnswerPlain);
    expect(options.extraColumn.header).toBe('Final score');
    expect(options.extraColumn.cell(responses[0])).toBe('Excused');
  });
});
