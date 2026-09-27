import { describe, expect, it } from 'vitest';
import { hashQuestionForTranslation } from '../quizTranslationHash';
import {
  bankTargetIndex,
  buildMetadata,
  clearSatisfiedNeedsKey,
  normalizeContent,
  reconcileQuestionOrder,
  toFriendlyQuestion,
  toStoredQuestion,
  type FriendlyQuestion,
  type StoredQuestion,
} from './quizStore';

let seq = 0;
const newId = () => `new-${(seq += 1)}`;
const store = (q: FriendlyQuestion, existing?: StoredQuestion) =>
  toStoredQuestion(q, 1, existing, newId);

describe('toStoredQuestion', () => {
  it('encodes every type in the client format', () => {
    expect(
      store({
        type: 'multiple_choice',
        text: 'Q',
        correct_answer: 'A',
        incorrect_answers: ['B', ' ', 'C'],
      })
    ).toMatchObject({
      type: 'MC',
      correctAnswer: 'A',
      incorrectAnswers: ['B', 'C'],
      timeLimit: 0,
    });
    expect(
      store({
        type: 'choose_all',
        text: 'Q',
        correct_answers: ['A', 'B'],
        incorrect_answers: ['C'],
        partial_credit: true,
      })
    ).toMatchObject({
      type: 'MA',
      correctAnswer: 'A|B',
      incorrectAnswers: ['C'],
      allowPartialCredit: true,
    });
    expect(
      store({
        type: 'matching',
        text: 'Q',
        pairs: [
          { term: 'a', match: '1' },
          { term: 'b', match: '2' },
        ],
        extra_matches: ['3'],
      })
    ).toMatchObject({
      type: 'Matching',
      correctAnswer: 'a:1|b:2',
      matchingDistractors: ['3'],
    });
    expect(
      store({ type: 'ordering', text: 'Q', items_in_order: ['x', 'y'] })
    ).toMatchObject({
      type: 'Ordering',
      correctAnswer: 'x|y',
    });
    expect(
      store({
        type: 'fill_in_blank',
        text: 'Q',
        correct_answer: 'cat',
        accepted_alternates: ['kitty'],
      })
    ).toMatchObject({
      type: 'FIB',
      correctAnswer: 'cat',
      alternateAnswers: ['kitty'],
    });
    expect(
      store({ type: 'free_response', text: 'Q', max_words: 50 })
    ).toMatchObject({
      type: 'free-response',
      correctAnswer: '',
      maxWords: 50,
    });
  });

  it('rejects answers the editor could not show or grade', () => {
    expect(() =>
      store({
        type: 'multiple_choice',
        text: 'Q',
        correct_answer: 'A',
        incorrect_answers: [],
      })
    ).toThrow();
    expect(() =>
      store({
        type: 'multiple_choice',
        text: 'Q',
        correct_answer: 'A',
        incorrect_answers: ['1', '2', '3', '4', '5'],
      })
    ).toThrow();
    expect(() =>
      store({ type: 'ordering', text: 'Q', items_in_order: ['a|b', 'c'] })
    ).toThrow();
    expect(() =>
      store({
        type: 'matching',
        text: 'Q',
        pairs: [
          { term: 'a:b', match: '1' },
          { term: 'c', match: '2' },
        ],
      })
    ).toThrow();
    expect(() => store({ type: 'fill_in_blank', text: 'Q' })).toThrow();
  });

  it('keeps targets and rubric on an edited question but replaces its key', () => {
    const existing: StoredQuestion = {
      id: 'q1',
      timeLimit: 30,
      text: 'Old',
      type: 'MC',
      correctAnswer: 'A',
      incorrectAnswers: ['B'],
      optionOrder: [1, 0],
      targets: [{ id: 't1' }],
      rubricId: 'r1',
      needsKey: true,
    };
    const out = store(
      {
        type: 'multiple_choice',
        text: 'New',
        correct_answer: 'C',
        incorrect_answers: ['D'],
      },
      existing
    );
    expect(out).toMatchObject({
      id: 'q1',
      timeLimit: 30,
      text: 'New',
      correctAnswer: 'C',
      targets: [{ id: 't1' }],
      rubricId: 'r1',
    });
    expect(out.optionOrder).toBeUndefined();
    expect(out.needsKey).toBeUndefined();
    const retyped = store(
      { type: 'free_response', text: 'Now open' },
      existing
    );
    expect(retyped.rubricId).toBeUndefined();
    expect(retyped.targets).toEqual([{ id: 't1' }]);
  });

  it('round-trips through the tool format', () => {
    const inputs: FriendlyQuestion[] = [
      {
        type: 'multiple_choice',
        text: 'Q',
        correct_answer: 'A',
        incorrect_answers: ['B'],
      },
      {
        type: 'matching',
        text: 'M',
        pairs: [
          { term: 'a', match: 'x:y' },
          { term: 'b', match: '2' },
        ],
      },
      {
        type: 'choose_all',
        text: 'C',
        correct_answers: ['A', 'B'],
        incorrect_answers: ['C'],
      },
    ];
    for (const input of inputs) {
      const stored = store(input);
      const friendly: FriendlyQuestion = { ...toFriendlyQuestion(stored) };
      delete friendly.id;
      expect(friendly).toEqual(input);
    }
  });
});

