import type { NeedDoPutThenTile } from '@/types';
import {
  DEFAULT_NEED_ITEMS,
  DEFAULT_PUT_ITEMS,
  DEFAULT_THEN_ITEMS,
} from '@/components/widgets/NeedDoPutThen/constants';
import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const COLORS = [
  '#facc15',
  '#ef4444',
  '#334155',
  '#ec4899',
  '#0ea5e9',
  '#22c55e',
];
const ICONS = [
  'Pencil',
  'Laptop',
  'Headphones',
  'FileText',
  'BookOpen',
  'Mail',
];

const tiles = (count: number, prefix: string): NeedDoPutThenTile[] =>
  range(count, (i) => ({
    id: `${prefix}-${i}`,
    label: i % 2 === 0 ? STRESS.word : `${STRESS.longLabel(i)}`,
    icon: ICONS[i % ICONS.length],
    color: COLORS[i % COLORS.length],
  }));

export const needDoPutThenFixtures = defineFixtures<'need-do-put-then'>({
  empty: {
    config: { needItems: [], doItems: [], putItems: [], thenItems: [] },
  },
  typical: {
    config: {
      needItems: DEFAULT_NEED_ITEMS,
      doItems: [
        'Read pages 12 to 15',
        'Answer questions 1 to 4',
        'Check with your partner',
      ],
      putItems: DEFAULT_PUT_ITEMS,
      thenItems: DEFAULT_THEN_ITEMS,
    },
  },
  stress: {
    config: {
      needItems: tiles(12, 'need'),
      doItems: range(STRESS.itemCount, (i) =>
        i % 2 === 0 ? STRESS.sentence : STRESS.word
      ),
      putItems: tiles(10, 'put'),
      thenItems: tiles(10, 'then'),
      textSizePreset: 'x-large',
    },
  },
});
