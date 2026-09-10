import { describe, expect, it } from 'vitest';
import type {
  QuestionTargetTag,
  QuizPublicQuestion,
  QuizQuestion,
  QuizResponse,
} from '@/types';
import {
  buildTargetGridCsv,
  computeTargetStats,
  groupQuestionsByTargets,
  masteryBandFor,
} from '@/utils/quizTargetStats';

const CUTOFFS = { proficient: 80, approaching: 60 };

const standard: QuestionTargetTag = {
  id: 'mn-ela-2020:6.4.2.2',
  kind: 'standard',
  code: '6.4.2.2',
  label: 'Analyze a central idea.',
};

const target: QuestionTargetTag = {
  id: 'lt-central-idea',
  kind: 'plc',
  ownerId: 'plc-1',
  code: 'LT 2',
  label: 'I can analyze a central idea.',
  standardIds: [standard.id],
};

const secondTarget: QuestionTargetTag = {
  id: 'lt-evidence',
  kind: 'personal',
  code: 'LT 3',
  label: 'I can choose relevant evidence.',
  standardIds: [standard.id],
};

const question = (id: string, targets: QuestionTargetTag[]): QuizQuestion =>
  ({
    id,
    type: 'MC',
    text: `Question ${id}`,
    correctAnswer: 'Correct',
    incorrectAnswers: ['Wrong'],
    timeLimit: 30,
    points: 1,
    targets,
  }) as QuizQuestion;

const response = (
  uid: string,
  servedQuestionIds: string[],
  answers: Array<{ questionId: string; answer: string }>
): QuizResponse =>
  ({
    _responseKey: `response-${uid}`,
    studentUid: uid,
    joinedAt: 1,
    status: 'completed',
    servedQuestionIds,
    answers: answers.map((answer) => ({ ...answer, answeredAt: 2 })),
    score: null,
    submittedAt: 3,
  }) as QuizResponse;

describe('computeTargetStats', () => {
  it('uses served subsets, weighted question scores and union standard rollups', () => {
    const questions = [
      question('q1', [target, secondTarget, standard]),
      question('q2', [standard]),
    ];
    const responses = [
      response(
        'a',
        ['q1', 'q2'],
        [
          { questionId: 'q1', answer: 'Correct' },
          { questionId: 'q2', answer: 'Correct' },
        ]
      ),
      response('b', ['q1'], [{ questionId: 'q1', answer: 'Wrong' }]),
      response('c', ['q2'], [{ questionId: 'q2', answer: 'Wrong' }]),
    ];

    const result = computeTargetStats(questions, responses, CUTOFFS);
    const learningTarget = result.targets.find(
      (row) => row.target.id === target.id
    );
    const directStandard = result.targets.find(
      (row) => row.target.id === standard.id
    );
    const standardRollup = result.standards.find(
      (row) => row.target.id === standard.id
    );

    expect(learningTarget).toMatchObject({
      questionIds: ['q1'],
      servedCount: 2,
      attempted: 2,
      correctPercent: 50,
      lowSample: true,
      band: 'beginning',
    });
    expect(directStandard).toMatchObject({
      questionIds: ['q1', 'q2'],
      servedCount: 4,
      attempted: 4,
      correctPercent: 50,
    });
    // q1 reaches the standard three ways (directly and through two child
    // targets), but the union rollup still counts that question once.
    expect(standardRollup).toMatchObject({
      questionIds: ['q1', 'q2'],
      servedCount: 4,
      attempted: 4,
      correctPercent: 50,
    });
  });

  it('computes each student cell with the same scorer as class results', () => {
    const questions = [question('q1', [target])];
    const result = computeTargetStats(
      questions,
      [
        response('a', ['q1'], [{ questionId: 'q1', answer: 'Correct' }]),
        response('b', ['q1'], [{ questionId: 'q1', answer: 'Wrong' }]),
      ],
      CUTOFFS
    );

    expect(result.byStudent.get('response-a')?.get(target.id)).toMatchObject({
      servedCount: 1,
      attempted: 1,
      correctPercent: 100,
      band: 'proficient',
    });
    expect(result.byStudent.get('response-b')?.get(target.id)).toMatchObject({
      servedCount: 1,
      attempted: 1,
      correctPercent: 0,
      band: 'beginning',
    });
  });

  it('does not count lobby-only responses as served', () => {
    const lobby = {
      ...response('a', [], []),
      status: 'joined' as const,
    };
    const result = computeTargetStats(
      [question('q1', [target])],
      [lobby],
      CUTOFFS
    );
    expect(result.targets[0]).toMatchObject({
      servedCount: 0,
      attempted: 0,
      correctPercent: null,
    });
  });
});

describe('target mastery helpers', () => {
  it('applies configurable cutoffs at both boundaries', () => {
    expect(masteryBandFor(80, CUTOFFS)).toBe('proficient');
    expect(masteryBandFor(79, CUTOFFS)).toBe('approaching');
    expect(masteryBandFor(60, CUTOFFS)).toBe('approaching');
    expect(masteryBandFor(59, CUTOFFS)).toBe('beginning');
    expect(masteryBandFor(null, CUTOFFS)).toBeNull();
  });

  it('quotes cells that require escaping in the student grid CSV', () => {
    const stats = computeTargetStats(
      [question('q1', [target])],
      [response('a', ['q1'], [{ questionId: 'q1', answer: 'Correct' }])],
      CUTOFFS
    );
    const csv = buildTargetGridCsv(stats.targets, [
      {
        name: 'Rivera, Ana',
        values: new Map([[target.id, 100]]),
      },
    ]);
    expect(csv).toBe(
      'Student,LT 2 I can analyze a central idea.\r\n"Rivera, Ana",100'
    );
  });
});

describe('groupQuestionsByTargets', () => {
  it('groups exact tag sets without duplicating multi-tag questions', () => {
    const questions: QuizPublicQuestion[] = [
      {
        id: 'q1',
        type: 'MC',
        text: 'One',
        timeLimit: 30,
        targets: [secondTarget, target],
      },
      {
        id: 'q2',
        type: 'MC',
        text: 'Two',
        timeLimit: 30,
        targets: [target, secondTarget],
      },
      { id: 'q3', type: 'MC', text: 'Three', timeLimit: 30 },
    ];

    const groups = groupQuestionsByTargets(questions);
    expect(groups).toHaveLength(2);
    expect(groups[0].questions.map((item) => item.id)).toEqual(['q1', 'q2']);
    expect(groups[0].targets.map((item) => item.id)).toEqual([
      target.id,
      secondTarget.id,
    ]);
    expect(groups[1]).toMatchObject({ key: 'untagged', targets: [] });
    expect(groups.flatMap((group) => group.questions)).toHaveLength(3);
  });
});
