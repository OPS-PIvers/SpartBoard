import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpectationsConfigurationPanel } from './ExpectationsConfigurationPanel';
import { ExpectationsGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('ExpectationsConfigurationPanel', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a `buildings` entry keyed by the canonical id when the org building record resolves to a legacy raw id', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    const config: ExpectationsGlobalConfig = {
      buildings: {
        schumann: {
          volumeOverrides: {},
          groupOverrides: {},
          interactionOverrides: {},
          showVolume: false,
          showGroup: true,
          showInteraction: true,
        },
      },
    };

    render(
      <ExpectationsConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the Volume category toggle would
    // fall back to the default (enabled) instead of the saved disabled state.
    const toggles = screen.getAllByRole('switch');
    expect(toggles[0]).toHaveAttribute('aria-checked', 'false');
  });

  it('saves `buildings` under the canonical building id, not the legacy raw id', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    const config: ExpectationsGlobalConfig = { buildings: {} };

    render(
      <ExpectationsConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.click(screen.getAllByRole('switch')[0]);

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as ExpectationsGlobalConfig;
    expect(updated.buildings?.schumann?.showVolume).toBe(false);
    expect(updated.buildings?.['schumann-elementary']).toBeUndefined();
  });
});
