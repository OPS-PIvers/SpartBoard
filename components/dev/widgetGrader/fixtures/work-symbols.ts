import type { FeaturePermission, WorkSymbol } from '@/types';
import { defineFixtures } from './types';
import { STRESS } from './stress';

const art = (fill: string, label: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${fill}"/><text x="100" y="115" font-size="48" text-anchor="middle" fill="#fff">${label}</text></svg>`
  )}`;

const SYMBOLS: WorkSymbol[] = [
  {
    id: 'silent',
    title: 'Silent work',
    imageUrl: art('#1d4ed8', 'Silent'),
    buildings: [],
  },
  {
    id: 'partner',
    title: 'Partner talk',
    imageUrl: art('#15803d', 'Pair'),
    buildings: [],
  },
  {
    id: 'group',
    title: 'Group work',
    imageUrl: art('#b45309', 'Group'),
    buildings: [],
  },
  {
    id: 'long',
    title: `${STRESS.title} ${STRESS.word}`,
    imageUrl: art('#be123c', 'Long'),
    buildings: [],
  },
];

const permission: FeaturePermission = {
  widgetType: 'work-symbols',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: { symbols: SYMBOLS },
};

export const workSymbolsFixtures = defineFixtures<'work-symbols'>({
  empty: {
    auth: { featurePermissions: [permission] },
    config: { selectedSymbolId: null },
  },
  typical: {
    auth: { featurePermissions: [permission] },
    config: { selectedSymbolId: 'partner' },
  },
  stress: {
    auth: { featurePermissions: [permission] },
    config: {
      selectedSymbolId: 'long',
      textSizePreset: 'x-large',
      titlePosition: 'top',
    },
  },
});
