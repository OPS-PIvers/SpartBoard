import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { FieldRenderer } from '../FieldRenderer';
import type { EmojiPickerField } from '@/components/settings/schema/types';
import { CURATED_EMOJI_GROUPS, firstGrapheme } from './emojiCatalog';
import { makeCtx, widget } from './testUtils';

const STRUCTURAL_ONLY = { rules: { 'color-contrast': { enabled: false } } };

const field: EmojiPickerField<string> = {
  type: 'emojiPicker',
  key: 'emoji',
  label: 'label',
};

function renderField(
  config: Record<string, unknown>,
  updateConfig = vi.fn(),
  override: Partial<EmojiPickerField<string>> = {}
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

describe('firstGrapheme', () => {
  it('collapses pasted text to one grapheme cluster', () => {
    expect(firstGrapheme(' 🎉🎉 ')).toBe('🎉');
    expect(firstGrapheme('👍🏽x')).toBe('👍🏽');
    expect(firstGrapheme('')).toBe('');
  });

  it('keeps ZWJ, skin-tone, keycap and flag sequences whole without Intl.Segmenter', () => {
    vi.stubGlobal(
      'Intl',
      Object.create(Intl, { Segmenter: { value: undefined } })
    );
    try {
      expect(typeof Intl.Segmenter).toBe('undefined');
      expect(firstGrapheme('👨‍👩‍👧‍👦 family')).toBe('👨‍👩‍👧‍👦');
      expect(firstGrapheme('👍🏽x')).toBe('👍🏽');
      expect(firstGrapheme('1️⃣2️⃣')).toBe('1️⃣');
      expect(firstGrapheme('🇺🇸🇨🇦')).toBe('🇺🇸');
      expect(firstGrapheme('❤️❤️')).toBe('❤️');
      expect(firstGrapheme('ab')).toBe('a');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('EmojiPicker field', () => {
  it('renders the curated groups with the current emoji checked', () => {
    renderField({ emoji: '🍎' });
    expect(screen.getByRole('group', { name: 'Label' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '🍎' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    const total = CURATED_EMOJI_GROUPS.reduce(
      (sum, group) => sum + group.emoji.length,
      0
    );
    expect(screen.getAllByRole('radio')).toHaveLength(total);
    expect(total).toBeGreaterThanOrEqual(60);
    for (const group of CURATED_EMOJI_GROUPS) {
      expect(screen.getByText(group.leaf)).toBeInTheDocument();
    }
  });

  it('writes the picked emoji through onChange', () => {
    const updateConfig = vi.fn();
    renderField({}, updateConfig);
    fireEvent.click(screen.getByRole('radio', { name: '🚀' }));
    expect(updateConfig).toHaveBeenCalledWith({ emoji: '🚀' });
  });

  it('accepts a pasted emoji from the text input, one grapheme only', () => {
    const updateConfig = vi.fn();
    renderField({ emoji: '🍎' }, updateConfig);
    const input = screen.getByRole('textbox', { name: 'emojiCustom' });
    expect(input).toHaveValue('🍎');
    fireEvent.change(input, { target: { value: '🦄🦄' } });
    expect(updateConfig).toHaveBeenCalledWith({ emoji: '🦄' });
  });

  it('honours a custom emoji list and keeps one tab stop', () => {
    renderField({ emoji: 'B' }, vi.fn(), { emoji: ['A', 'B', 'C'] });
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'B' }).tabIndex).toBe(0);
  });

  it('moves selection with arrow keys', () => {
    const updateConfig = vi.fn();
    renderField({ emoji: 'A' }, updateConfig, { emoji: ['A', 'B', 'C'] });
    const a = screen.getByRole('radio', { name: 'A' });
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(updateConfig).toHaveBeenCalledWith({ emoji: 'B' });
    expect(screen.getByRole('radio', { name: 'B' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'B' }), {
      key: 'End',
    });
    expect(updateConfig).toHaveBeenLastCalledWith({ emoji: 'C' });
  });

  it('honours disabled', () => {
    renderField({}, vi.fn(), { emoji: ['A'], disabledWhen: () => true });
    expect(screen.getByRole('radio', { name: 'A' })).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('looks disabled inside an ancestor <fieldset disabled> (read-only drawer)', () => {
    render(
      <fieldset disabled>
        <FieldRenderer
          field={{ ...field, emoji: ['A'] }}
          widget={widget}
          ctx={makeCtx({})}
          updateConfig={vi.fn()}
        />
      </fieldset>
    );
    const radio = screen.getByRole('radio', { name: 'A' });
    expect(radio).toBeDisabled();
    expect(radio.className).toContain('disabled:opacity-50');
    expect(radio.className).toContain('disabled:cursor-not-allowed');
    expect(radio.className).not.toMatch(/(^|\s)opacity-50(\s|$)/);
  });

  it('has no structural axe violations', async () => {
    const { container } = renderField({ emoji: '🍎' });
    expect(await axe(container, STRUCTURAL_ONLY)).toHaveNoViolations();
  });
});
