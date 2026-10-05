import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const page = (body: string): string =>
  `<!doctype html><body style="font-family:sans-serif;padding:16px"><h2>Class resources</h2>${body}</body>`;

export const embedFixtures = defineFixtures<'embed'>({
  empty: { config: { url: '' } },
  typical: {
    config: {
      url: '',
      mode: 'code',
      html: page('<p>Open the packet to page 12 and begin the warm-up.</p>'),
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      url: '',
      mode: 'code',
      html: page(
        range(
          STRESS.itemCount,
          (i) => `<p>${STRESS.longLabel(i)} ${STRESS.sentence}</p>`
        ).join('')
      ),
      zoom: 2.5,
    },
  },
});
