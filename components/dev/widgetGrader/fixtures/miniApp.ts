import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const app = (title: string, body: string) => ({
  id: 'grader-app',
  title,
  createdAt: Date.UTC(2026, 8, 1),
  html: `<!doctype html><body style="font-family:sans-serif;padding:16px"><h2>${title}</h2>${body}</body>`,
});

export const miniAppFixtures = defineFixtures<'miniApp'>({
  empty: { config: { activeApp: null } },
  typical: {
    config: {
      activeApp: app('Fraction Tiles', '<button>Add a tile</button>'),
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      activeApp: app(
        STRESS.title,
        range(STRESS.itemCount, (i) => `<p>${STRESS.longLabel(i)}</p>`).join('')
      ),
    },
  },
});
