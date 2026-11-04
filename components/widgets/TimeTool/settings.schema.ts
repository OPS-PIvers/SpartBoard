import React from 'react';
import type { TimeToolConfig } from '@/types';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import { TIME_TOOL_SOUNDS } from '@/config/timeTool';
import { playTimerAlert, resumeAudio } from '@/utils/timeToolAudio';
import {
  TimeToolModeField,
  TimeToolStartLengthField,
  TimeToolTrafficColorField,
  TimeToolVoiceLevelField,
} from './settingsFields';
import { hiddenWithConnections } from '@/components/settings/schema/hiddenWithConnections';

const renderMode = (ctx: CustomRenderCtx) =>
  React.createElement(TimeToolModeField, { ctx });

const renderStartLength = (ctx: CustomRenderCtx) =>
  React.createElement(TimeToolStartLengthField, { ctx });

const renderVoiceLevel = (ctx: CustomRenderCtx) =>
  React.createElement(TimeToolVoiceLevelField, { ctx });

const renderTrafficColor = (ctx: CustomRenderCtx) =>
  React.createElement(TimeToolTrafficColorField, { ctx });

// Same synthesis the timer plays at zero; the context must be resumed from the click first.
export const previewTimerSound = (sound: string) => {
  void resumeAudio().then(() => playTimerAlert(sound));
};

const isTimerMode = (ctx: FieldCtx) => (ctx.config.mode ?? 'timer') === 'timer';

// `startLength` names the profile-backed field only; it is never written to widget config.
export default defineSettings<TimeToolConfig & { startLength?: never }>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: segmentedWithReset
        {
          type: 'custom',
          key: 'mode',
          label: 'mode',
          render: renderMode,
        },
        {
          type: 'soundPicker',
          key: 'selectedSound',
          label: 'selectedSound',
          options: TIME_TOOL_SOUNDS.map((sound) => ({
            value: sound,
            label: `sound${sound}`,
          })),
          preview: previewTimerSound,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        {
          type: 'number',
          key: 'adjustStepSeconds',
          label: 'adjustStepSeconds',
          min: 5,
          max: 60,
          step: 5,
          visibleWhen: isTimerMode,
        },
        // Saved to the teacher's profile, not this widget; `startLength` is not a config key.
        {
          type: 'custom',
          key: 'startLength',
          label: 'startLength',
          help: 'startLengthHelp',
          visibleWhen: isTimerMode,
          render: renderStartLength,
        },
        // Timer-end partner cards: each disables while its partner is off the board and offers a one-tap add.
        {
          type: 'partnerWidget',
          key: 'timerEndVoiceLevel',
          label: 'timerEndVoiceLevel',
          section: 'timerEndSection',
          partner: 'expectations',
          visibleWhen: (ctx) => isTimerMode(ctx) && hiddenWithConnections(ctx),
          // schema-gap: segmentedNullable
          control: {
            type: 'custom',
            key: 'timerEndVoiceLevel',
            label: 'timerEndVoiceLevel',
            render: renderVoiceLevel,
          },
        },
        {
          type: 'partnerWidget',
          key: 'timerEndTrafficColor',
          label: 'timerEndTrafficColor',
          section: 'timerEndSection',
          partner: 'traffic',
          visibleWhen: (ctx) => isTimerMode(ctx) && hiddenWithConnections(ctx),
          // schema-gap: segmentedNullable
          control: {
            type: 'custom',
            key: 'timerEndTrafficColor',
            label: 'timerEndTrafficColor',
            render: renderTrafficColor,
          },
        },
        {
          type: 'partnerWidget',
          key: 'timerEndTriggerRandom',
          label: 'timerEndTriggerRandom',
          section: 'timerEndSection',
          partner: 'random',
          visibleWhen: (ctx) => isTimerMode(ctx) && hiddenWithConnections(ctx),
          control: {
            type: 'toggle',
            key: 'timerEndTriggerRandom',
            label: 'timerEndTriggerRandom',
          },
        },
        {
          type: 'partnerWidget',
          key: 'timerEndTriggerStationsRotate',
          label: 'timerEndTriggerStationsRotate',
          section: 'timerEndSection',
          partner: 'stations',
          visibleWhen: (ctx) => isTimerMode(ctx) && hiddenWithConnections(ctx),
          control: {
            type: 'toggle',
            key: 'timerEndTriggerStationsRotate',
            label: 'timerEndTriggerStationsRotate',
          },
        },
        {
          type: 'partnerWidget',
          key: 'timerEndTriggerNextUp',
          label: 'timerEndTriggerNextUp',
          section: 'timerEndSection',
          partner: 'nextUp',
          visibleWhen: (ctx) => isTimerMode(ctx) && hiddenWithConnections(ctx),
          control: {
            type: 'toggle',
            key: 'timerEndTriggerNextUp',
            label: 'timerEndTriggerNextUp',
          },
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          type: 'segmented',
          key: 'visualType',
          label: 'visualType',
          options: [
            { value: 'digital', label: 'digital' },
            { value: 'visual', label: 'visualRing' },
          ],
        },
        {
          type: 'segmented',
          key: 'clockStyle',
          label: 'clockStyle',
          options: [
            { value: 'modern', label: 'styleDefault' },
            { value: 'lcd', label: 'styleLcd' },
            { value: 'minimal', label: 'styleMinimal' },
          ],
        },
        { type: 'accentColor', key: 'themeColor', label: 'themeColor' },
        { type: 'toggle', key: 'glow', label: 'glow' },
      ],
    },
  ],
  styleKeys: ['fontFamily'],
});
