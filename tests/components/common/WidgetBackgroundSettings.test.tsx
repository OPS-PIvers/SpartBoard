import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WidgetBackgroundSettings } from '@/components/common/UniversalStyleSettings';
import { resolveWindowBackgroundHex } from '@/config/widgetAppearance';
import type { WidgetData } from '@/types';

const makeWidget = (backgroundColor?: string): WidgetData =>
  ({
    id: 'w1',
    type: 'clock',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    config: {},
    backgroundColor,
  }) as unknown as WidgetData;

describe('WidgetBackgroundSettings', () => {
  it('checks Default when no frame color is set', () => {
    render(
      <WidgetBackgroundSettings widget={makeWidget()} updateWidget={vi.fn()} />
    );
    expect(screen.getByRole('radio', { name: 'Default' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('stores a hex, not a Tailwind class, when a preset is picked', () => {
    const updateWidget = vi.fn();
    render(
      <WidgetBackgroundSettings
        widget={makeWidget()}
        updateWidget={updateWidget}
      />
    );
    fireEvent.click(
      screen.getByRole('radio', { name: 'Select background color White' })
    );
    expect(updateWidget).toHaveBeenCalledWith('w1', {
      backgroundColor: '#ffffff',
    });
  });

  it('resolves a legacy class value onto the matching preset', () => {
    render(
      <WidgetBackgroundSettings
        widget={makeWidget('bg-white')}
        updateWidget={vi.fn()}
      />
    );
    expect(
      screen.getByRole('radio', { name: 'Select background color White' })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('clears the frame color from the Default swatch', () => {
    const updateWidget = vi.fn();
    render(
      <WidgetBackgroundSettings
        widget={makeWidget('#0f172a')}
        updateWidget={updateWidget}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Default' }));
    expect(updateWidget).toHaveBeenCalledWith('w1', {
      backgroundColor: undefined,
    });
  });
});

describe('resolveWindowBackgroundHex', () => {
  it('maps legacy classes, passes hex through, and ignores empty values', () => {
    expect(resolveWindowBackgroundHex('bg-emerald-50')).toBe('#ecfdf5');
    expect(resolveWindowBackgroundHex('#ABCDEF')).toBe('#ABCDEF');
    expect(resolveWindowBackgroundHex('#abc')).toBe('#abc');
    expect(resolveWindowBackgroundHex(undefined)).toBeUndefined();
    expect(resolveWindowBackgroundHex('')).toBeUndefined();
    expect(resolveWindowBackgroundHex('bg-nope')).toBeUndefined();
  });
});
