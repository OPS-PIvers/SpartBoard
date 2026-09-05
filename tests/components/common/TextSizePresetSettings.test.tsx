/**
 * Regression tests for TextSizePresetSettings.
 *
 * BUG: The `role="radiogroup"` of `role="radio"` text-size preset buttons had
 * no WAI-ARIA radiogroup keyboard contract — no roving tabIndex (every
 * option was tabbable, or none were), and no arrow-key navigation between
 * options. Same bug class already fixed for TypographySettings.tsx (#2793)
 * and SurfaceColorSettings.tsx (#2831) via the shared
 * `handleRadioGroupKeyDown` helper in `radioGroupKeyNav.ts`.
 *
 * FIX: Wire `handleRadioGroupKeyDown` to the radiogroup's `onKeyDown`, and
 * give each option a roving `tabIndex` (selected = 0, others = -1).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TextSizePresetSettings } from '@/components/common/TextSizePresetSettings';
import { TEXT_SIZE_PRESETS } from '@/config/widgetAppearance';

describe('TextSizePresetSettings — radiogroup keyboard contract', () => {
  it('applies roving tabindex: selected=0, others=-1', () => {
    render(
      <TextSizePresetSettings
        config={{ textSizePreset: 'large' }}
        updateConfig={vi.fn()}
      />
    );

    expect(screen.getByRole('radio', { name: 'Large' })).toHaveAttribute(
      'tabindex',
      '0'
    );
    for (const preset of TEXT_SIZE_PRESETS.filter((p) => p.id !== 'large')) {
      expect(screen.getByRole('radio', { name: preset.label })).toHaveAttribute(
        'tabindex',
        '-1'
      );
    }
  });

  it('keeps exactly one option tabbable at a time', () => {
    render(
      <TextSizePresetSettings
        config={{ textSizePreset: 'small' }}
        updateConfig={vi.fn()}
      />
    );

    const tabbable = screen
      .getAllByRole('radio')
      .filter((el) => el.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAccessibleName('Small');
  });

  it('moves focus AND updates config on ArrowRight/ArrowLeft/Home/End', () => {
    const updateConfig = vi.fn();
    render(
      <TextSizePresetSettings
        config={{ textSizePreset: 'small' }}
        updateConfig={updateConfig}
      />
    );

    const small = screen.getByRole('radio', { name: 'Small' });
    const medium = screen.getByRole('radio', { name: 'Medium' });
    const xLarge = screen.getByRole('radio', { name: 'X-Large' });

    small.focus();
    fireEvent.keyDown(small, { key: 'ArrowRight' });
    expect(medium).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({ textSizePreset: 'medium' });

    fireEvent.keyDown(medium, { key: 'ArrowLeft' });
    expect(small).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({ textSizePreset: 'small' });

    fireEvent.keyDown(small, { key: 'End' });
    expect(xLarge).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({
      textSizePreset: 'x-large',
    });

    fireEvent.keyDown(xLarge, { key: 'Home' });
    expect(small).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({ textSizePreset: 'small' });
  });

  it('also writes scaleMultiplier on arrow-key navigation when writeScaleMultiplier is set', () => {
    const updateConfig = vi.fn();
    render(
      <TextSizePresetSettings
        config={{ textSizePreset: 'small' }}
        updateConfig={updateConfig}
        writeScaleMultiplier
      />
    );

    const small = screen.getByRole('radio', { name: 'Small' });
    small.focus();
    fireEvent.keyDown(small, { key: 'ArrowRight' });

    expect(updateConfig).toHaveBeenLastCalledWith({
      textSizePreset: 'medium',
      scaleMultiplier: 1,
    });
  });
});
