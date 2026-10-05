import { defineFixtures } from './types';
import { STRESS } from './stress';

export const textFixtures = defineFixtures<'text'>({
  empty: { config: { content: '' } },
  typical: {
    config: {
      content:
        '<div><b>Today</b></div><div>Finish the reading on page 42.</div><ul><li>Bring your lab notebook</li><li>Quiz on Friday</li></ul>',
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      content: `<div>${STRESS.word}${STRESS.word}</div><div>${STRESS.sentence}</div><div>${STRESS.maxText(2400)}</div>`,
      fontSize: 48,
    },
  },
});
