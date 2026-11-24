import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import type { ClockConfig, GlobalStyle, WidgetData } from '@/types';
import { STANDARD_COLORS } from '@/config/colors';
import schema from './settings.schema';

const config: ClockConfig = {
  format24: true,
  showSeconds: true,
  themeColor: STANDARD_COLORS.slate,
  fontFamily: 'global',
  clockStyle: 'modern',
  glow: false,
  dateColor: undefined,
};

const widget = {
  id: 'w1',
  type: 'clock',
  x: 0,
  y: 0,
  w: 280,
  h: 140,
  z: 1,
  config,
} as WidgetData;

// jsdom has no layout, so axe's color-contrast rule can only report "incomplete"
// (see tests/components/settings/SettingsDrawer.a11y.test.tsx).
const STRUCTURAL_ONLY = { rules: { 'color-contrast': { enabled: false } } };

const renderDrawer = () =>
  render(
    <SettingsDrawer
      widget={widget}
      title="Clock"
      placement="right"
      width={400}
      onWidthCommit={vi.fn()}
      onClose={vi.fn()}
      updateWidget={vi.fn()}
      updateConfig={vi.fn()}
      globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
      schema={schema}
    />
  );

describe('Clock settings schema accessibility', () => {
  it('has no structural axe violations with the schema rendered', async () => {
    const { baseElement } = renderDrawer();
    expect(await axe(baseElement, STRUCTURAL_ONLY)).toHaveNoViolations();
  });

  it('gives every field control an accessible name', () => {
    renderDrawer();
    expect(
      screen.getByRole('switch', { name: '24H Format' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Show Seconds' })
    ).toBeInTheDocument();
    // The display group lives on the Style tab.
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    expect(
      screen.getByRole('radiogroup', { name: 'Date Color' })
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Glow' })).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Display Style' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Color Palette' })
    ).toBeInTheDocument();
  });
});
