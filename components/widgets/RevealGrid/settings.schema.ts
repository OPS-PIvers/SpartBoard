import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { RevealGridConfig } from '@/types';
import { RevealGridCardsField } from './settingsFields';
import { WINDOW_BACKGROUND_PRESETS } from '@/config/widgetAppearance';

const renderCards = (ctx: CustomRenderCtx) =>
  React.createElement(RevealGridCardsField, { ctx });

const isMemoryMode = (ctx: FieldCtx) => ctx.config.isMemoryMode === true;

export default defineSettings<RevealGridConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'setName',
          type: 'text',
          label: 'practiceSetName',
          placeholder: 'practiceSetNamePlaceholder',
          readValue: (ctx) => ctx.config.setName ?? '',
        },
        // schema-gap: driveBackedCardEditor
        {
          key: 'cards',
          type: 'custom',
          label: 'cards',
          render: renderCards,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        {
          key: 'isMemoryMode',
          type: 'toggle',
          label: 'memoryMode',
          help: 'memoryModeHelp',
          readValue: (ctx) => isMemoryMode(ctx),
        },
        {
          key: 'revealMode',
          type: 'segmented',
          label: 'revealMode',
          options: [
            { value: 'flip', label: 'flip' },
            { value: 'fade', label: 'fade' },
          ],
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'columns',
          type: 'segmented',
          label: 'columns',
          options: [
            { value: 2, label: 'twoColumns' },
            { value: 3, label: 'threeColumns' },
            { value: 4, label: 'fourColumns' },
            { value: 5, label: 'fiveColumns' },
          ],
        },
        {
          key: 'defaultCardColor',
          type: 'color',
          label: 'defaultCardColor',
          presets: WINDOW_BACKGROUND_PRESETS,
          readValue: (ctx) => ctx.config.defaultCardColor ?? '#dbeafe',
        },
        {
          key: 'defaultCardBackColor',
          type: 'color',
          label: 'defaultCardBackColor',
          presets: WINDOW_BACKGROUND_PRESETS,
          readValue: (ctx) => ctx.config.defaultCardBackColor ?? '#dcfce7',
        },
      ],
    },
  ],
  styleKeys: ['fontFamily'],
});
