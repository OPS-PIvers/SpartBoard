import { describe, expect, it } from 'vitest';
import type { FlashcardSession } from '@/types';
import { buildPlcFlashcardResultSummary } from './plcFlashcardResults';

const cards = [
  { id: 'a', term: 'Nucleus', definition: 'Control center' },
  { id: 'b', term: 'Ribosome', definition: 'Makes protein' },
];

const session = (kind: 'check' | 'study'): FlashcardSession =>
  ({
    id: 's1',
    teacherUid: 't1',
    setId: 'set1',
    title: 'Cells',
    kind,
    termLanguage: 'en-US',
    definitionLanguage: 'en-US',
    cards,
    classIds: [],
    status: 'active',
    createdAt: 1,
  }) as FlashcardSession;

describe('buildPlcFlashcardResultSummary', () => {
  it('summarizes a check without student ids', () => {
    const summary = buildPlcFlashcardResultSummary(session('check'), [
      {
        studentUid: 'stu-1',
        submittedAt: 10,
        score: 2,
        total: 2,
        answerLog: [
          { cardId: 'a', response: 'x', correct: true },
          { cardId: 'b', response: 'y', correct: true },
        ],
      },
      {
        studentUid: 'stu-2',
        submittedAt: 11,
        score: 1,
        total: 2,
        answerLog: [
          { cardId: 'a', response: 'x', correct: true },
          { cardId: 'b', response: 'z', correct: false },
        ],
      },
      { studentUid: 'stu-3' },
    ]);
    expect(summary).toEqual({
      kind: 'check',
      students: 3,
      completed: 2,
      averagePercent: 75,
      cards: [
        {
          term: 'Nucleus',
          definition: 'Control center',
          correct: 2,
          answered: 2,
        },
        {
          term: 'Ribosome',
          definition: 'Makes protein',
          correct: 1,
          answered: 2,
        },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain('stu-');
  });

  it('summarizes study progress as mastered percent and card tallies', () => {
    const summary = buildPlcFlashcardResultSummary(session('study'), [
      {
        studentUid: 'stu-1',
        studyMs: 60000,
        cards: {
          a: { s: 4, due: 0, c: 4, w: 1 },
          b: { s: 1, due: 0, c: 1, w: 2 },
        },
      },
      { studentUid: 'stu-2' },
    ]);
    expect(summary.kind).toBe('study');
    expect(summary.students).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.averagePercent).toBe(25);
    expect(summary.cards[1]).toEqual({
      term: 'Ribosome',
      definition: 'Makes protein',
      correct: 1,
      answered: 3,
    });
  });
});
