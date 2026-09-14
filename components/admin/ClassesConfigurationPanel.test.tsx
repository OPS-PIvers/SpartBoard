import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassesConfigurationPanel } from './ClassesConfigurationPanel';
import { ClassesGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// useAdminBuildings() can return a legacy long-form id — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('ClassesConfigurationPanel', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a buildingDefaults entry keyed by the canonical id when the org building record resolves to a legacy raw id', () => {
    // Saved config is keyed canonically ('schumann') but the building doc still resolves to the legacy long-form id.
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    const config: ClassesGlobalConfig = {
      buildingDefaults: {
        schumann: {
          buildingId: 'schumann',
          classLinkEnabled: false,
        },
      },
    };

    render(
      <ClassesConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the toggle would fall back to the default (checked) instead of the saved 'off' value.
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('saves building defaults under the canonical building id, not the legacy raw id', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    const config: ClassesGlobalConfig = { buildingDefaults: {} };

    render(
      <ClassesConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.click(screen.getByRole('switch'));

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as ClassesGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.classLinkEnabled).toBe(false);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
