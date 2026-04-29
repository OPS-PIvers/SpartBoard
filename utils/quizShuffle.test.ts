import { describe, it, expect } from 'vitest';
import { seededShuffle, shuffleQuestionForStudent } from './quizShuffle';
import type { QuizPublicQuestion } from '@/types';

describe('seededShuffle', () => {
  it('returns the same order for the same seed (deterministic)', () => {
    const items = ['A', 'B', 'C', 'D', 'E'];
    const a = seededShuffle(items, 'student-1:q1');
    const b = seededShuffle(items, 'student-1:q1');
    expect(a).toEqual(b);
  });

  it('returns different orders for different seeds (with high probability)', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const a = seededShuffle(items, 'student-1:q1');
    const b = seededShuffle(items, 'student-2:q1');
    // For an 8-element shuffle the chance of identical orders by accident is
    // 1/8! ≈ 0.0025% — safe to assert inequality for two distinct seeds.
    expect(a).not.toEqual(b);
  });

  it('does not mutate the input', () => {
    const items = ['A', 'B', 'C', 'D'];
    const snapshot = items.slice();
    seededShuffle(items, 'seed');
    expect(items).toEqual(snapshot);
  });

  it('preserves the multiset of items', () => {
    const items = ['A', 'B', 'C', 'D', 'E'];
    const shuffled = seededShuffle(items, 'seed');
    expect(shuffled.slice().sort()).toEqual(items.slice().sort());
  });

  it('returns a fresh array even for length 0/1 inputs (callers always get a new ref)', () => {
    const empty: string[] = [];
    const single = ['only'];
    expect(seededShuffle(empty, 'seed')).not.toBe(empty);
    expect(seededShuffle(single, 'seed')).not.toBe(single);
    expect(seededShuffle(single, 'seed')).toEqual(['only']);
  });
});

describe('shuffleQuestionForStudent', () => {
  const mcQuestion: QuizPublicQuestion = {
    id: 'q-mc',
    type: 'MC',
    text: 'Pick one',
    timeLimit: 0,
    choices: ['Paris', 'London', 'Berlin', 'Madrid', 'Rome'],
  };

  it('shuffles MC choices per student id', () => {
    const studentA = shuffleQuestionForStudent(mcQuestion, 'uid-aaa');
    const studentB = shuffleQuestionForStudent(mcQuestion, 'uid-bbb');
    expect(studentA.choices).not.toEqual(studentB.choices);
    // Same answer set, just in a different order.
    expect(studentA.choices?.slice().sort()).toEqual(
      mcQuestion.choices?.slice().sort()
    );
  });

  it('produces stable output for the same student across calls', () => {
    const a = shuffleQuestionForStudent(mcQuestion, 'uid-stable');
    const b = shuffleQuestionForStudent(mcQuestion, 'uid-stable');
    expect(a.choices).toEqual(b.choices);
  });

  it('combines the seed with the question id so different questions diverge for one student', () => {
    const q1 = { ...mcQuestion, id: 'q1' };
    const q2 = { ...mcQuestion, id: 'q2' };
    const order1 = shuffleQuestionForStudent(q1, 'uid-same').choices;
    const order2 = shuffleQuestionForStudent(q2, 'uid-same').choices;
    expect(order1).not.toEqual(order2);
  });

  it('shuffles Matching right-side options', () => {
    const matching: QuizPublicQuestion = {
      id: 'q-match',
      type: 'Matching',
      text: 'Match',
      timeLimit: 0,
      matchingLeft: ['L1', 'L2', 'L3', 'L4'],
      matchingRight: ['R1', 'R2', 'R3', 'R4'],
    };
    const a = shuffleQuestionForStudent(matching, 'uid-aaa');
    const b = shuffleQuestionForStudent(matching, 'uid-bbb');
    expect(a.matchingRight).not.toEqual(b.matchingRight);
    expect(a.matchingLeft).toEqual(matching.matchingLeft);
  });

  it('shuffles Ordering items', () => {
    const ordering: QuizPublicQuestion = {
      id: 'q-order',
      type: 'Ordering',
      text: 'Order',
      timeLimit: 0,
      orderingItems: ['One', 'Two', 'Three', 'Four', 'Five'],
    };
    const a = shuffleQuestionForStudent(ordering, 'uid-aaa');
    const b = shuffleQuestionForStudent(ordering, 'uid-bbb');
    expect(a.orderingItems).not.toEqual(b.orderingItems);
  });

  it('returns the original question (same reference) when there is nothing to shuffle', () => {
    const fib: QuizPublicQuestion = {
      id: 'q-fib',
      type: 'FIB',
      text: 'Fill it',
      timeLimit: 0,
    };
    expect(shuffleQuestionForStudent(fib, 'uid-aaa')).toBe(fib);

    const singleChoice: QuizPublicQuestion = {
      id: 'q-mc-1',
      type: 'MC',
      text: 'Sole option',
      timeLimit: 0,
      choices: ['Only'],
    };
    expect(shuffleQuestionForStudent(singleChoice, 'uid-aaa')).toBe(
      singleChoice
    );
  });
});
