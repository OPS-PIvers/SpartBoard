import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { FieldCtx } from '@/components/settings/schema/types';
import type { VideoActivityConfig } from '@/types';

// va-quiz-alignment moves these rules onto each assignment's Video step.
const onBoard = (ctx: FieldCtx) => !ctx.canAccessFeature('va-quiz-alignment');

export default defineSettings<VideoActivityConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'autoPlay',
          type: 'toggle',
          label: 'autoPlay',
          visibleWhen: onBoard,
          readValue: (ctx) => ctx.config.autoPlay ?? false,
        },
        {
          key: 'requireCorrectAnswer',
          type: 'toggle',
          label: 'requireCorrectAnswer',
          visibleWhen: onBoard,
          readValue: (ctx) => ctx.config.requireCorrectAnswer ?? true,
        },
        {
          key: 'allowSkipping',
          type: 'toggle',
          label: 'allowSkipping',
          visibleWhen: onBoard,
          readValue: (ctx) => ctx.config.allowSkipping ?? false,
        },
      ],
    },
  ],
});
