/**
 * Regression (#2423 review): SurfaceColorSettings composes its aria-labels by
 * appending the word "color" to the `label` prop. Callers are inconsistent
 * about whether `label` already names a color — DiceWidget/Settings.tsx passes
 * "Die Color" and "Pip Color", while others pass "Surface" (the default) or
 * "Card surface". The Dice groups therefore announced:
 *
 *   radiogroup   → "Die Color color"
 *   each swatch  → "Select die color color #ffffff"
 *   custom input → "Custom die color color"
 *
 * FIX: strip a trailing "color"/"colour"/plural from `label` before composing,
 * so both calling conventions produce a single, natural "… color" phrase.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { SURFACE_COLOR_PRESETS } from '@/config/widgetAppearance';

type Cfg = { cardColor?: string; cardOpacity?: number };

const renderWith = (label?: string) =>
  render(
    <SurfaceColorSettings
      config={{} as Cfg}
      updateConfig={vi.fn()}
      {...(label ? { label } : {})}
    />
  );

describe('SurfaceColorSettings — aria-label composition', () => {
  it('does not double the word "color" when the label already ends in it', () => {
    renderWith('Die Color');

    // Exact-string role queries match the accessible name, so each of these
    // fails if the redundant second "color" is reintroduced.
    expect(
      screen.getByRole('radiogroup', { name: 'Die color' })
    ).toBeInTheDocument();
    // <input type="color"> has no implicit ARIA role, so query by label.
    expect(screen.getByLabelText('Custom die color')).toBeInTheDocument();

    const swatches = screen.getAllByRole('radio');
    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) {
      const name = swatch.getAttribute('aria-label') ?? '';
      expect(name).toMatch(/^Select die color #/);
      // Belt and braces: no accessible name may contain "color" twice.
      expect(name.toLowerCase().match(/color/g) ?? []).toHaveLength(1);
    }
  });

  it('still appends "color" for labels that do not already name one', () => {
    // The other calling convention must keep working — stripping must not
    // eat a label that merely ends in a different word.
    renderWith('Card surface');

    expect(
      screen.getByRole('radiogroup', { name: 'Card surface color' })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Custom card surface color')
    ).toBeInTheDocument();
  });

  it('uses the default "Surface" label when none is provided', () => {
    renderWith();

    expect(
      screen.getByRole('radiogroup', { name: 'Surface color' })
    ).toBeInTheDocument();
  });

  it('does not strip a label that is exactly "Color" down to nothing', () => {
    // Guard on the `|| label` fallback: stripping "Color" from "Color" leaves
    // an empty string, which would produce a nameless group and the
    // accessible name " color".
    renderWith('Color');

    expect(
      screen.getByRole('radiogroup', { name: 'Color color' })
    ).toBeInTheDocument();
  });
});

/**
 * Regression: the surface-color `role="radiogroup"` rendered `role="radio"`
 * swatches with no WAI-ARIA radiogroup keyboard contract — no roving
 * tabIndex, no arrow-key navigation. Same bug class already fixed for
 * `SegmentedControl.tsx` (#2564) and `TypographySettings.tsx` (#2793); this
 * file — the highest-traffic sibling (21 call sites) — was never audited.
 */
describe('SurfaceColorSettings — radiogroup keyboard contract', () => {
  type Cfg = { cardColor?: string; cardOpacity?: number };

  const swatchFor = (color: string) =>
    screen.getByRole('radio', { name: `Select surface color ${color}` });

  it('applies roving tabindex: selected preset=0, others=-1', () => {
    const selected = SURFACE_COLOR_PRESETS[2];
    render(
      <SurfaceColorSettings
        config={{ cardColor: selected } as Cfg}
        updateConfig={vi.fn()}
      />
    );

    expect(swatchFor(selected)).toHaveAttribute('tabindex', '0');
    expect(swatchFor(SURFACE_COLOR_PRESETS[0])).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('moves focus AND updates config on ArrowRight/ArrowLeft/Home/End', () => {
    const updateConfig = vi.fn();
    render(
      <SurfaceColorSettings
        config={{ cardColor: SURFACE_COLOR_PRESETS[0] } as Cfg}
        updateConfig={updateConfig}
      />
    );

    const first = swatchFor(SURFACE_COLOR_PRESETS[0]);
    const second = swatchFor(SURFACE_COLOR_PRESETS[1]);
    const last = swatchFor(
      SURFACE_COLOR_PRESETS[SURFACE_COLOR_PRESETS.length - 1]
    );

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({
      cardColor: SURFACE_COLOR_PRESETS[1],
    });

    fireEvent.keyDown(second, { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({
      cardColor: SURFACE_COLOR_PRESETS[0],
    });

    fireEvent.keyDown(first, { key: 'End' });
    expect(last).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({
      cardColor: SURFACE_COLOR_PRESETS[SURFACE_COLOR_PRESETS.length - 1],
    });

    fireEvent.keyDown(last, { key: 'Home' });
    expect(first).toHaveFocus();
    expect(updateConfig).toHaveBeenLastCalledWith({
      cardColor: SURFACE_COLOR_PRESETS[0],
    });
  });

  it('keeps exactly one swatch tabbable when cardColor defaults (unset)', () => {
    render(<SurfaceColorSettings config={{} as Cfg} updateConfig={vi.fn()} />);

    const swatches = SURFACE_COLOR_PRESETS.map((c) => swatchFor(c));
    const tabbable = swatches.filter(
      (el) => el.getAttribute('tabindex') === '0'
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(swatches[0]);
  });

  it('keeps exactly one swatch tabbable when cardColor is a custom (non-preset) value', () => {
    render(
      <SurfaceColorSettings
        config={{ cardColor: '#123456' } as Cfg}
        updateConfig={vi.fn()}
      />
    );

    const swatches = SURFACE_COLOR_PRESETS.map((c) => swatchFor(c));
    const tabbable = swatches.filter(
      (el) => el.getAttribute('tabindex') === '0'
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(swatches[0]);
  });
});
