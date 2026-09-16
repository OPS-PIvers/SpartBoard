import React from 'react';
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
} from 'lucide-react';
import type { TextConfig } from '@/types';
import type { FieldCtx } from '@/components/settings/schema/types';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import { STICKY_NOTE_COLORS } from '@/config/colors';
import { NOTE_COLOR_PRESETS } from '@/config/widgetAppearance';
import { TemplateGrid } from './TemplateGrid';

// Legacy flip panel keeps these on the formatting toolbar (D27).
const inDrawer = (ctx: FieldCtx) => ctx.surface === 'drawer';
const iconClass = 'w-3.5 h-3.5';

export default defineSettings<TextConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: templateApply
        {
          key: 'content',
          type: 'custom',
          label: 'templates',
          render: (ctx) => React.createElement(TemplateGrid, { ctx }),
        },
      ],
    },
    {
      id: 'display',
      title: 'note',
      fields: [
        {
          key: 'bgColor',
          type: 'color',
          label: 'noteColor',
          presets: NOTE_COLOR_PRESETS,
          visibleWhen: inDrawer,
          readValue: (ctx) => ctx.config.bgColor ?? STICKY_NOTE_COLORS.yellow,
        },
        {
          key: 'verticalAlign',
          type: 'segmented',
          label: 'verticalAlign',
          options: [
            {
              value: 'top',
              label: 'alignTop',
              icon: React.createElement(AlignVerticalJustifyStart, {
                className: iconClass,
                'aria-hidden': true,
              }),
            },
            {
              value: 'center',
              label: 'alignMiddle',
              icon: React.createElement(AlignVerticalJustifyCenter, {
                className: iconClass,
                'aria-hidden': true,
              }),
            },
            {
              value: 'bottom',
              label: 'alignBottom',
              icon: React.createElement(AlignVerticalJustifyEnd, {
                className: iconClass,
                'aria-hidden': true,
              }),
            },
          ],
          visibleWhen: inDrawer,
          readValue: (ctx) => ctx.config.verticalAlign ?? 'center',
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'textSizePreset'],
});
