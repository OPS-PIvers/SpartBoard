import { describe, expect, it } from 'vitest';
import {
  computeFlashcardAggregate,
  parseSubmittedFlashcardCheck,
} from './plcFlashcardAggregate';

describe('parseSubmittedFlashcardCheck', () => {
  it('needs a submittedAt and keeps only well-formed graded answers', () => {
    expect(parseSubmittedFlashcardCheck({ score: 1, total: 1 })).toBeNull();
    expect(
      parseSubmittedFlashcardCheck({
        submittedAt: 1,
        score: 1,
        total: 2,
        answerLog: [
          { cardId: 'c1', correct: true },
          { cardId: 'c2', correct: 'yes' },
          null,
        ],
      })
    ).toEqual({
      classId: undefined,
      score: 1,
      total: 2,
      answerLog: [{ cardId: 'c1', correct: true }],
    });
  });

  it('counts a teacher-accepted flag as a right answer', () => {
    expect(
      parseSubmittedFlashcardCheck({
        submittedAt: 1,
        score: 2,
        total: 2,
        answerLog: [
          { cardId: 'c1', correct: true },
          { cardId: 'c2', correct: false },
          { cardId: 'c3', correct: false },
        ],
        flags: [
          { cardId: 'c2', response: 'x', accepted: true },
          { cardId: 'c3', response: 'y' },
        ],
      })?.answerLog
    ).toEqual([
      { cardId: 'c1', correct: true },
      { cardId: 'c2', correct: true },
      { cardId: 'c3', correct: false },
    ]);
  });
});

describe('computeFlashcardAggregate', () => {
  it('scores Test checks over the cards each student was asked', () => {
    const agg = computeFlashcardAggregate({
      assessmentId: 'a',
      title: 'Vocab',
      sessions: [
        {
          id: 's',
          teacherUid: 't',
          teacherName: 'T',
          checkMode: 'test',
          cards: [
            { id: 'c1', term: 'uno' },
            { id: 'c2', term: 'dos' },
            { id: 'c3', term: 'tres' },
          ],
          submissions: [
            {
              score: 1,
              total: 2,
              answerLog: [
                { cardId: 'c1', correct: true },
                { cardId: 'c3', correct: false },
              ],
            },
          ],
        },
      ],
    });
    expect(agg.teamAveragePercent).toBe(50);
    expect(agg.perQuestion.map((q) => q.answered)).toEqual([1, 0, 1]);
    expect(agg.perQuestion[1].incorrectPercent).toBeNull();
    expect(agg.scoreDistribution.find((b) => b.min === 0)?.count).toBe(1);
  });

  it('gives a team with only mastery checks no average', () => {
    const agg = computeFlashcardAggregate({
      assessmentId: 'a',
      title: 'Vocab',
      sessions: [
        {
          id: 's',
          teacherUid: 't',
          teacherName: 'T',
          checkMode: 'flashcards',
          cards: [{ id: 'c1', term: 'uno' }],
          submissions: [{ score: 1, total: 1, answerLog: [] }],
        },
      ],
    });
    expect(agg).toMatchObject({
      studentCount: 1,
      scoredStudentCount: 0,
      teamAveragePercent: 0,
    });
    expect(agg.perQuestion[0].answered).toBe(0);
  });

  it('gives a mastery-only check no target rows', () => {
    const agg = computeFlashcardAggregate({
      assessmentId: 'a',
      title: 'Vocab',
      sessions: [
        {
          id: 's',
          teacherUid: 't',
          teacherName: 'T',
          checkMode: 'flashcards',
          cards: [{ id: 'c1', term: 'perro' }],
          submissions: [{ score: null, total: null, answerLog: [] }],
          targets: [
            { id: 'mn:WL.1', kind: 'standard', code: 'WL.1', label: 'WL.1' },
          ],
        },
      ],
    });
    expect(agg.perTarget).toEqual([]);
    expect(agg.perStandard).toEqual([]);
  });
});
