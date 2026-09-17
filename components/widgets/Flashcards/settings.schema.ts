import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { FlashcardsConfig } from '@/types';

export default defineSettings<FlashcardsConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'presentShowFirst',
          type: 'segmented',
          label: 'presentShowFirst',
          options: [
            { value: 'term', label: 'term' },
            { value: 'definition', label: 'definition' },
          ],
          visibleWhen: ({ config }) => config.view === 'present',
        },
        {
          key: 'presentShuffle',
          type: 'toggle',
          label: 'presentShuffle',
          visibleWhen: ({ config }) => config.view === 'present',
        },
      ],
    },
  ],
});
