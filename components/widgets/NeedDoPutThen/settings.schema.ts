import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { NeedDoPutThenConfig } from '@/types';
import {
  DoItemsField,
  NeedItemsField,
  PutItemsField,
  ThenItemsField,
} from './settingsFields';

const renderNeedItems = (ctx: CustomRenderCtx) =>
  React.createElement(NeedItemsField, { ctx });
const renderDoItems = (ctx: CustomRenderCtx) =>
  React.createElement(DoItemsField, { ctx });
const renderPutItems = (ctx: CustomRenderCtx) =>
  React.createElement(PutItemsField, { ctx });
const renderThenItems = (ctx: CustomRenderCtx) =>
  React.createElement(ThenItemsField, { ctx });

export default defineSettings<NeedDoPutThenConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: tileListEditor
        {
          key: 'needItems',
          type: 'custom',
          label: 'needItems',
          searchTerms: ['whatYouNeed'],
          render: renderNeedItems,
        },
        // schema-gap: textListEditor
        {
          key: 'doItems',
          type: 'custom',
          label: 'doItems',
          searchTerms: ['whatYouDo'],
          render: renderDoItems,
        },
        // schema-gap: tileListEditor
        {
          key: 'putItems',
          type: 'custom',
          label: 'putItems',
          searchTerms: ['whereItGoes'],
          render: renderPutItems,
        },
        // schema-gap: tileListEditor
        {
          key: 'thenItems',
          type: 'custom',
          label: 'thenItems',
          searchTerms: ['whatsNext'],
          render: renderThenItems,
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'textSizePreset', 'cardColor'],
});
