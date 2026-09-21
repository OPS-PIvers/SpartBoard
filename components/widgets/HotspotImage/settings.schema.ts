import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { HotspotImageConfig } from '@/types';
import { HotspotImageBaseField, HotspotImagePinsField } from './settingsFields';

const renderBaseImage = (ctx: CustomRenderCtx) =>
  React.createElement(HotspotImageBaseField, { ctx });

const renderPins = (ctx: CustomRenderCtx) =>
  React.createElement(HotspotImagePinsField, { ctx });

const hasImage = (ctx: FieldCtx) =>
  typeof ctx.config.baseImageUrl === 'string' &&
  ctx.config.baseImageUrl.length > 0;

export default defineSettings<HotspotImageConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: image-library-and-pin-placement
        {
          key: 'baseImageUrl',
          type: 'custom',
          label: 'baseImage',
          render: renderBaseImage,
        },
        // schema-gap: interactive-hotspot-editor
        {
          key: 'hotspots',
          type: 'custom',
          label: 'hotspots',
          visibleWhen: hasImage,
          render: renderPins,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'popoverTheme',
          type: 'segmented',
          label: 'popoverTheme',
          visibleWhen: hasImage,
          readValue: (ctx) => ctx.config.popoverTheme ?? 'light',
          options: [
            { value: 'light', label: 'light' },
            { value: 'dark', label: 'dark' },
            { value: 'glass', label: 'glass' },
          ],
        },
      ],
    },
  ],
});
