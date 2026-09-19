import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CustomRenderCtx,
  TranslateFn,
} from '@/components/settings/schema/types';
import type { SyntaxFramerConfig, WidgetData } from '@/types';
import { SyntaxTokenEditorField } from './settingsFields';
import { retokenizeSyntax } from './settingsUtils';

const t: TranslateFn = (key) => key;

const widget = {
  id: 'syntax-framer-test',
  type: 'syntax-framer',
  x: 0,
  y: 0,
  w: 400,
  h: 200,
  z: 1,
  flipped: false,
} as WidgetData;

const initialConfig: SyntaxFramerConfig = {
  mode: 'text',
  tokens: [{ id: 'token-1', value: 'hello', isMasked: false }],
  alignment: 'left',
};

const SyntaxEditorHarness: React.FC = () => {
  const [config, setConfig] = useState<SyntaxFramerConfig>(initialConfig);
  const configRecord = config as unknown as Record<string, unknown>;
  const ctx: CustomRenderCtx = {
    config: configRecord,
    widget: { ...widget, config: configRecord },
    isAdmin: false,
    canAccessFeature: () => true,
    t,
    id: 'syntax-editor',
    labelId: 'syntax-editor-label',
    updateConfig: (patch) =>
      setConfig((current) => ({ ...current, ...patch }) as SyntaxFramerConfig),
  };

  return <SyntaxTokenEditorField ctx={ctx} />;
};

describe('Syntax Framer token editor', () => {
  it('keeps raw whitespace in the draft while the parent stores tokens', () => {
    render(<SyntaxEditorHarness />);
    const textarea = screen.getByRole('textbox');

    fireEvent.change(textarea, { target: { value: 'hello  ' } });

    expect(textarea).toHaveValue('hello  ');
  });

  it('still retokenizes text through the settings update', () => {
    const updateConfig = vi.fn<CustomRenderCtx['updateConfig']>();
    const configRecord = initialConfig as unknown as Record<string, unknown>;
    const ctx = {
      config: configRecord,
      widget: { ...widget, config: configRecord },
      isAdmin: false,
      canAccessFeature: () => true,
      t,
      id: 'syntax-editor',
      labelId: 'syntax-editor-label',
      updateConfig,
    } satisfies CustomRenderCtx;

    render(<SyntaxTokenEditorField ctx={ctx} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'hello world' },
    });

    const update = updateConfig.mock.calls[0]?.[0];
    expect(update?.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'hello' }),
        expect.objectContaining({ value: 'world' }),
      ])
    );
    expect(
      retokenizeSyntax('hello world', 'text', initialConfig.tokens)
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'hello' }),
        expect.objectContaining({ value: 'world' }),
      ])
    );
  });
});
