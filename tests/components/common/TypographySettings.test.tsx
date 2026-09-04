/**
 * Regression tests for TypographySettings.
 *
 * BUG: Clicking the "Inherit" (global) font button called
 *   updateConfig({ fontFamily: 'global' })
 * which wrote the literal sentinel string 'global' into the widget config.
 * Several config types (CountdownConfig, BreathingConfig, ActivityWallConfig,
 * etc.) type fontFamily as `GlobalFontFamily`, a union that does NOT include
 * 'global'. Persisting 'global' to Firestore therefore violates the declared
 * type contract. Additionally, a dead-code condition
 *   (!fontFamily && f.id === 'global')
 * on the selected-button check was unreachable because the fontFamily
 * destructuring default ('global') prevents fontFamily from ever being falsy.
 *
 * FIX: The onClick handler now writes `undefined` (clearing the override)
 * when the user selects the "Inherit" (global) button, consistent with how
 * other reset actions work (e.g. UniversalStyleSettings' font reset).
 * The dead-code branch was removed from the selected-state condition.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TypographySettings } from '@/components/common/TypographySettings';
import { FONTS } from '@/config/fonts';
import { TEXT_COLOR_SWATCHES } from '@/config/widgetAppearance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal config that satisfies TypographySettings' generic constraint. */
type TestConfig = { fontFamily?: string; fontColor?: string };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TypographySettings', () => {
  it('highlights the Inherit button when fontFamily is undefined (no override set)', () => {
    const config: TestConfig = { fontFamily: undefined };
    const updateConfig = vi.fn();

    render(<TypographySettings config={config} updateConfig={updateConfig} />);

    // The "Inherit" button should be visually selected
    const inheritButton = screen.getByRole('radio', { name: /inherit/i });
    expect(inheritButton.className).toContain('border-brand-blue-primary');
  });

  it('highlights the Inherit button when fontFamily is explicitly "global"', () => {
    // Legacy configs may have 'global' persisted; the button must still show as
    // selected (fontFamily = 'global' default in destructuring handles this).
    const config: TestConfig = { fontFamily: 'global' };
    const updateConfig = vi.fn();

    render(<TypographySettings config={config} updateConfig={updateConfig} />);

    const inheritButton = screen.getByRole('radio', { name: /inherit/i });
    expect(inheritButton.className).toContain('border-brand-blue-primary');
  });

  it('highlights a specific font button when that font is selected', () => {
    const config: TestConfig = { fontFamily: 'font-mono' };
    const updateConfig = vi.fn();

    render(<TypographySettings config={config} updateConfig={updateConfig} />);

    const monoButton = screen.getByRole('radio', { name: /digital/i });
    expect(monoButton.className).toContain('border-brand-blue-primary');

    // Inherit button must NOT be selected when a specific font is active
    const inheritButton = screen.getByRole('radio', { name: /inherit/i });
    expect(inheritButton.className).not.toContain('border-brand-blue-primary');
  });

  /**
   * Core regression: clicking "Inherit" must write `undefined` to the config,
   * NOT the literal string `'global'`.
   *
   * Before the fix: updateConfig was called with { fontFamily: 'global' },
   * violating the GlobalFontFamily type contract and polluting Firestore with
   * an invalid sentinel value.
   *
   * After the fix: updateConfig is called with { fontFamily: undefined },
   * which properly clears any font override so the widget inherits the
   * dashboard global font.
   */
  it('writes undefined (not "global") when the Inherit button is clicked', () => {
    const config: TestConfig = { fontFamily: 'font-sans' };
    const updateConfig = vi.fn();

    render(<TypographySettings config={config} updateConfig={updateConfig} />);

    fireEvent.click(screen.getByRole('radio', { name: /inherit/i }));

    expect(updateConfig).toHaveBeenCalledOnce();
    const [calledWith] = updateConfig.mock.calls[0] as [Partial<TestConfig>];

    // Must NOT write the 'global' sentinel — that string is not a valid
    // GlobalFontFamily value and must not be persisted to Firestore.
    expect(calledWith.fontFamily).not.toBe('global');

    // Must write undefined to clear the override so the widget inherits the
    // dashboard's global font via its own destructuring default.
    expect(calledWith.fontFamily).toBeUndefined();
  });

  it('writes the font id when a named font button is clicked', () => {
    const config: TestConfig = { fontFamily: undefined };
    const updateConfig = vi.fn();

    render(<TypographySettings config={config} updateConfig={updateConfig} />);

    // "Digital" is the label for font-mono
    fireEvent.click(screen.getByRole('radio', { name: /digital/i }));

    expect(updateConfig).toHaveBeenCalledOnce();
    const [calledWith] = updateConfig.mock.calls[0] as [Partial<TestConfig>];
    expect(calledWith.fontFamily).toBe('font-mono');
  });
});

/**
 * Regression (#2423 review): each font option renders a decorative sample
 * glyph (`✏️`, `☺`, `𝒞`, `★`, `◯`, `▦`, `✍` …) beside its label. The glyph
 * span had no `aria-hidden`, so it was folded into the button's accessible
 * name and options announced as e.g. "✏️ School, radio" instead of "School,
 * radio". CLAUDE.md's accessibility baseline calls for `aria-hidden` on
 * purely decorative icons.
 *
 * These assert on the COMPUTED ACCESSIBLE NAME (which honours aria-hidden),
 * not textContent (which does not) — testing textContent here would fail
 * even with the fix in place.
 */
