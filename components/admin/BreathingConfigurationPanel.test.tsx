import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BreathingConfigurationPanel } from './BreathingConfigurationPanel';
import { BreathingGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// The panel reads its building list from useAdminBuildings(), which for a
// real org can hand back a legacy long-form building doc id (e.g.
// `schumann-elementary`) when that org's building record predates the
// short-id migration — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('BreathingConfigurationPanel', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a buildingDefaults entry keyed by the canonical id when the org building record resolves to a legacy raw id', () => {
    // Saved config is canonically keyed ('schumann'), but this org's
    // building doc still resolves to the legacy long-form id.
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    const config: BreathingGlobalConfig = {
      buildingDefaults: {
        schumann: {
          buildingId: 'schumann',
          pattern: '4-7-8',
        },
      },
    };

    render(
      <BreathingConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), no pattern button would be selected
    // and the "Relaxing Breath" default would not show as active.
    expect(screen.getByText('Relaxing Breath')).toHaveClass(
      'bg-brand-blue-primary'
    );
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

    const config: BreathingGlobalConfig = { buildingDefaults: {} };

    render(
      <BreathingConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.click(screen.getByText('Box Breathing'));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const updated = mockOnChange.mock.calls[0][0] as BreathingGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.pattern).toBe('4-4-4-4');
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
