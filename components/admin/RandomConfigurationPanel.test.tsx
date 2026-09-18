import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RandomConfigurationPanel } from './RandomConfigurationPanel';
import { RandomGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// The panel reads its building list from useAdminBuildings(), which for a
// real org can hand back a legacy long-form building doc id (e.g.
// `schumann-elementary`) when that org's building record predates the
// short-id migration — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('RandomConfigurationPanel', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a buildingDefaults entry keyed by the canonical id when the org building record resolves to a legacy raw id', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    const config: RandomGlobalConfig = {
      buildingDefaults: {
        schumann: { buildingId: 'schumann', soundEnabled: false },
      },
    };

    render(
      <RandomConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the toggle would fall back to the
    // default (sound enabled) instead of the saved disabled state.
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

    const config: RandomGlobalConfig = { buildingDefaults: {} };

    render(
      <RandomConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.click(screen.getByRole('switch'));

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as RandomGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.soundEnabled).toBe(false);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