describe('TypographySettings — decorative glyphs excluded from accessible names', () => {
  type Cfg = { fontFamily?: string; fontColor?: string };

  it('names each font option by its label alone, with no glyph', () => {
    render(<TypographySettings config={{} as Cfg} updateConfig={vi.fn()} />);

    // Exact-string role queries match against the accessible name, so these
    // only resolve when the glyph is excluded from it. 'School' carries the
    // '✏️' emoji and 'Cursive' the '𝒞' mathematical script capital — the two
    // most disruptive to announce character-by-character.
    for (const label of ['School', 'Cursive', 'Comic', 'Fun', 'Marker']) {
      expect(screen.getByRole('radio', { name: label })).toHaveAccessibleName(
        label
      );
    }
  });

  it('marks the glyph span aria-hidden on every font option', () => {
    render(<TypographySettings config={{} as Cfg} updateConfig={vi.fn()} />);

    // Every font option must carry exactly one aria-hidden descendant (the
    // glyph). Scoped per-button so a stray aria-hidden elsewhere in the tree
    // cannot satisfy this.
    const fontOptions = FONTS.map((f) =>
      screen.getByRole('radio', { name: f.label })
    );
    expect(fontOptions).toHaveLength(FONTS.length);

    for (const option of fontOptions) {
      expect(option.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    }
  });
});

/**
 * Regression: both `role="radiogroup"` pickers (Typography font family, Text
 * Color) render `role="radio"` options with no WAI-ARIA radiogroup keyboard
 * contract — no roving tabIndex, no arrow-key navigation. Same bug class
 * already fixed for `SegmentedControl.tsx` (#2564); this file was never
 * audited for it despite being the higher-traffic sibling (used in nearly
 * every widget's style tab per CLAUDE.md).
 */
describe('TypographySettings — radiogroup keyboard contract', () => {
  type Cfg = { fontFamily?: string; fontColor?: string };

  it('applies roving tabindex to the font family radiogroup: selected=0, others=-1', () => {
    const config: Cfg = { fontFamily: 'font-mono' };
    render(<TypographySettings config={config} updateConfig={vi.fn()} />);

    expect(screen.getByRole('radio', { name: 'Digital' })).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(screen.getByRole('radio', { name: 'Inherit' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('moves focus AND updates config on ArrowRight/ArrowLeft/Home/End in the font family radiogroup', () => {
    const updateConfig = vi.fn();
    const config: Cfg = { fontFamily: undefined }; // selected = 'global' (Inherit, index 0)
    render(<TypographySettings config={config} updateConfig={updateConfig} />);

    const inherit = screen.getByRole('radio', { name: 'Inherit' });
    const modern = screen.getByRole('radio', { name: FONTS[1].label });

    inherit.focus();
    fireEvent.keyDown(inherit, { key: 'ArrowRight' });
    expect(modern).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({
      fontFamily: FONTS[1].id,
    });

    fireEvent.keyDown(modern, { key: 'ArrowLeft' });
    expect(inherit).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({ fontFamily: undefined });

    const last = screen.getByRole('radio', {
      name: FONTS[FONTS.length - 1].label,
    });
    fireEvent.keyDown(inherit, { key: 'End' });
    expect(last).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({
      fontFamily: FONTS[FONTS.length - 1].id,
    });

    fireEvent.keyDown(last, { key: 'Home' });
    expect(inherit).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({ fontFamily: undefined });
  });

  const colorSwatch = (preset: { name: string }) =>
    screen.getByRole('radio', { name: `Select text color ${preset.name}` });

  it('applies roving tabindex to the text color radiogroup: selected=0, others=-1', () => {
    const second = TEXT_COLOR_SWATCHES[1];
    const config: Cfg = { fontColor: second.hex };
    render(<TypographySettings config={config} updateConfig={vi.fn()} />);

    expect(colorSwatch(second)).toHaveAttribute('tabindex', '0');
    expect(colorSwatch(TEXT_COLOR_SWATCHES[0])).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('moves focus AND updates config on ArrowRight in the text color radiogroup', () => {
    const updateConfig = vi.fn();
    const config: Cfg = { fontColor: TEXT_COLOR_SWATCHES[0].hex };
    render(<TypographySettings config={config} updateConfig={updateConfig} />);

    const first = colorSwatch(TEXT_COLOR_SWATCHES[0]);
    const second = colorSwatch(TEXT_COLOR_SWATCHES[1]);

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({
      fontColor: TEXT_COLOR_SWATCHES[1].hex,
    });
  });

  it('checks the Slate preset when fontColor is unset (defaults to #334155)', () => {
    const config: Cfg = {};
    render(<TypographySettings config={config} updateConfig={vi.fn()} />);

    expect(colorSwatch({ name: 'Slate' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    const tabbable = screen
      .getAllByRole('radio')
      .filter((el) => el.getAttribute('tabindex') === '0');
    // One font radio + one color radio are tabbable.
    expect(tabbable).toHaveLength(2);
  });

  it('keeps exactly one text color swatch tabbable when fontColor is a custom (non-preset) value', () => {
    const config: Cfg = { fontColor: '#123456' };
    render(<TypographySettings config={config} updateConfig={vi.fn()} />);

    const swatches = TEXT_COLOR_SWATCHES.map((p) => colorSwatch(p));
    const tabbable = swatches.filter(
      (el) => el.getAttribute('tabindex') === '0'
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(swatches[0]);
  });

  it('writes the native color input value to fontColor', () => {
    const updateConfig = vi.fn();
    render(<TypographySettings config={{}} updateConfig={updateConfig} />);
    fireEvent.change(screen.getByLabelText('Custom text color'), {
      target: { value: '#abcdef' },
    });
    expect(updateConfig).toHaveBeenLastCalledWith({ fontColor: '#abcdef' });
  });
});
