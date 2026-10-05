import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const tokens = (words: string[], maskEvery = 0) =>
  words.map((value, i) => ({
    id: `t-${i}`,
    value,
    isMasked: maskEvery > 0 && i % maskEvery === maskEvery - 1,
  }));

export const syntaxFramerFixtures = defineFixtures<'syntax-framer'>({
  empty: { config: { mode: 'text', tokens: [], alignment: 'center' } },
  typical: {
    config: {
      mode: 'text',
      alignment: 'center',
      tokens: tokens(
        ['The', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'dog', '.'],
        4
      ),
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      mode: 'math',
      alignment: 'left',
      tokens: tokens(
        [
          STRESS.word,
          ...range(STRESS.itemCount, (i) => (i % 2 ? '+' : String(i * 137))),
          ...STRESS.sentence.split(' '),
        ],
        5
      ),
    },
  },
});
