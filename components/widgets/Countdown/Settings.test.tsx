import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CountdownAppearanceSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { CountdownConfig, WidgetData } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const mockedUseDashboard = vi.mocked(useDashboard);

const makeWidget = (config: Partial<CountdownConfig> = {}): WidgetData =>
  ({
    id: 'countdown-test-1',
    type: 'countdown',
    x: 0,
    y: 0,
    w: 300,
    h: 250,
    z: 1,
    flipped: true,
    config: {
      title: 'Field Trip',
      startDate: '2026-04-03T12:00:00.000Z',
      eventDate: '2026-04-06T12:00:00.000Z',
      includeWeekends: true,
      countToday: true,
      viewMode: 'number',
      ...config,
    } satisfies CountdownConfig,
  }) as WidgetData;

describe('CountdownAppearanceSettings — event color radiogroup', () => {
  beforeEach(() => {
    mockedUseDashboard.mockReturnValue({
      updateWidget: vi.fn(),
    } as unknown as ReturnType<typeof useDashboard>);
  });

  const eventColorGroup = () =>
    within(screen.getByRole('radiogroup', { name: 'Event Title Color' }));

  it('keeps exactly one swatch tabbable when a preset color is selected', () => {
    render(<CountdownAppearanceSettings widget={makeWidget()} />);

    const radios = eventColorGroup().getAllByRole('radio');
    const tabbable = radios.filter((r) => r.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('falls back to the first swatch as tabbable when eventColor is a custom color outside the presets', () => {
    render(
      <CountdownAppearanceSettings
        widget={makeWidget({ eventColor: '#123456' })}
      />
    );

    const radios = eventColorGroup().getAllByRole('radio');
    // No swatch is checked for a custom color, but exactly one must stay
    // reachable by keyboard — a real regression this test guards against.
    expect(
      radios.every((r) => r.getAttribute('aria-checked') === 'false')
    ).toBe(true);
    const tabbable = radios.filter((r) => r.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(radios[0]);
  });
});
