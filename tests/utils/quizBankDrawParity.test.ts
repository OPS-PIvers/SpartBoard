import { describe, expect, it } from 'vitest';
import { drawServedQuestionIds, isValidDraw } from '@/utils/questionBanks';
import { planBalancedDeal } from '@/utils/quizBalancedDeal';
import * as server from '@/functions/src/quizBankDraw';
import type { QuizSessionBankSlot } from '@/types';

const PUBLIC = ['f1', 'a1', 'a2', 'a3', 'f2', 'b1', 'b2', 'f3'];
const SLOTS: QuizSessionBankSlot[] = [
  {
    id: 'a',
    count: 2,
    points: 1,
    poolQuestionIds: ['a1', 'a2', 'a3'],
    position: 1,
  },
  {
    id: 'b',
    count: 1,
    points: 2,
    poolQuestionIds: ['b1', 'b2'],
    position: 2,
    dealing: 'balanced',
  },
];

// The server copy of the draw must stay in step with the client one.
describe('bank draw parity (client vs drawQuizBankQuestionsV1)', () => {
  it('draws the same ids for the same random sequence', () => {
    for (let seed = 0; seed < 20; seed++) {
      const rand = () => {
        let x = seed;
        return (n: number) => {
          x = (x * 1103515245 + 12345) % 2147483648;
          return x % n;
        };
      };
      expect(server.drawServedQuestionIds(PUBLIC, SLOTS, rand())).toEqual(
        drawServedQuestionIds(PUBLIC, SLOTS, rand())
      );
    }
  });

  it('agrees on which lists are legal draws', () => {
    const lists = [
      ['f1', 'a1', 'a2', 'f2', 'b1', 'f3'],
      ['f1', 'a1', 'a1', 'f2', 'b1', 'f3'],
      ['f1', 'a1', 'a2', 'a3', 'f2', 'f3'],
      ['f1', 'a1', 'a2', 'f2', 'b1'],
      ['f1', 'a1', 'a2', 'f2', 'b1', 'f3', 'zz'],
      ['f1', 'f1', 'f1', 'f1', 'f1', 'f1'],
    ];
    for (const l of lists) {
      expect(server.isValidDraw(PUBLIC, SLOTS, l)).toBe(
        isValidDraw(PUBLIC, SLOTS, l)
      );
    }
  });

  it('deals balanced slots the same way', () => {
    const fixedRand = () => 0;
    for (const dealt of [0, 1, 2, 5]) {
      const counts = new Map([['b', dealt]]);
      const response = { dealtQuestionIds: ['b2'] };
      const client = planBalancedDeal(PUBLIC, SLOTS, response, counts);
      const srv = server.planBalancedDeal(
        PUBLIC,
        SLOTS,
        response,
        counts,
        fixedRand
      );
      expect(srv?.counters).toEqual(client?.counters);
      expect(srv?.history).toEqual(client?.history);
      const balancedIds = (ids: string[] | undefined) =>
        (ids ?? []).filter((id) => id.startsWith('b'));
      expect(balancedIds(srv?.ids)).toEqual(balancedIds(client?.ids));
    }
  });
});
