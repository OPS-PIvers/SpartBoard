import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { WorkSymbolsConfig } from '@/types';

export default defineSettings<WorkSymbolsConfig>({
  groups: [
    {
      id: 'display',
      fields: [
        {
          key: 'titlePosition',
          type: 'segmented',
          label: 'titlePosition',
          readValue: (ctx) => ctx.config.titlePosition ?? 'bottom',
          options: [
            { value: 'bottom', label: 'bottom' },
            { value: 'top', label: 'top' },
          ],
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'textSizePreset'],
});
