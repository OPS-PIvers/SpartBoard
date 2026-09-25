import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { MathToolsConfig } from '@/types';
import { CSS_PPI } from '@/components/widgets/math-tools/mathToolUtils';

export default defineSettings<MathToolsConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'dpiCalibration',
          type: 'number',
          label: 'dpiCalibration',
          min: 60,
          max: 300,
          readValue: (ctx) => ctx.config.dpiCalibration ?? CSS_PPI,
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'cardColor'],
});
