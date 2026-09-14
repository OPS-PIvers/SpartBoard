import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { FieldCtx } from '@/components/settings/schema/types';
import type { SoundConfig } from '@/types';

const isExpectationsSyncEnabled = (ctx: FieldCtx) =>
  ctx.config.syncExpectations === true;
const isTrafficAutomationEnabled = (ctx: FieldCtx) =>
  ctx.config.autoTrafficLight === true;

export default defineSettings<SoundConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'syncExpectations',
          type: 'partnerWidget',
          label: 'syncExpectations',
          partner: 'expectations',
          missingHelp: 'addExpectationsHelp',
          control: {
            key: 'syncExpectations',
            type: 'toggle',
            label: 'syncExpectations',
          },
        },
        {
          key: 'sensitivity',
          type: 'slider',
          label: 'sensitivity',
          min: 0.5,
          max: 5,
          step: 0.1,
          disabledWhen: isExpectationsSyncEnabled,
        },
        {
          key: 'autoTrafficLight',
          type: 'partnerWidget',
          label: 'autoTrafficLight',
          partner: 'traffic',
          missingHelp: 'addTrafficHelp',
          control: {
            key: 'autoTrafficLight',
            type: 'toggle',
            label: 'autoTrafficLight',
          },
        },
        {
          key: 'trafficLightThreshold',
          type: 'segmented',
          label: 'trafficLightThreshold',
          visibleWhen: isTrafficAutomationEnabled,
          options: [
            { value: 1, label: 'thresholdQuiet' },
            { value: 2, label: 'thresholdLow' },
            { value: 3, label: 'thresholdMedium' },
            { value: 4, label: 'thresholdHigh' },
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
          label: 'visual',
          options: [
            { value: 'thermometer', label: 'visualMeter' },
            { value: 'speedometer', label: 'visualGauge' },
            { value: 'line', label: 'visualGraph' },
            { value: 'balls', label: 'visualPopcorn' },
          ],
        },
      ],
    },
  ],
});
