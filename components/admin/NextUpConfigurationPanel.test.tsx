import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextUpConfigurationPanel } from './NextUpConfigurationPanel';
import { NextUpGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// The panel reads its building list from useAdminBuildings(), which for a
// real org can hand back a legacy long-form building doc id (e.g.
// `schumann-elementary`) when that org's building record predates the
// short-id migration — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('NextUpConfigurationPanel', () => {
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

    const config: NextUpGlobalConfig = {
      buildingDefaults: {
        schumann: {
          displayCount: 7,
          fontFamily: 'patrick-hand',
          themeColor: '#059669',
        },
      },
    };

    render(
      <NextUpConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the panel would fall back to the
    // default displayCount of 3 instead of the saved value of 7.
    expect(screen.getByText('7 names')).toBeInTheDocument();
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

    const config: NextUpGlobalConfig = { buildingDefaults: {} };

    render(
      <NextUpConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } });

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as NextUpGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.displayCount).toBe(5);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
