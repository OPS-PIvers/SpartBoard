import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClockConfigurationPanel } from './ClockConfigurationPanel';
import { ClockGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// The panel reads its building list from useAdminBuildings(), which for a
// real org can hand back a legacy long-form building doc id (e.g.
// `schumann-elementary`) when that org's building record predates the
// short-id migration — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('ClockConfigurationPanel', () => {
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

    const config: ClockGlobalConfig = {
      buildingDefaults: {
        schumann: {
          buildingId: 'schumann',
          glow: true,
        },
      },
    };

    render(<ClockConfigurationPanel config={config} onChange={mockOnChange} />);

    // If the lookup missed (raw-id bug), the toggle would fall back to the
    // widget default of off, not the saved value of on. The Glow toggle is
    // the second `role="switch"` control (after 24-Hour Format).
    const glowToggle = screen.getAllByRole('switch')[1];
    expect(glowToggle).toHaveAttribute('aria-checked', 'true');
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

    const config: ClockGlobalConfig = { buildingDefaults: {} };

    render(<ClockConfigurationPanel config={config} onChange={mockOnChange} />);

    fireEvent.click(screen.getAllByRole('switch')[1]);

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const updated = mockOnChange.mock.calls[0][0] as ClockGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.glow).toBe(true);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
