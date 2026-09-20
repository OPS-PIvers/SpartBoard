import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { FieldCtx } from '@/components/settings/schema/types';
import type { MathToolConfig, MathToolType } from '@/types';
import {
  CSS_PPI,
  MATH_TOOL_META,
} from '@/components/widgets/math-tools/mathToolUtils';
import { ROTATABLE_TOOLS } from './constants';

const isTool =
  (...types: string[]) =>
  (ctx: FieldCtx) =>
    types.includes(String(ctx.config.toolType));

export default defineSettings<MathToolConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'toolType',
          type: 'segmented',
          label: 'toolType',
          options: MATH_TOOL_META.map((tool) => ({
            value: tool.type,
            label: tool.type,
            icon: tool.emoji,
          })),
        },
        {
          key: 'numberLineMode',
          type: 'segmented',
          label: 'mode',
          readValue: (ctx) => ctx.config.numberLineMode ?? 'integers',
          visibleWhen: isTool('number-line'),
          options: [
            { value: 'integers', label: 'integers' },
            { value: 'decimals', label: 'decimals' },
            { value: 'fractions', label: 'fractions' },
          ],
        },
        {
          key: 'numberLineMin',
          type: 'number',
          label: 'minimum',
          min: -1000,
          max: 1000,
          readValue: (ctx) => ctx.config.numberLineMin ?? -10,
          visibleWhen: isTool('number-line'),
        },
        {
          key: 'numberLineMax',
          type: 'number',
          label: 'maximum',
          min: -1000,
          max: 1000,
          readValue: (ctx) => ctx.config.numberLineMax ?? 10,
          visibleWhen: isTool('number-line'),
        },
        {
          key: 'rulerUnits',
          type: 'segmented',
          label: 'unitsDisplayed',
          readValue: (ctx) => ctx.config.rulerUnits ?? 'both',
          visibleWhen: isTool('ruler-in', 'ruler-cm'),
          options: [
            { value: 'in', label: 'inches' },
            { value: 'cm', label: 'centimeters' },
            { value: 'both', label: 'both' },
          ],
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        {
          key: 'pixelsPerInch',
          type: 'number',
          label: 'trueScaleCalibration',
          help: 'trueScaleCalibrationHelp',
          min: 60,
          max: 300,
          readValue: (ctx) => ctx.config.pixelsPerInch ?? CSS_PPI,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'rotation',
          type: 'slider',
          label: 'rotation',
          min: 0,
          max: 359,
          step: 1,
          readValue: (ctx) => ctx.config.rotation ?? 0,
          visibleWhen: (ctx) =>
            ROTATABLE_TOOLS.includes(ctx.config.toolType as MathToolType),
        },
      ],
    },
  ],
});
