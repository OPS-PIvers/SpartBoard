import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecialistScheduleSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { WidgetData, FeaturePermission } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: vi.fn(),
}));
vi.mock('@/components/common/TypographySettings', () => ({
  TypographySettings: () => null,
}));
vi.mock('@/components/common/SurfaceColorSettings', () => ({
  SurfaceColorSettings: () => null,
}));
vi.mock('@/components/common/TextSizePresetSettings', () => ({
  TextSizePresetSettings: () => null,
}));

const mockUpdateWidget = vi.fn();
const BUILDING_ID = 'schumann-elementary';

const baseWidget: WidgetData = {
  id: 'specialist-test-1',
  type: 'specialist-schedule',
  x: 0,
  y: 0,
  w: 600,
  h: 400,
  z: 1,
  flipped: true,
  config: {
    cycleDays: [],
  },
};

function permissionWithOptions(
  specialistOptions: string[]
): FeaturePermission[] {
  return [
    {
      widgetType: 'specialist-schedule',
      accessLevel: 'public',
      betaUsers: [],
      enabled: true,
      config: {
        buildingDefaults: {
          [BUILDING_ID]: {
            cycleLength: 6,
            startDate: '2026-08-01',
            schoolDays: [],
            specialistOptions,
          },
        },
      },
    } as unknown as FeaturePermission,
  ];
}

describe('SpecialistScheduleSettings — Activity Name radiogroup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: mockUpdateWidget,
    });
    (
      useWidgetBuildingId as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue(BUILDING_ID);
  });

  function openAddItemForm() {
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
  }

  it('renders a radio per configured specialist option and marks the selected one checked', () => {
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: permissionWithOptions(['🎵 Music', '👟 PE']),
    });

    render(<SpecialistScheduleSettings widget={baseWidget} />);
    openAddItemForm();

    const musicOption = screen.getByRole('radio', { name: '🎵 Music' });
    const peOption = screen.getByRole('radio', { name: '👟 PE' });
    expect(musicOption).toHaveAttribute('aria-checked', 'false');
    expect(peOption).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(musicOption);
    expect(musicOption).toHaveAttribute('aria-checked', 'true');
    expect(peOption).toHaveAttribute('aria-checked', 'false');
  });

  it('omits the radiogroup entirely when no specialist options are configured', () => {
    // Regression: an empty role="radiogroup" (rendered when
    // specialistOptions defaults to []) is invalid ARIA and a landmark that
    // leads nowhere — the group must be omitted, not rendered empty.
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: permissionWithOptions([]),
    });

    render(<SpecialistScheduleSettings widget={baseWidget} />);
    openAddItemForm();

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    // The free-text input must still be present and usable on its own.
    expect(
      screen.getByRole('textbox', { name: /custom activity name/i })
    ).toBeInTheDocument();
  });
});
