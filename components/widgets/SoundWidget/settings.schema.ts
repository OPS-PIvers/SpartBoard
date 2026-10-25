import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { FieldCtx } from '@/components/settings/schema/types';
import type { SoundConfig } from '@/types';
import { TIME_TOOL_SOUNDS } from '@/config/timeTool';
import { playTimerAlert, resumeAudio } from '@/utils/timeToolAudio';
import {
  DEFAULT_ALERT_DELAY_SECONDS,
  MAX_TARGET_LEVEL,
  NOISE_METER_PRO,
} from './noiseTarget';

const isPro = (ctx: FieldCtx) => ctx.canAccessFeature(NOISE_METER_PRO);
const isExpectationsSyncEnabled = (ctx: FieldCtx) =>
  ctx.config.syncExpectations === true;
const hasTarget = (ctx: FieldCtx) =>
  isPro(ctx) &&
  (typeof ctx.config.targetLevel === 'number' ||
    isExpectationsSyncEnabled(ctx));
const TARGET_OFF = -1;
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
          key: 'targetLevel',
          type: 'select',
          label: 'targetLevel',
          help: 'targetHelp',
          visibleWhen: isPro,
          disabledWhen: isExpectationsSyncEnabled,
          options: [
            { value: TARGET_OFF, label: 'targetOff' },
            ...Array.from({ length: MAX_TARGET_LEVEL + 1 }, (_, level) => ({
              value: level,
              label: `level${level}`,
            })),
          ],
          readValue: (ctx) =>
            typeof ctx.config.targetLevel === 'number'
              ? ctx.config.targetLevel
              : TARGET_OFF,
          toPatch: (value) => ({
            targetLevel: value === TARGET_OFF ? null : Number(value),
          }),
        },
        {
          key: 'alertDelaySeconds',
          type: 'number',
          label: 'alertDelaySeconds',
          min: 0,
          max: 30,
          step: 1,
          visibleWhen: hasTarget,
          readValue: (ctx) =>
            ctx.config.alertDelaySeconds ?? DEFAULT_ALERT_DELAY_SECONDS,
        },
        {
          key: 'alertSoundEnabled',
          type: 'toggle',
          label: 'alertSoundEnabled',
          visibleWhen: hasTarget,
        },
        {
          key: 'alertSound',
          type: 'soundPicker',
          label: 'alertSound',
          visibleWhen: (ctx) =>
            hasTarget(ctx) && ctx.config.alertSoundEnabled === true,
          options: TIME_TOOL_SOUNDS.map((sound) => ({
            value: sound,
            label: `sound${sound}`,
          })),
          preview: (sound) => {
            void resumeAudio().then(() => playTimerAlert(sound));
          },
          readValue: (ctx) => ctx.config.alertSound ?? 'Chime',
        },
        {
          key: 'autoTrafficLight',
          type: 'partnerWidget',
          label: 'autoTrafficLight',
          partner: 'traffic',
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
