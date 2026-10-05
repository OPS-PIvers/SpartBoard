import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const COLORS = [
  'bg-blue-500',
  'bg-red-500',
  'bg-green-500',
  'bg-amber-500',
  'bg-teal-600',
  'bg-pink-500',
];

export const scoreboardFixtures = defineFixtures<'scoreboard'>({
  empty: { config: {} },
  typical: {
    config: {
      layout: 'cards',
      teams: [
        { id: 'team-1', name: 'Eagles', score: 12, color: 'bg-blue-500' },
        { id: 'team-2', name: 'Falcons', score: 9, color: 'bg-red-500' },
        { id: 'team-3', name: 'Owls', score: 15, color: 'bg-green-500' },
      ],
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      layout: 'rows',
      teams: range(10, (i) => ({
        id: `team-${i + 1}`,
        name: i % 2 === 0 ? STRESS.word : STRESS.longLabel(i),
        score: i % 3 === 0 ? 1234567 : i * 37,
        color: COLORS[i % COLORS.length],
      })),
    },
  },
});
