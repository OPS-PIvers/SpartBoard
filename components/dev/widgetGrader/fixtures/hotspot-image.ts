import { defineFixtures } from './types';
import { STRESS, range } from './stress';

// Inline SVG so the render needs no network.
const IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#dbeafe"/><circle cx="600" cy="400" r="260" fill="#93c5fd"/><rect x="120" y="120" width="260" height="160" fill="#60a5fa"/></svg>'
)}`;

const ICONS = ['search', 'info', 'question', 'star'] as const;

export const hotspotImageFixtures = defineFixtures<'hotspot-image'>({
  empty: { config: { baseImageUrl: '', hotspots: [], popoverTheme: 'light' } },
  typical: {
    config: {
      baseImageUrl: IMAGE,
      popoverTheme: 'light',
      hotspots: [
        {
          id: 'h1',
          xPct: 25,
          yPct: 25,
          title: 'Roof',
          detailText: 'Keeps the rain out.',
          icon: 'info',
          isViewed: true,
        },
        {
          id: 'h2',
          xPct: 50,
          yPct: 50,
          title: 'Core',
          detailText: 'The center of the diagram.',
          icon: 'star',
          isViewed: false,
        },
        {
          id: 'h3',
          xPct: 75,
          yPct: 70,
          title: 'Why?',
          detailText: 'What do you notice here?',
          icon: 'question',
          isViewed: false,
        },
      ],
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      baseImageUrl: IMAGE,
      popoverTheme: 'glass',
      hotspots: range(STRESS.itemCount, (i) => ({
        id: `h${i}`,
        xPct: 4 + (i % 6) * 18,
        yPct: 6 + Math.floor(i / 6) * 22,
        title: i % 2 ? STRESS.word : STRESS.longLabel(i),
        detailText: STRESS.maxText(400),
        icon: ICONS[i % ICONS.length],
        isViewed: i % 3 === 0,
      })),
    },
  },
});
