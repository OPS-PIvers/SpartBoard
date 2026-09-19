import React, { useEffect, useState } from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { SyntaxFramerConfig } from '@/types';
import { retokenizeSyntax } from './settingsUtils';

export const SyntaxTokenEditorField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const config = ctx.config as unknown as SyntaxFramerConfig;
  const mode = config.mode ?? 'text';
  const tokens = config.tokens ?? [];
  const initialText = tokens
    .map((token) => token.value)
    .join(mode === 'text' ? ' ' : '');
  const [inputText, setInputText] = useState(initialText);
  const t = (leaf: string) => ctx.t(`widgetSettings.syntax-framer.${leaf}`);

  useEffect(() => {
    setInputText(initialText);
  }, [initialText]);

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-2"
    >
      <textarea
        id={`${ctx.id}-input`}
        value={inputText}
        onChange={(event) => {
          const text = event.target.value;
          setInputText(text);
          ctx.updateConfig({ tokens: retokenizeSyntax(text, mode, tokens) });
        }}
        placeholder={t(
          mode === 'text' ? 'contentPlaceholderText' : 'contentPlaceholderMath'
        )}
        rows={3}
        aria-labelledby={ctx.labelId}
        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p className="text-xxs text-slate-500">
        {t(mode === 'text' ? 'contentHelpText' : 'contentHelpMath')}
      </p>
    </div>
  );
};
