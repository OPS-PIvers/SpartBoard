import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { SyntaxFramerConfig } from '@/types';
import { SyntaxTokenEditorField } from './settingsFields';
import { retokenizeSyntax } from './settingsUtils';

const renderTokens = (ctx: CustomRenderCtx) =>
  React.createElement(SyntaxTokenEditorField, { ctx });

const modeOptions = [
  { value: 'text', label: 'text' },
  { value: 'math', label: 'math' },
] as const;

export default defineSettings<SyntaxFramerConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: tokenizingEditor
        {
          key: 'tokens',
          type: 'custom',
          label: 'content',
          render: renderTokens,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        {
          key: 'mode',
          type: 'segmented',
          label: 'mode',
          options: modeOptions,
          toPatch: (value, ctx: FieldCtx) => {
            const mode = value === 'math' ? 'math' : 'text';
            const config = ctx.config as unknown as SyntaxFramerConfig;
            const text = (config.tokens ?? [])
              .map((token) => token.value)
              .join(config.mode === 'text' ? ' ' : '');
            return {
              mode,
              tokens: retokenizeSyntax(text, mode, config.tokens ?? []),
            };
          },
        },
        {
          key: 'alignment',
          type: 'segmented',
          label: 'alignment',
          options: [
            { value: 'left', label: 'left' },
            { value: 'center', label: 'center' },
          ],
        },
      ],
    },
  ],
});
