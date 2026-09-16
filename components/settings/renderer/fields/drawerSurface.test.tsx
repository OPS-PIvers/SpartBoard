import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FieldRenderer } from '../FieldRenderer';
import type { Field } from '@/components/settings/schema/types';
import {
  FONT_COLOR_PRESETS,
  TEXT_COLOR_SWATCHES,
  NOTE_COLOR_PRESETS,
} from '@/config/widgetAppearance';
import { makeCtx, widget } from './testUtils';

const drawerCtx = (config: Record<string, unknown> = {}) => ({
  ...makeCtx(config),
  surface: 'drawer' as const,
});

const renderField = (field: Field, ctx = drawerCtx()) => {
  const updateConfig = vi.fn();
  render(
    <FieldRenderer
      field={field}
      widget={widget}
      ctx={ctx}
      updateConfig={updateConfig}
    />
  );
  return updateConfig;
};

describe('drawer-surface field presentations', () => {
  it('renders fontFamily as a dropdown and writes the chosen font', () => {
    const updateConfig = renderField({
      type: 'fontFamily',
      key: 'fontFamily',
      label: 'label',
    });
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('option', { name: 'Serif' }));
    expect(updateConfig).toHaveBeenCalledWith({ fontFamily: 'font-serif' });
  });

  it('writes undefined when Default is chosen', () => {
    const updateConfig = renderField(
      { type: 'fontFamily', key: 'fontFamily', label: 'label' },
      drawerCtx({ fontFamily: 'font-serif' })
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('option', { name: 'Default' }));
    expect(updateConfig).toHaveBeenCalledWith({ fontFamily: undefined });
  });

  it('renders textSizePreset as a stepped slider', () => {
    const updateConfig = renderField(
      { type: 'textSizePreset', key: 'textSizePreset', label: 'label' },
      drawerCtx({ textSizePreset: 'medium' })
    );
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuetext', 'Medium');
    fireEvent.change(slider, { target: { value: '3' } });
    expect(updateConfig).toHaveBeenCalledWith({ textSizePreset: 'x-large' });
  });

  it('uses the whiteboard font-color presets in the drawer', () => {
    renderField({ type: 'color', key: 'fontColor', label: 'label' });
    for (const preset of FONT_COLOR_PRESETS) {
      expect(
        screen.getByRole('radio', { name: new RegExp(`${preset.name}$`) })
      ).toBeInTheDocument();
    }
  });

  it('uses named presets a field passes explicitly', () => {
    renderField({
      type: 'color',
      key: 'bgColor',
      label: 'label',
      presets: NOTE_COLOR_PRESETS,
    });
    for (const preset of NOTE_COLOR_PRESETS) {
      expect(
        screen.getByRole('radio', { name: new RegExp(`${preset.name}$`) })
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('radio', { name: /Red$/ })
    ).not.toBeInTheDocument();
  });

  it('keeps the legacy presets and chip grid without the drawer surface', () => {
    render(
      <>
        <FieldRenderer
          field={{ type: 'color', key: 'fontColor', label: 'label' }}
          widget={widget}
          ctx={makeCtx()}
          updateConfig={vi.fn()}
        />
        <FieldRenderer
          field={{ type: 'fontFamily', key: 'fontFamily', label: 'label' }}
          widget={widget}
          ctx={makeCtx()}
          updateConfig={vi.fn()}
        />
      </>
    );
    expect(
      screen.getByRole('radio', {
        name: new RegExp(`${TEXT_COLOR_SWATCHES[3].name}$`),
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Serif' })).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
