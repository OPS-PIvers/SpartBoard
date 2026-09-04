import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ColorPresetPicker } from '@/components/common/ColorPresetPicker';
import type { ColorPreset } from '@/config/widgetAppearance';

const PRESETS: readonly ColorPreset[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'Slate', hex: '#334155' },
  { name: 'White', hex: '#ffffff' },
];

const swatch = (name: string) =>
  screen.getByRole('radio', { name: `Select text color ${name}` });

describe('ColorPresetPicker', () => {
  it('names swatches by preset name, not hex, and checks the matching one', () => {
    render(
      <ColorPresetPicker
        label="Text Color"
        subject="text color"
        presets={PRESETS}
        value="#334155"
        fallback="#000000"
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('radiogroup', { name: 'Text Color' })
    ).toBeInTheDocument();
    expect(swatch('Slate')).toHaveAttribute('aria-checked', 'true');
    expect(swatch('Black')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('radio', { name: /#/ })).toBeNull();
  });

  it('matches presets case-insensitively and with shortform hex', () => {
    render(
      <ColorPresetPicker
        label="Text Color"
        subject="text color"
        presets={PRESETS}
        value="#FFF"
        fallback="#000000"
        onChange={vi.fn()}
      />
    );
    expect(swatch('White')).toHaveAttribute('aria-checked', 'true');
  });

  it('applies roving tabindex and arrow-key navigation', () => {
    const onChange = vi.fn();
    render(
      <ColorPresetPicker
        label="Text Color"
        subject="text color"
        presets={PRESETS}
        value="#000000"
        fallback="#000000"
        onChange={onChange}
      />
    );

    const black = swatch('Black');
    const slate = swatch('Slate');
    const white = swatch('White');
    expect(black).toHaveAttribute('tabindex', '0');
    expect(slate).toHaveAttribute('tabindex', '-1');

    black.focus();
    fireEvent.keyDown(black, { key: 'ArrowRight' });
    expect(slate).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('#334155');

    fireEvent.keyDown(slate, { key: 'End' });
    expect(white).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('#ffffff');

    fireEvent.keyDown(white, { key: 'Home' });
    expect(black).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('#000000');
  });

  it('keeps exactly one swatch tabbable for a custom (non-preset) value', () => {
    render(
      <ColorPresetPicker
        label="Text Color"
        subject="text color"
        presets={PRESETS}
        value="#123456"
        fallback="#000000"
        onChange={vi.fn()}
      />
    );
    const tabbable = screen
      .getAllByRole('radio')
      .filter((el) => el.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(swatch('Black'));
  });

  it('renders a leading clear swatch when onClear is given and checks it for undefined', () => {
    const onClear = vi.fn();
    const onChange = vi.fn();
    render(
      <ColorPresetPicker
        label="Date color"
        presets={PRESETS}
        value={undefined}
        fallback="#334155"
        onChange={onChange}
        onClear={onClear}
        clearLabel="Match"
      />
    );

    const match = screen.getByRole('radio', { name: 'Match' });
    expect(match).toHaveAttribute('aria-checked', 'true');
    expect(match).toHaveAttribute('tabindex', '0');
    // The fallback hex paints the custom swatch but does not check the matching preset.
    expect(
      screen.getByRole('radio', { name: 'Select date color Slate' })
    ).toHaveAttribute('aria-checked', 'false');

    match.focus();
    fireEvent.keyDown(match, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('#000000');

    fireEvent.click(match);
    expect(onClear).toHaveBeenCalled();
  });

  it('forwards the native color input and commits a valid hex from the text field', () => {
    const onChange = vi.fn();
    render(
      <ColorPresetPicker
        label="Text Color"
        subject="text color"
        presets={PRESETS}
        value="#000000"
        fallback="#000000"
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText('Custom text color'), {
      target: { value: '#abcdef' },
    });
    expect(onChange).toHaveBeenLastCalledWith('#abcdef');

    const hexField = screen.getByLabelText('Text Color hex value');
    fireEvent.change(hexField, { target: { value: 'ABC' } });
    fireEvent.blur(hexField);
    expect(onChange).toHaveBeenLastCalledWith('#aabbcc');
    expect(hexField).toHaveValue('#aabbcc');
  });

  it('reverts an invalid hex draft instead of committing it', () => {
    const onChange = vi.fn();
    render(
      <ColorPresetPicker
        label="Text Color"
        subject="text color"
        presets={PRESETS}
        value="#334155"
        fallback="#000000"
        onChange={onChange}
      />
    );

    const hexField = screen.getByLabelText('Text Color hex value');
    fireEvent.change(hexField, { target: { value: '#banana' } });
    fireEvent.keyDown(hexField, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(hexField).toHaveValue('#334155');
  });
});
