import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { FocusConfig } from '@/types';

export default defineSettings<FocusConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'hideNames',
          type: 'toggle',
          label: 'hideNames',
          help: 'hideNamesHelp',
        },
      ],
    },
  ],
});
