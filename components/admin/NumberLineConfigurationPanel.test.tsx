import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NumberLineConfigurationPanel } from './NumberLineConfigurationPanel';
import { NumberLineGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('NumberLineConfigurationPanel', () => {
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

    const config: NumberLineGlobalConfig = {
      buildingDefaults: {
        schumann: {
          min: -20,
          max: 20,
          step: 1,
          displayMode: 'integers',
          showArrows: true,
        },
      },
    };

    render(
      <NumberLineConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), min would fall back to the default
    // of 0 instead of the saved -20.
    expect(screen.getByDisplayValue('-20')).toBeInTheDocument();
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

    const config: NumberLineGlobalConfig = { buildingDefaults: {} };

    render(
      <NumberLineConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // "Default Minimum Value" renders the first spinbutton in the DOM.
    fireEvent.change(screen.getAllByRole('spinbutton')[0], {
      target: { value: '-5' },
    });

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as NumberLineGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.min).toBe(-5);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
