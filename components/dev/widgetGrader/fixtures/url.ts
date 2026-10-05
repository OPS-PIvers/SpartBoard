import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const LINKS = [
  {
    title: 'Google Classroom',
    url: 'https://classroom.google.com',
    color: '#16a34a',
  },
  {
    title: 'Desmos',
    url: 'https://www.desmos.com/calculator',
    color: '#2563eb',
  },
  {
    title: 'Khan Academy',
    url: 'https://www.khanacademy.org',
    color: '#0d9488',
  },
  {
    title: 'Gradebook',
    url: 'https://example.com/gradebook',
    color: '#d97706',
  },
  {
    title: 'Library catalog',
    url: 'https://example.com/library',
    color: '#7c3aed',
  },
];

export const urlFixtures = defineFixtures<'url'>({
  empty: { config: { urls: [] } },
  typical: {
    config: {
      urls: LINKS.map((link, i) => ({
        id: `link-${i}`,
        ...link,
        shape: 'rectangle' as const,
      })),
    },
  },
  stress: {
    config: {
      urls: range(STRESS.itemCount, (i) => ({
        id: `link-${i}`,
        title: i % 2 === 0 ? STRESS.longLabel(i) : STRESS.word,
        url: `https://example.com/${STRESS.word}/${i}?q=${STRESS.word}`,
        color: LINKS[i % LINKS.length].color,
        shape: i % 3 === 0 ? ('circle' as const) : ('rectangle' as const),
      })),
    },
  },
});