describe('metadata mirrors', () => {
  const q = (
    id: string,
    extra: Partial<StoredQuestion> = {}
  ): StoredQuestion => ({
    id,
    timeLimit: 0,
    text: `Question ${id}`,
    type: 'MC',
    correctAnswer: 'A',
    incorrectAnswers: ['B'],
    ...extra,
  });

  it('builds quiz metadata with search text, key counts and fresh translation staleness', () => {
    const q1 = q('1');
    const q2 = q('2', { correctAnswer: '', needsKey: true });
    const meta = buildMetadata(
      'quiz',
      {
        id: 'z',
        title: 'T',
        questions: [q1, q2],
        createdAt: 1,
        updatedAt: 2,
        language: 'en-US',
      },
      'file-1',
      {
        folderId: 'f1',
        order: 3,
        translations: {
          es: {
            sourceHashes: { '1': hashQuestionForTranslation(q1), '2': 'stale' },
          },
        },
      },
      { claudeEditedAt: 9 }
    );
    expect(meta).toMatchObject({
      id: 'z',
      driveFileId: 'file-1',
      questionCount: 2,
      searchText: 'question 1 question 2',
      needsKeyCount: 1,
      folderId: 'f1',
      order: 3,
      language: 'en-US',
      claudeEditedAt: 9,
      translations: { es: { staleCount: 1, questionCount: 2 } },
    });
    expect('sync' in meta).toBe(false);
  });

  it('indexes bank targets with bank-level tags inherited once per question', () => {
    const index = bankTargetIndex({
      questions: [q('1', { targets: [{ id: 'a' }] }), q('2')],
      targets: [{ id: 'a' }, { id: 'b' }],
    });
    expect(index).toEqual({
      targetIds: ['a', 'b'],
      targetCounts: { a: 2, b: 2 },
    });
  });

  it('drops a needsKey flag once a key exists and maps legacy types', () => {
    const [cleared] = clearSatisfiedNeedsKey([q('1', { needsKey: true })]);
    expect(cleared.needsKey).toBeUndefined();
    const content = normalizeContent(
      { questions: [q('1', { type: 'essay' as never })] },
      'x'
    );
    expect(content.questions[0].type).toBe('free-response');
    expect(content.id).toBe('x');
  });
});

describe('reconcileQuestionOrder', () => {
  it('drops removed questions, keeps sections and slots, and appends new ones last', () => {
    const order = [
      { kind: 'section', id: 's1' },
      { kind: 'question', id: 'a' },
      { kind: 'question', id: 'gone' },
      { kind: 'slot', id: 'slot1' },
      { kind: 'section', id: 's2' },
      { kind: 'question', id: 'b' },
    ];
    const questions = ['b', 'a', 'new'].map((id) => ({
      id,
      timeLimit: 0,
      text: id,
      type: 'MC' as const,
      correctAnswer: 'x',
      incorrectAnswers: ['y'],
    }));
    expect(reconcileQuestionOrder(order, questions)).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'question', id: 'a' },
      { kind: 'slot', id: 'slot1' },
      { kind: 'section', id: 's2' },
      { kind: 'question', id: 'b' },
      { kind: 'question', id: 'new' },
    ]);
    expect(reconcileQuestionOrder(undefined, questions)).toBeUndefined();
  });
});
