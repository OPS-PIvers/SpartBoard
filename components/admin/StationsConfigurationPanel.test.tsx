import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StationsConfigurationPanel } from './StationsConfigurationPanel';
import { StationsGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('StationsConfigurationPanel', () => {
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

    const config: StationsGlobalConfig = {
      buildingDefaults: {
        schumann: { buildingId: 'schumann', cardOpacity: 0.5 },
      },
    };

    render(
      <StationsConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), it would fall back to the default
    // opacity of 1 (100%) instead of the saved 50%.
    expect(
      screen.getByText('Default Surface Opacity (50%)')
    ).toBeInTheDocument();
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

    const config: StationsGlobalConfig = { buildingDefaults: {} };

    render(
      <StationsConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.75' } });

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as StationsGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.cardOpacity).toBe(0.75);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
