import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkSymbolsConfigurationPanel } from './WorkSymbolsConfigurationPanel';
import { WorkSymbolsGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('WorkSymbolsConfigurationPanel', () => {
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

    const config: WorkSymbolsGlobalConfig = {
      symbols: [],
      buildingDefaults: {
        schumann: { buildingId: 'schumann', textSizePreset: 'x-large' },
      },
    };

    render(
      <WorkSymbolsConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the select would fall back to the
    // default 'medium' instead of the saved 'x-large'.
    expect(screen.getByDisplayValue('Extra Large')).toBeInTheDocument();
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

    const config: WorkSymbolsGlobalConfig = {
      symbols: [],
      buildingDefaults: {},
    };

    render(
      <WorkSymbolsConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.change(screen.getByDisplayValue('Medium'), {
      target: { value: 'large' },
    });

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as WorkSymbolsGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.textSizePreset).toBe('large');
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
