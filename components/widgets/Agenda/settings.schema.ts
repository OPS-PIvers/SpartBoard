import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { AgendaConfig } from '@/types';

export default defineSettings<AgendaConfig>({
  groups: [
    {
      id: 'content',
      fields: [],
    },
  ],
});
