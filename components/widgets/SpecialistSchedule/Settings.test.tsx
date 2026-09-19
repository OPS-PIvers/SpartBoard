import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { WidgetData } from '@/types';
import { SpecialistScheduleCycleDaysField } from './settingsFields';

vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: vi.fn(),
}));

const BUILDING_ID = 'schumann-elementary';
const updateConfig = vi.fn();
const labels: Record<string, string> = {
  addItem: 'Add item',
  activity: 'Activity name',
};
const baseWidget: WidgetData = {
  id: 'specialist-test-1',
  type: 'specialist-schedule',
  x: 0,
  y: 0,
  w: 600,
  h: 400,
  z: 1,
  flipped: true,
  config: { cycleDays: [] },
};

const makeCtx = (): CustomRenderCtx => ({
  config: baseWidget.config as unknown as Record<string, unknown>,
  widget: baseWidget,
  isAdmin: false,
  canAccessFeature: () => true,
  t: (key) => labels[key.split('.').pop() ?? key] ?? key,
  updateConfig,
  id: 'specialist-cycle-days',
  labelId: 'specialist-cycle-days-label',
});

describe('SpecialistScheduleCycleDaysField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWidgetBuildingId).mockReturnValue(BUILDING_ID);
    vi.mocked(useAuth).mockReturnValue({
      featurePermissions: [
        {
          widgetType: 'specialist-schedule',
          config: {
            buildingDefaults: {
              [BUILDING_ID]: {
                cycleLength: 6,
                specialistOptions: ['🎵 Music', '👟 PE'],
              },
            },
          },
        },
      ],
    } as never);
  });

  it('keeps configured specialist choices as an accessible radio group', () => {
    render(<SpecialistScheduleCycleDaysField ctx={makeCtx()} />);
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));

    const music = screen.getByRole('radio', { name: '🎵 Music' });
    const pe = screen.getByRole('radio', { name: '👟 PE' });
    expect(music).toHaveAttribute('aria-checked', 'false');
    expect(pe).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(music);
    expect(music).toHaveAttribute('aria-checked', 'true');
    expect(pe).toHaveAttribute('aria-checked', 'false');
  });

  it('does not render an empty specialist-options radio group', () => {
    vi.mocked(useAuth).mockReturnValue({
      featurePermissions: [
        {
          widgetType: 'specialist-schedule',
          config: {
            buildingDefaults: {
              [BUILDING_ID]: { cycleLength: 6, specialistOptions: [] },
            },
          },
        },
      ],
    } as never);

    render(<SpecialistScheduleCycleDaysField ctx={makeCtx()} />);
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/activity/i)).toBeInTheDocument();
  });
});
