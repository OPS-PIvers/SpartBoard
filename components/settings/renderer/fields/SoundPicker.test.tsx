import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { FieldRenderer } from '../FieldRenderer';
import type { SoundPickerField } from '@/components/settings/schema/types';
import { makeCtx, widget } from './testUtils';

const STRUCTURAL_ONLY = { rules: { 'color-contrast': { enabled: false } } };

const field: SoundPickerField<string> = {
  type: 'soundPicker',
  key: 'selectedSound',
  label: 'label',
  options: [
    { value: 'Chime', label: 'Chime' },
    { value: 'Blip', label: 'Blip' },
    { value: 'Gong', label: 'Gong' },
    { value: 'Alert', label: 'Alert' },
  ],
};

function renderField(
  config: Record<string, unknown>,
  updateConfig = vi.fn(),
  override: Partial<SoundPickerField<string>> = {}
) {
  return render(
    <FieldRenderer
      field={{ ...field, ...override }}
      widget={widget}
      ctx={makeCtx(config)}
      updateConfig={updateConfig}
    />
  );
}

describe('SoundPicker field', () => {
  it('renders a radiogroup with the current sound checked', () => {
    renderField({ selectedSound: 'Gong' });
    expect(
      screen.getByRole('radiogroup', { name: 'Label' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Gong' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: 'Chime' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('writes the picked sound through onChange', () => {
    const updateConfig = vi.fn();
    renderField({ selectedSound: 'Gong' }, updateConfig);
    fireEvent.click(screen.getByRole('radio', { name: 'Blip' }));
    expect(updateConfig).toHaveBeenCalledWith({ selectedSound: 'Blip' });
  });

  it('shows a play button per option only when preview is provided', () => {
    const { unmount } = renderField({ selectedSound: 'Chime' });
    expect(screen.queryAllByRole('button', { name: /^previewSound/ })).toEqual(
      []
    );
    unmount();
    const preview = vi.fn();
    const updateConfig = vi.fn();
    renderField({ selectedSound: 'Chime' }, updateConfig, { preview });
    const play = screen.getByRole('button', { name: 'previewSound Gong' });
    fireEvent.click(play);
    expect(preview).toHaveBeenCalledWith('Gong');
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('keeps one tab stop and moves selection with arrow keys', () => {
    const updateConfig = vi.fn();
    renderField({ selectedSound: 'Blip' }, updateConfig, { preview: vi.fn() });
    const radios = screen.getAllByRole('radio');
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    const blip = screen.getByRole('radio', { name: 'Blip' });
    blip.focus();
    fireEvent.keyDown(blip, { key: 'ArrowDown' });
    expect(updateConfig).toHaveBeenCalledWith({ selectedSound: 'Gong' });
    expect(screen.getByRole('radio', { name: 'Gong' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Gong' }), {
      key: 'Home',
    });
    expect(updateConfig).toHaveBeenLastCalledWith({ selectedSound: 'Chime' });
  });

  it('ignores arrow keys coming from a play button', () => {
    const updateConfig = vi.fn();
    renderField({ selectedSound: 'Blip' }, updateConfig, { preview: vi.fn() });
    const play = screen.getByRole('button', { name: 'previewSound Blip' });
    play.focus();
    fireEvent.keyDown(play, { key: 'ArrowRight' });
    expect(updateConfig).not.toHaveBeenCalled();
    expect(play).toHaveFocus();
  });

  it('honours disabled', () => {
    renderField({ selectedSound: 'Blip' }, vi.fn(), {
      preview: vi.fn(),
      disabledWhen: () => true,
    });
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
    expect(
      screen.getByRole('button', { name: 'previewSound Blip' })
    ).toBeDisabled();
  });

  it('has no structural axe violations', async () => {
    const { container } = renderField({ selectedSound: 'Chime' }, vi.fn(), {
      preview: vi.fn(),
    });
    expect(await axe(container, STRUCTURAL_ONLY)).toHaveNoViolations();
  });
});
