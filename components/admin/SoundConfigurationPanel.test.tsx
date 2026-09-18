import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoundConfigurationPanel } from './SoundConfigurationPanel';
import { SoundGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('SoundConfigurationPanel', () => {
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

    const config: SoundGlobalConfig = {
      buildingDefaults: {
        schumann: { buildingId: 'schumann', sensitivity: 2.5 },
      },
    };

    render(<SoundConfigurationPanel config={config} onChange={mockOnChange} />);

    // If the lookup missed (raw-id bug), it would fall back to the default
    // sensitivity of 1.0x instead of the saved 2.5x.
    expect(screen.getByText('Default Sensitivity (2.5x)')).toBeInTheDocument();
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

    const config: SoundGlobalConfig = { buildingDefaults: {} };

    render(<SoundConfigurationPanel config={config} onChange={mockOnChange} />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '2.0' } });

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as SoundGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.sensitivity).toBe(2.0);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
