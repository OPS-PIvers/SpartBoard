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
    const inheritButton = screen.getByRole('button', { name: /inherit/i });
    expect(inheritButton.className).toContain('border-brand-blue-primary');
  });

  it('highlights the Inherit button when fontFamily is explicitly "global"', () => {
    // Legacy configs may have 'global' persisted; the button must still show as
    // selected (fontFamily = 'global' default in destructuring handles this).
    const config: TestConfig = { fontFamily: 'global' };
    const updateConfig = vi.fn();

    render(<TypographySettings config={config} updateConfig={updateConfig} />);

    const inheritButton = screen.getByRole('button', { name: /inherit/i });
    expect(inheritButton.className).toContain('border-brand-blue-primary');
  });

  it('highlights a specific font button when that font is selected', () => {
    const config: TestConfig = { fontFamily: 'font-mono' };
    const updateConfig = vi.fn();

    render(<TypographySettings config={config} updateConfig={updateConfig} />);

    const monoButton = screen.getByRole('button', { name: /digital/i });
    expect(monoButton.className).toContain('border-brand-blue-primary');

    // Inherit button must NOT be selected when a specific font is active
    const inheritButton = screen.getByRole('button', { name: /inherit/i });
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

    fireEvent.click(screen.getByRole('button', { name: /inherit/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /digital/i }));

    expect(updateConfig).toHaveBeenCalledOnce();
    const [calledWith] = updateConfig.mock.calls[0] as [Partial<TestConfig>];
    expect(calledWith.fontFamily).toBe('font-mono');
  });
});
