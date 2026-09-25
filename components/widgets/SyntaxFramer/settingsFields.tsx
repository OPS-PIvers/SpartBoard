import React, { useState } from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { SyntaxFramerConfig } from '@/types';
import {
  normalizeSyntaxText,
  retokenizeSyntax,
  syntaxTokensToText,
} from './settingsUtils';

export const SyntaxTokenEditorField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const config = ctx.config as unknown as SyntaxFramerConfig;
  const mode = config.mode ?? 'text';
  const tokens = config.tokens ?? [];
  const initialText = syntaxTokensToText(tokens, mode);
  const [inputText, setInputText] = useState(initialText);
  const [prevInitialText, setPrevInitialText] = useState(initialText);
  const [prevMode, setPrevMode] = useState(mode);
  const t = (leaf: string) => ctx.t(`widgetSettings.syntax-framer.${leaf}`);

  // Keep the draft in sync with external config changes (e.g. undo/redo or a
  // mode switch) without an effect. When the canonical text is the result of
  // this input's own tokenization, retain the raw draft so spaces stay usable
  // while typing.
  const normalizedInputText = normalizeSyntaxText(inputText, mode);
  if (mode !== prevMode) {
    setPrevMode(mode);
    setPrevInitialText(initialText);
    setInputText(initialText);
  } else if (initialText !== prevInitialText) {
    setPrevInitialText(initialText);
    if (normalizedInputText !== initialText) setInputText(initialText);
  }

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
    </div>
  );
};
