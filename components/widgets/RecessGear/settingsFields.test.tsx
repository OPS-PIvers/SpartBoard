import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboard } from '@/context/useDashboard';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { RecessGearConfig, WidgetData } from '@/types';
import { RecessWeatherSourceField } from './settingsFields';

vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));

const mockedUseDashboard = vi.mocked(useDashboard);

const widget = {
  id: 'recess-test-1',
  type: 'recessGear',
} as unknown as WidgetData;

const makeCtx = (
  config: RecessGearConfig,
  updateConfig: (patch: Record<string, unknown>) => void
) =>
  ({
    config,
    widget,
    isAdmin: false,
    canAccessFeature: vi.fn(() => true),
    canAccessWidget: vi.fn(() => true),
    toolLabel: vi.fn((type: string) => type),
    t: (key: string, options?: Record<string, unknown>) => {
      const leaf = key.split('.').pop() ?? key;
      if (leaf === 'autoSelect') return 'Auto-select (first available)';
      if (leaf === 'weatherAt') {
        return 'Weather at ' + String(options?.location);
      }
      if (leaf === 'classroom') return 'Classroom';
      return leaf;
    },
    surface: 'drawer',
    updateConfig,
    id: 'recess-field',
    labelId: 'recess-field-label',
    describedBy: undefined,
  }) as unknown as CustomRenderCtx;

describe('Recess Gear settings drawer field', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the selected Weather source without rewriting unrelated config', () => {
    mockedUseDashboard.mockReturnValue({
      activeDashboard: {
        widgets: [
          {
            id: 'weather-1',
            type: 'weather',
            config: { locationName: 'Room 101' },
          },
          {
            id: 'weather-2',
            type: 'weather',
            config: { locationName: 'Gym' },
          },
        ],
      },
    } as unknown as ReturnType<typeof useDashboard>);
    const updateConfig = vi.fn();
    const ctx = makeCtx(
      {
        linkedWeatherWidgetId: 'weather-1',
        useFeelsLike: false,
      },
      updateConfig
    );
    render(React.createElement(RecessWeatherSourceField, { ctx }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'weather-2' },
    });
    expect(updateConfig).toHaveBeenCalledWith({
      linkedWeatherWidgetId: 'weather-2',
    });
  });
});
