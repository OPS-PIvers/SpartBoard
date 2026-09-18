import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeatingChartConfigurationPanel } from './SeatingChartConfigurationPanel';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('SeatingChartConfigurationPanel', () => {
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

    const config = {
      buildingDefaults: {
        schumann: { buildingId: 'schumann', rosterMode: 'custom' },
      },
    };

    render(
      <SeatingChartConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the select would fall back to the
    // default 'class' instead of the saved 'custom'.
    expect(screen.getByDisplayValue('Custom Roster')).toBeInTheDocument();
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

    const config = { buildingDefaults: {} };

    render(
      <SeatingChartConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.change(screen.getByDisplayValue('ClassLink Roster'), {
      target: { value: 'custom' },
    });

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as {
      buildingDefaults: Record<string, { rosterMode?: string }>;
    };
    expect(updated.buildingDefaults?.schumann?.rosterMode).toBe('custom');
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
