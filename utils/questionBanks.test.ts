import { describe, expect, it } from 'vitest';
import type {
  QuizBankSlot,
  QuizQuestion,
  QuizSessionBankSlot,
  QuestionTargetTag,
} from '@/types';
import {
  BankSlotResolutionError,
  bankTargetIndex,
  copyBankQuestions,
  describeBankSlot,
  drawServedQuestionIds,
  eligibleBankQuestions,
  isValidDraw,
  mergeTargets,
  orderServedQuestions,
  quizMaxPointsWithSlots,
  quizOrder,
  resolveQuizAssignment,
  validateBankSlots,
  type BankContent,
} from './questionBanks';

const tag = (id: string): QuestionTargetTag => ({
  id,
  kind: 'standard',
  code: id,
  label: `Target ${id}`,
});

const q = (id: string, targets?: QuestionTargetTag[]): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
  ...(targets ? { targets } : {}),
});

const bank: BankContent = {
  id: 'bank-1',
  title: 'Fractions',
  targets: [tag('bank-tag')],
  questions: [
    q('b1', [tag('RL.1')]),
    q('b2', [tag('RL.1'), tag('RL.2')]),
    q('b3'),
    { ...q('b4', [tag('RL.2')]), stimulusIds: ['stim-1'], points: 5 },
  ],
  stimuli: [{ id: 'stim-1', type: 'image', url: 'x', label: 'Diagram' }],
};

const slot = (over: Partial<QuizBankSlot> = {}): QuizBankSlot => ({
  id: 'slot-1',
  bankId: 'bank-1',
  bankTitle: 'Fractions',
  mode: 'random',
  count: 2,
  points: 3,
  ...over,
});

const banks = new Map<string, BankContent>([['bank-1', bank]]);

// Deterministic index source: always picks the last element (identity shuffle).
const identity = (n: number) => n - 1;

describe('mergeTargets / bankTargetIndex', () => {
  it('dedupes by id and returns undefined when empty', () => {
    expect(
      mergeTargets([tag('a')], [tag('a'), tag('b')])?.map((t) => t.id)
    ).toEqual(['a', 'b']);
    expect(mergeTargets(undefined, [])).toBeUndefined();
  });

  it('counts bank tags on every question and question tags once each', () => {
    const index = bankTargetIndex(bank);
    expect(index.targetCounts).toEqual({
      'bank-tag': 4,
      'RL.1': 2,
      'RL.2': 2,
    });
    expect(index.targetIds).toEqual(['RL.1', 'RL.2', 'bank-tag']);
  });
});

describe('eligibleBankQuestions', () => {
  it('matches any-of on merged tags; empty filter is the whole bank', () => {
    expect(eligibleBankQuestions(bank, ['RL.2']).map((x) => x.id)).toEqual([
      'b2',
      'b4',
    ]);
    expect(eligibleBankQuestions(bank, ['bank-tag']).length).toBe(4);
    expect(eligibleBankQuestions(bank, []).length).toBe(4);
    expect(eligibleBankQuestions(bank, ['nope']).length).toBe(0);
  });
});

describe('copyBankQuestions', () => {
  it('mints new ids, merges bank tags and re-keys stimuli', () => {
    let n = 0;
    const copied = copyBankQuestions(bank, ['b4', 'b1'], () => `new-${++n}`);
    expect(copied.questions.map((x) => x.id)).toEqual(['new-1', 'new-2']);
    expect(copied.questions[0].targets?.map((t) => t.id)).toEqual([
      'RL.1',
      'bank-tag',
    ]);
    expect(copied.questions[0].stimulusIds).toBeUndefined();
    expect(copied.questions[1].targets?.map((t) => t.id)).toEqual([
      'RL.2',
      'bank-tag',
    ]);
    expect(copied.questions[1].stimulusIds).toEqual(['new-3']);
    expect(copied.stimuli).toEqual([
      { ...(bank.stimuli ?? [])[0], id: 'new-3' },
    ]);
  });
});

describe('quizOrder', () => {
  it('drops unknown entries, keeps array order for missing questions, slots last', () => {
    const order = quizOrder({
      questions: [q('f1'), q('f2')],
      bankSlots: [slot(), slot({ id: 'slot-2' })],
      order: [
        { kind: 'slot', id: 'slot-2' },
        { kind: 'question', id: 'f2' },
        { kind: 'question', id: 'gone' },
        { kind: 'question', id: 'f2' },
      ],
    });
    expect(order).toEqual([
      { kind: 'slot', id: 'slot-2' },
      { kind: 'question', id: 'f2' },
      { kind: 'question', id: 'f1' },
      { kind: 'slot', id: 'slot-1' },
    ]);
  });
});

