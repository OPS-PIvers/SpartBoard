import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { BreathingConfig } from '@/types';
import { WIDGET_PALETTE } from '@/config/colors';

export default defineSettings<BreathingConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'pattern',
          type: 'segmented',
          label: 'pattern',
          options: [
            { value: '4-4-4-4', label: 'boxBreathing' },
            { value: '4-7-8', label: 'relaxingBreath' },
            { value: '5-5', label: 'coherentBreath' },
          ],
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'visual',
          type: 'segmented',
          label: 'visualStyle',
          options: [
            { value: 'circle', label: 'sphere' },
            { value: 'lotus', label: 'lotus' },
            { value: 'wave', label: 'ripple' },
          ],
        },
        {
          key: 'color',
          type: 'color',
          label: 'colorTheme',
          presets: WIDGET_PALETTE,
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'cardColor'],
});
