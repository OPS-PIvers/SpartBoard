import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { WritingConfig } from '@/types';

export default defineSettings<WritingConfig>({
  groups: [
    {
      id: 'content',
      fields: [],
    },
  ],
});