describe('validateBankSlots', () => {
  it('passes when every slot has enough eligible questions', () => {
    expect(
      validateBankSlots({ questions: [q('f1')], bankSlots: [slot()] }, banks)
    ).toEqual([]);
  });

  it('blocks short pools with a per-slot message', () => {
    const problems = validateBankSlots(
      {
        questions: [],
        bankSlots: [slot({ count: 3, targetFilter: ['RL.2'] })],
      },
      banks
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].slotId).toBe('slot-1');
    expect(problems[0].message).toMatch(
      /2 questions matching the target filter/
    );
  });

  it('reports missing banks and zero counts', () => {
    const problems = validateBankSlots(
      {
        questions: [],
        bankSlots: [
          slot({ id: 's-missing', bankId: 'nope' }),
          slot({ id: 's-zero', count: 0 }),
        ],
      },
      banks
    );
    expect(problems.map((p) => p.slotId)).toEqual(['s-missing', 's-zero']);
  });

  it('blocks a pool over 150 questions', () => {
    const big: BankContent = {
      id: 'big',
      title: 'Big',
      questions: Array.from({ length: 149 }, (_, i) => q(`big-${i}`)),
    };
    const problems = validateBankSlots(
      {
        questions: [q('f1'), q('f2')],
        bankSlots: [slot({ bankId: 'big', bankTitle: 'Big', count: 5 })],
      },
      new Map([['big', big]])
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/151 questions/);
  });
});

describe('resolveQuizAssignment', () => {
  const quiz = {
    questions: [q('f1'), { ...q('f2'), points: 2 }],
    bankSlots: [slot({ targetFilter: ['RL.1'], count: 1 })],
    order: [
      { kind: 'question' as const, id: 'f1' },
      { kind: 'slot' as const, id: 'slot-1' },
      { kind: 'question' as const, id: 'f2' },
    ],
  };

  it('freezes eligible pool questions with slot points and merged tags', () => {
    const resolved = resolveQuizAssignment(quiz, banks);
    expect(resolved.questions.map((x) => x.id)).toEqual([
      'f1',
      'b1',
      'b2',
      'f2',
    ]);
    expect(resolved.questions[1].points).toBe(3);
    expect(resolved.questions[2].points).toBe(3);
    expect(resolved.questions[1].targets?.map((t) => t.id)).toEqual([
      'RL.1',
      'bank-tag',
    ]);
    expect(resolved.sessionSlots).toEqual([
      {
        id: 'slot-1',
        count: 1,
        points: 3,
        poolQuestionIds: ['b1', 'b2'],
        position: 1,
      },
    ]);
    expect(resolved.totalQuestions).toBe(3);
  });

  it('carries pool stimuli and syncs with the max-points helper', () => {
    const resolved = resolveQuizAssignment(
      { questions: [], bankSlots: [slot({ count: 4 })], stimuli: [] },
      banks
    );
    expect(resolved.stimuli.map((s) => s.id)).toEqual(['stim-1']);
    expect(resolved.questions.every((x) => x.points === 3)).toBe(true);
    expect(
      quizMaxPointsWithSlots({ questions: [], bankSlots: [slot({ count: 4 })] })
    ).toBe(12);
  });

  it('throws BankSlotResolutionError with the problems attached', () => {
    expect(() =>
      resolveQuizAssignment(
        { questions: [], bankSlots: [slot({ count: 9 })] },
        banks
      )
    ).toThrow(BankSlotResolutionError);
  });
});

describe('drawServedQuestionIds', () => {
  const ids = ['f1', 'b1', 'b2', 'b3', 'f2', 'c1', 'c2'];
  const slots: QuizSessionBankSlot[] = [
    {
      id: 's1',
      count: 2,
      points: 1,
      poolQuestionIds: ['b1', 'b2', 'b3'],
      position: 1,
    },
    {
      id: 's2',
      count: 1,
      points: 1,
      poolQuestionIds: ['c1', 'c2'],
      position: 0,
    },
  ];

  it('splices each slot at its position and keeps fixed order', () => {
    const served = drawServedQuestionIds(ids, slots, identity);
    expect(served).toEqual(['c1', 'f1', 'b1', 'b2', 'f2']);
    expect(isValidDraw(ids, slots, served)).toBe(true);
  });

  it('produces varied but always-valid draws with the real RNG', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const served = drawServedQuestionIds(ids, slots);
      expect(isValidDraw(ids, slots, served)).toBe(true);
      seen.add(served.join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('rejects draws with the wrong size or pool membership', () => {
    expect(isValidDraw(ids, slots, ['f1', 'b1', 'b2', 'f2'])).toBe(false);
    expect(isValidDraw(ids, slots, ['f1', 'b1', 'b2', 'b3', 'f2'])).toBe(false);
    expect(isValidDraw(ids, slots, ['c1', 'f1', 'b1', 'b1', 'f2'])).toBe(false);
  });

  it('orders public questions by the served list', () => {
    const publicQs = ids.map((id) => ({ id }));
    expect(
      orderServedQuestions(publicQs, ['c2', 'f2', 'zzz']).map((x) => x.id)
    ).toEqual(['c2', 'f2']);
  });
});

describe('describeBankSlot', () => {
  it('formats count, eligible pool, filter and points', () => {
    expect(
      describeBankSlot(slot({ count: 5, points: 2, targetFilter: ['a'] }), 18)
    ).toBe('Random · 5 of 18 · 1 target · 2 pts');
    expect(describeBankSlot(slot({ count: 1, points: 1 }), null)).toBe(
      'Random · 1 · 1 pt'
    );
  });
});
