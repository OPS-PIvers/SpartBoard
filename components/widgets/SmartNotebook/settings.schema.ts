import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { SmartNotebookConfig } from '@/types';

export default defineSettings<SmartNotebookConfig>({
  groups: [],
  styleKeys: ['fontFamily', 'fontColor', 'cardColor'],
});
