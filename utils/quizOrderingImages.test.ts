import { describe, it, expect } from 'vitest';
import type { QuizPublicQuestion, QuizQuestion } from '@/types';
import { alignedOrderingImages } from './quizOrderingImages';
import { reindexChoiceArray } from './quizLocalizedArrays';
import { shuffleQuestionForStudent } from './quizShuffle';
import { toPublicQuestion } from '@/hooks/useQuizSession';

const A = 'https://lh3.googleusercontent.com/d/a';
const C = 'https://lh3.googleusercontent.com/d/c';

describe('alignedOrderingImages', () => {
  it('pads to the item count and drops non-https values', () => {
    expect(alignedOrderingImages([A, 'javascript:x', C], 4)).toEqual([
      A,
      '',
      C,
      '',
    ]);
  });
  it('is undefined when no item has an image', () => {
    expect(alignedOrderingImages(undefined, 3)).toBeUndefined();
    expect(alignedOrderingImages(['', ''], 2)).toBeUndefined();
  });
});

describe('ordering images stay with their items', () => {
  const question: QuizQuestion = {
    id: 'q-order',
    timeLimit: 0,
    type: 'Ordering',
    text: 'Order',
    correctAnswer: 'One|Two|Three',
    incorrectAnswers: [],
    orderingImages: [A, '', C],
  };
  const imageFor: Record<string, string> = { One: A, Two: '', Three: C };

  it('toPublicQuestion permutes images with the shuffled items', () => {
    for (let n = 0; n < 20; n++) {
      const pub = toPublicQuestion(question);
      expect(pub.orderingImages).toHaveLength(3);
      pub.orderingItems?.forEach((item, i) =>
        expect(pub.orderingImages?.[i]).toBe(imageFor[item])
      );
    }
  });

  it('toPublicQuestion omits images when none are set', () => {
    const pub = toPublicQuestion({ ...question, orderingImages: undefined });
    expect('orderingImages' in pub).toBe(false);
  });

  it('the per-student shuffle keeps images aligned', () => {
    const pub = toPublicQuestion(question);
    for (const seed of ['a', 'b', 'c', 'd']) {
      const out = shuffleQuestionForStudent(pub, seed);
      out.orderingItems?.forEach((item, i) =>
        expect(out.orderingImages?.[i]).toBe(imageFor[item])
      );
    }
  });

  it('reindexChoiceArray drops images that are not index-aligned', () => {
    const q: QuizPublicQuestion = {
      id: 'q',
      type: 'Ordering',
      text: '',
      timeLimit: 0,
      orderingItems: ['One', 'Two'],
      orderingImages: [A],
    };
    expect(
      reindexChoiceArray(q, 'orderingItems', [1, 0]).orderingImages
    ).toBeUndefined();
  });
});
