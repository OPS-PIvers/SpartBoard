import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { ConceptWebConfig } from '@/types';
import { ConceptWebCanvasField } from './settingsFields';

const renderCanvas = (ctx: CustomRenderCtx) =>
  React.createElement(ConceptWebCanvasField, { ctx });

export default defineSettings<ConceptWebConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: board-face-node-editor
        {
          key: 'nodes',
          type: 'custom',
          label: 'canvasActions',
          render: renderCanvas,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'defaultNodeWidth',
          type: 'slider',
          label: 'defaultNodeWidth',
          min: 5,
          max: 50,
          step: 1,
          readValue: (ctx) => ctx.config.defaultNodeWidth ?? 15,
        },
        {
          key: 'defaultNodeHeight',
          type: 'slider',
          label: 'defaultNodeHeight',
          min: 5,
          max: 50,
          step: 1,
          readValue: (ctx) => ctx.config.defaultNodeHeight ?? 15,
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'cardColor'],
});
