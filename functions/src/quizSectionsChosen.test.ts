import { describe, it, expect } from 'vitest';
import {
  notChosenIds,
  parseChooseSections,
  parseCountedChoices,
} from './quizSectionsChosen';
import {
  computeAssessmentAggregate,
  resolveGroupQuestions,
  type SessionInput,
} from './plcAssessmentMath';

const pickOne = [{ chooseCount: 1, questionIds: ['q2', 'q3'] }];

describe('parseChooseSections', () => {
  it('keeps sections with question ids and a positive whole count', () => {
    expect(
      parseChooseSections([
        { id: 's', title: 'T', chooseCount: 1, questionIds: ['a', 'b', 7] },
        { questionIds: [] },
        { chooseCount: 0.5, questionIds: ['c'] },
        'junk',
      ])
    ).toEqual([
      { id: 's', chooseCount: 1, questionIds: ['a', 'b'] },
      { questionIds: ['c'] },
    ]);
    expect(parseChooseSections(undefined)).toEqual([]);
  });
});

describe('notChosenIds', () => {
  it('leaves out the unanswered question once N are answered', () => {
    const ids = notChosenIds(pickOne, [{ questionId: 'q3', answer: 'x' }]);
    expect([...ids]).toEqual(['q2']);
  });

  it('treats a tags-only answer as unanswered', () => {
    const ids = notChosenIds(pickOne, [
      { questionId: 'q3', answer: '<p><br></p>' },
    ]);
    expect([...ids]).toEqual(['q3']);
  });

  it('keeps the first N when more were answered', () => {
    const ids = notChosenIds(pickOne, [
      { questionId: 'q3', answer: 'x' },
      { questionId: 'q2', answer: 'y' },
    ]);
    expect([...ids]).toEqual(['q3']);
  });

  it('counts an unanswered question as chosen when fewer than N were answered', () => {
    expect([...notChosenIds(pickOne, [])]).toEqual(['q3']);
  });
});

describe('PLC aggregate with a choose-N section', () => {
  const publicQuestions = [
    { id: 'q1', type: 'MC', text: 'Capital?', choices: ['A', 'B'] },
    { id: 'q2', type: 'FIB', text: 'Two plus two?' },
    { id: 'q3', type: 'free-response', text: 'Explain.' },
  ];
  const groupQuestions = resolveGroupQuestions(
    {
      questions: [
        {
          id: 'q1',
          type: 'MC',
          text: 'Capital?',
          correctAnswer: 'A',
          incorrectAnswers: ['B'],
        },
        { id: 'q2', type: 'FIB', text: 'Two plus two?', correctAnswer: '4' },
        { id: 'q3', type: 'free-response', text: 'Explain.', points: 5 },
      ],
    },
    publicQuestions
  );
  const session = (sections?: SessionInput['sections']): SessionInput => ({
    id: 's1',
    teacherUid: 't1',
    teacherName: 'T',
    publicQuestions,
    responses: [
      {
        studentUid: 'u1',
        score: null,
        answers: [
          { questionId: 'q1', answer: 'A' },
          { questionId: 'q2', answer: '4' },
        ],
      },
    ],
    scorePublishedAt: null,
    ...(sections ? { sections } : {}),
  });
  const run = (sections?: SessionInput['sections']) =>
    computeAssessmentAggregate({
      assessmentId: 'a1',
      title: 'Test',
      kind: 'quiz',
      groupQuestions,
      sessions: [session(sections)],
    });

  it('scores over the chosen questions and leaves the other out of its denominator', () => {
    const agg = run(pickOne);
    expect(agg.teamAveragePercent).toBe(100);
    const q3 = agg.perQuestion.find((q) => q.questionId === 'q3');
    expect(q3?.servedCount).toBe(0);
  });

  it('is unchanged for a session without sections', () => {
    const q3 = run().perQuestion.find((q) => q.questionId === 'q3');
    expect(q3?.servedCount).toBe(1);
  });
});

describe('teacher picks (countedChoices)', () => {
  const twoOfThree = [
    { id: 's1', chooseCount: 2, questionIds: ['a', 'b', 'c'] },
  ];
  const all = [
    { questionId: 'a', answer: 'x' },
    { questionId: 'b', answer: 'y' },
    { questionId: 'c', answer: 'z' },
  ];

  it('counts the first N without a pick', () => {
    expect([...notChosenIds(twoOfThree, all)]).toEqual(['c']);
  });

  it('counts the picked questions instead', () => {
    expect([
      ...notChosenIds(twoOfThree, all, undefined, { s1: ['a', 'c'] }),
    ]).toEqual(['b']);
  });

  it('tops up a short pick with answered questions in order', () => {
    expect([
      ...notChosenIds(twoOfThree, all, undefined, { s1: ['c'] }),
    ]).toEqual(['b']);
  });

  it('ignores a pick whose question has no answer', () => {
    expect([
      ...notChosenIds(twoOfThree, all.slice(0, 2), undefined, {
        s1: ['c', 'b'],
      }),
    ]).toEqual(['c']);
  });

  it('keeps picks only for the current attempt', () => {
    const choices = { attempt: 1, bySection: { s1: ['a', 'c'], x: [] } };
    expect(
      parseCountedChoices({ completedAttempts: 1, countedChoices: choices })
    ).toEqual({ s1: ['a', 'c'] });
    expect(
      parseCountedChoices({ completedAttempts: 2, countedChoices: choices })
    ).toBeUndefined();
    expect(parseCountedChoices({ countedChoices: 'junk' })).toBeUndefined();
  });

  it('PLC math scores the question the teacher picked', () => {
    const groupQuestions = resolveGroupQuestions(
      {
        questions: [
          { id: 'q1', type: 'FIB', text: 'One?', correctAnswer: '1' },
          { id: 'q2', type: 'FIB', text: 'Two?', correctAnswer: '2' },
        ],
      },
      [
        { id: 'q1', type: 'FIB', text: 'One?' },
        { id: 'q2', type: 'FIB', text: 'Two?' },
      ]
    );
    const run = (countedChoices?: Record<string, string[]>) =>
      computeAssessmentAggregate({
        assessmentId: 'a1',
        title: 'Test',
        kind: 'quiz',
        groupQuestions,
        sessions: [
          {
            id: 's1',
            teacherUid: 't1',
            teacherName: 'T',
            publicQuestions: [
              { id: 'q1', type: 'FIB', text: 'One?' },
              { id: 'q2', type: 'FIB', text: 'Two?' },
            ],
            responses: [
              {
                studentUid: 'u1',
                score: null,
                answers: [
                  { questionId: 'q1', answer: 'wrong' },
                  { questionId: 'q2', answer: '2' },
                ],
                ...(countedChoices ? { countedChoices } : {}),
              },
            ],
            scorePublishedAt: null,
            sections: [
              { id: 'sec', chooseCount: 1, questionIds: ['q1', 'q2'] },
            ],
          },
        ],
      });
    expect(run().teamAveragePercent).toBe(0);
    expect(run({ sec: ['q2'] }).teamAveragePercent).toBe(100);
  });
});
