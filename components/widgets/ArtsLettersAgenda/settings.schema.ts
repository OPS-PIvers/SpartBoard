import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { ArtsLettersAgendaConfig } from '@/types';

export default defineSettings<ArtsLettersAgendaConfig>({
  groups: [],
  styleKeys: ['textSizePreset', 'fontFamily', 'fontColor', 'cardColor'],
});
