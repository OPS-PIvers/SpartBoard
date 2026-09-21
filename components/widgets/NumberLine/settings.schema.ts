import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { FieldCtx } from '@/components/settings/schema/types';
import type {
  NumberLineConfig,
  NumberLineJump,
  NumberLineMarker,
} from '@/types';
import { WIDGET_PALETTE } from '@/config/colors';

const MAX_ABS_VALUE = 1000;
const MAX_TICKS = 5000;

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clampValue = (value: number): number =>
  Math.max(-MAX_ABS_VALUE, Math.min(MAX_ABS_VALUE, value));

const minPatch = (value: unknown, ctx: FieldCtx) => {
  const nextMin = clampValue(finiteNumber(value, -10));
  const max = clampValue(finiteNumber(ctx.config.max, 10));
  return { min: Math.min(nextMin, max) };
};

const maxPatch = (value: unknown, ctx: FieldCtx) => {
  const nextMax = clampValue(finiteNumber(value, 10));
  const min = clampValue(finiteNumber(ctx.config.min, -10));
  return { max: Math.max(nextMax, min) };
};

const stepPatch = (value: unknown, ctx: FieldCtx) => {
  const min = finiteNumber(ctx.config.min, -10);
  const max = finiteNumber(ctx.config.max, 10);
  const range = Math.abs(max - min);
  const minimumStep = range > 0 ? range / MAX_TICKS : 0.01;
  return {
    step: Math.max(0.01, minimumStep, finiteNumber(value, 1)),
  };
};

export default defineSettings<NumberLineConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'min',
          type: 'number',
          label: 'min',
          min: -MAX_ABS_VALUE,
          max: MAX_ABS_VALUE,
          step: 0.01,
          toPatch: minPatch,
        },
        {
          key: 'max',
          type: 'number',
          label: 'max',
          min: -MAX_ABS_VALUE,
          max: MAX_ABS_VALUE,
          step: 0.01,
          toPatch: maxPatch,
        },
        {
          key: 'step',
          type: 'number',
          label: 'step',
          min: 0.01,
          step: 0.01,
          toPatch: stepPatch,
        },
        {
          key: 'displayMode',
          type: 'segmented',
          label: 'displayMode',
          options: [
            { value: 'integers', label: 'integers' },
            { value: 'decimals', label: 'decimals' },
            { value: 'fractions', label: 'fractions' },
          ],
        },
        {
          key: 'markers',
          type: 'list',
          label: 'markers',
          addLabel: 'addMarker',
          row: {
            createRow: (index) =>
              ({
                id: crypto.randomUUID(),
                value: 0,
                label: '',
                color: WIDGET_PALETTE[index % WIDGET_PALETTE.length],
              }) satisfies NumberLineMarker,
            fields: [
              {
                key: 'value',
                type: 'number',
                label: 'markerValue',
                min: -MAX_ABS_VALUE,
                max: MAX_ABS_VALUE,
                step: 0.01,
              },
              { key: 'label', type: 'text', label: 'markerLabel' },
              {
                key: 'color',
                type: 'color',
                label: 'markerColor',
                presets: WIDGET_PALETTE,
              },
            ],
          },
        },
        {
          key: 'jumps',
          type: 'list',
          label: 'jumps',
          addLabel: 'addJump',
          row: {
            createRow: () =>
              ({
                id: crypto.randomUUID(),
                startValue: 0,
                endValue: 5,
                label: '+5',
              }) satisfies NumberLineJump,
            fields: [
              {
                key: 'startValue',
                type: 'number',
                label: 'jumpStart',
                min: -MAX_ABS_VALUE,
                max: MAX_ABS_VALUE,
                step: 0.01,
              },
              {
                key: 'endValue',
                type: 'number',
                label: 'jumpEnd',
                min: -MAX_ABS_VALUE,
                max: MAX_ABS_VALUE,
                step: 0.01,
              },
              { key: 'label', type: 'text', label: 'jumpLabel' },
            ],
          },
        },
      ],
    },
    {
      id: 'behavior',
      fields: [{ key: 'showArrows', type: 'toggle', label: 'showArrows' }],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'cardColor'],
});
