import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { DiceConfig } from '@/types';

export default defineSettings<DiceConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'count',
          type: 'segmented',
          label: 'count',
          options: [1, 2, 3, 4, 5, 6].map((value) => ({
            value,
            label: value === 1 ? 'oneDie' : `dice${value}`,
          })),
        },
      ],
    },
    {
      id: 'display',
      fields: [
        { key: 'diceColor', type: 'color', label: 'diceColor' },
        { key: 'dotColor', type: 'color', label: 'dotColor' },
      ],
    },
  ],
});
