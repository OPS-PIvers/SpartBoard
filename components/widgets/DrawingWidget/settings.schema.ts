import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { DrawingBackground, DrawingConfig } from '@/types';
import { migrateDrawingConfig } from '@/utils/migrateDrawingConfig';
import { DRAWING_DEFAULTS } from './constants';
import { DrawingColorPaletteField } from './settingsFields';

const renderColorPalette = (ctx: CustomRenderCtx) =>
  React.createElement(DrawingColorPaletteField, { ctx });

const readBackground = (ctx: FieldCtx) => {
  const config = ctx.config as DrawingConfig;
  const pages = config.pages ?? [];
  const currentPage = Math.max(
    0,
    Math.min(config.currentPage ?? 0, pages.length - 1)
  );
  return (
    pages[currentPage]?.background ??
    config.background ??
    DRAWING_DEFAULTS.BACKGROUND
  );
};

const writeBackground = (value: unknown, ctx: FieldCtx) => {
  const next = value as DrawingBackground;
  const migrated = migrateDrawingConfig(ctx.config as DrawingConfig);
  const targetIndex = Math.max(
    0,
    Math.min(migrated.currentPage, migrated.pages.length - 1)
  );
  return {
    ...migrated,
    background: next,
    pages: migrated.pages.map((page, index) =>
      index === targetIndex ? { ...page, background: next } : page
    ),
  };
};

export default defineSettings<DrawingConfig>({
  groups: [
    {
      id: 'display',
      fields: [
        // schema-gap: fixedColorPalette
        {
          key: 'customColors',
          type: 'custom',
          label: 'colorPresets',
          searchTerms: ['presetColor'],
          render: renderColorPalette,
        },
        {
          key: 'width',
          type: 'slider',
          label: 'brushThickness',
          min: 1,
          max: 80,
          step: 1,
          readValue: (ctx) => ctx.config.width ?? DRAWING_DEFAULTS.WIDTH,
        },
        {
          key: 'background',
          type: 'segmented',
          label: 'background',
          readValue: readBackground,
          toPatch: writeBackground,
          options: [
            { value: 'blank', label: 'backgroundBlank' },
            { value: 'grid', label: 'backgroundGrid' },
            { value: 'lines', label: 'backgroundLines' },
            { value: 'dots', label: 'backgroundDots' },
          ],
        },
        {
          key: 'shapeFill',
          type: 'toggle',
          label: 'shapeFill',
          help: 'shapeFillHelp',
        },
      ],
    },
  ],
});
