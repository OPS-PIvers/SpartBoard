import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { WebcamConfig } from '@/types';

export default defineSettings<WebcamConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'autoSendToNotes',
          type: 'toggle',
          label: 'autoSendToNotes',
        },
      ],
    },
  ],
});
