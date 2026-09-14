import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { RandomConfig } from '@/types';
import {
  RandomGroupCountField,
  RandomRosterActionsField,
  RandomSendToStationsField,
} from './settingsFields';

const mode = (ctx: FieldCtx) => ctx.config.mode ?? 'single';
const isMode = (value: string) => (ctx: FieldCtx) => mode(ctx) === value;
const isCustomRoster = (ctx: FieldCtx) => ctx.config.rosterMode === 'custom';

const renderHomeGroups = (ctx: CustomRenderCtx) =>
  React.createElement(RandomGroupCountField, { ctx, kind: 'home' });
const renderExpertGroups = (ctx: CustomRenderCtx) =>
  React.createElement(RandomGroupCountField, { ctx, kind: 'expert' });
const renderRosterActions = (ctx: CustomRenderCtx) =>
  React.createElement(RandomRosterActionsField, { ctx });
const renderSendToStations = (ctx: CustomRenderCtx) =>
  React.createElement(RandomSendToStationsField, { ctx });

export default defineSettings<RandomConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'rosterMode',
          type: 'rosterPicker',
          label: 'rosterSource',
        },
        {
          key: 'firstNames',
          type: 'textarea',
          label: 'firstNames',
          placeholder: 'firstNamesPlaceholder',
          rows: 8,
          visibleWhen: isCustomRoster,
        },
        {
          key: 'lastNames',
          type: 'textarea',
          label: 'lastNames',
          placeholder: 'lastNamesPlaceholder',
          rows: 8,
          visibleWhen: isCustomRoster,
        },
        // schema-gap: rosterImportAndClearActions
        {
          key: 'remainingStudents',
          type: 'custom',
          label: 'customRosterActions',
          searchTerms: ['importClass', 'clearNames'],
          visibleWhen: isCustomRoster,
          render: renderRosterActions,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        {
          key: 'mode',
          type: 'segmented',
          label: 'operationMode',
          toPatch: (value) => ({
            mode: value,
            lastResult: null,
            jigsawHomeGroups: null,
            jigsawExpertGroups: null,
            jigsawView: 'home',
          }),
          options: [
            { value: 'single', label: 'pickOne' },
            { value: 'shuffle', label: 'shuffle' },
            { value: 'groups', label: 'groups' },
            { value: 'jigsaw', label: 'jigsaw' },
          ],
        },
        {
          key: 'soundEnabled',
          type: 'toggle',
          label: 'soundEffects',
          help: 'soundEffectsHelp',
        },
        {
          key: 'autoStartTimer',
          type: 'partnerWidget',
          label: 'autoStartTimer',
          partner: 'time-tool',
          missingHelp: 'addTimerHelp',
          visibleWhen: isMode('single'),
          control: {
            key: 'autoStartTimer',
            type: 'toggle',
            label: 'autoStartTimer',
          },
        },
        {
          key: 'visualStyle',
          type: 'segmented',
          label: 'animationStyle',
          visibleWhen: isMode('single'),
          options: [
            { value: 'flash', label: 'styleStandard' },
            { value: 'wheel', label: 'styleWheel' },
            { value: 'slots', label: 'styleSlots' },
          ],
        },
        {
          key: 'groupSize',
          type: 'slider',
          label: 'groupSize',
          min: 2,
          max: 20,
          step: 1,
          readValue: (ctx) => ctx.config.groupSize ?? 3,
          visibleWhen: isMode('groups'),
        },
        // schema-gap: rosterDerivedSlider
        {
          key: 'numHomeGroups',
          type: 'custom',
          label: 'homeGroupCount',
          visibleWhen: isMode('jigsaw'),
          render: renderHomeGroups,
        },
        // schema-gap: siblingDerivedSlider
        {
          key: 'numExpertGroups',
          type: 'custom',
          label: 'expertGroupCount',
          visibleWhen: isMode('jigsaw'),
          render: renderExpertGroups,
        },
        // schema-gap: partnerAction
        {
          key: 'lastResult',
          type: 'custom',
          label: 'sendToStations',
          searchTerms: ['stations'],
          visibleWhen: isMode('groups'),
          render: renderSendToStations,
        },
      ],
    },
  ],
});
