import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { VideoActivityConfig } from '@/types';

// Player rules live on each assignment's Video step, so the drawer has no fields.
export default defineSettings<VideoActivityConfig>({
  groups: [],
});
