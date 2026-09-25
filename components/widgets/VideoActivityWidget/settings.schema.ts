import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { VideoActivityConfig } from '@/types';

export default defineSettings<VideoActivityConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'autoPlay',
          type: 'toggle',
          label: 'autoPlay',
          readValue: (ctx) => ctx.config.autoPlay ?? false,
        },
        {
          key: 'requireCorrectAnswer',
          type: 'toggle',
          label: 'requireCorrectAnswer',
          readValue: (ctx) => ctx.config.requireCorrectAnswer ?? true,
        },
        {
          key: 'allowSkipping',
          type: 'toggle',
          label: 'allowSkipping',
          readValue: (ctx) => ctx.config.allowSkipping ?? false,
        },
      ],
    },
  ],
});
