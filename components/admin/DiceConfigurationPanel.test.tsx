import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiceConfigurationPanel } from './DiceConfigurationPanel';
import { DiceGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// The panel reads its building list from useAdminBuildings(), which for a
// real org can hand back a legacy long-form building doc id (e.g.
// `schumann-elementary`) when that org's building record predates the
// short-id migration — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('DiceConfigurationPanel', () => {
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

    const config: DiceGlobalConfig = {
      buildingDefaults: {
        schumann: {
          buildingId: 'schumann',
          count: 4,
        },
      },
    };

    render(<DiceConfigurationPanel config={config} onChange={mockOnChange} />);

    // If the lookup missed (raw-id bug), the count would fall back to the
    // widget default of 1, not the saved value of 4.
    const fourButton = screen.getByText('4');
    expect(fourButton.className).toContain('bg-brand-blue-primary');
    const oneButton = screen.getByText('1');
    expect(oneButton.className).not.toContain('bg-brand-blue-primary');
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

    const config: DiceGlobalConfig = { buildingDefaults: {} };

    render(<DiceConfigurationPanel config={config} onChange={mockOnChange} />);

    fireEvent.click(screen.getByText('3'));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const updated = mockOnChange.mock.calls[0][0] as DiceGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.count).toBe(3);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
