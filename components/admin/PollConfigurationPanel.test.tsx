import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollConfigurationPanel } from './PollConfigurationPanel';
import { PollGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('PollConfigurationPanel', () => {
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

    const config: PollGlobalConfig = {
      buildingDefaults: {
        schumann: {
          buildingId: 'schumann',
          question: 'Saved question?',
          options: [{ id: 'opt-1', label: 'Option A', votes: 0 }],
        },
      },
    };

    render(<PollConfigurationPanel config={config} onChange={mockOnChange} />);

    // If the lookup missed (raw-id bug), it would fall back to the default
    // question instead of the saved one.
    expect(screen.getByDisplayValue('Saved question?')).toBeInTheDocument();
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

    const config: PollGlobalConfig = { buildingDefaults: {} };

    render(<PollConfigurationPanel config={config} onChange={mockOnChange} />);

    fireEvent.change(screen.getByPlaceholderText('Enter default question...'), {
      target: { value: 'New question?' },
    });

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as PollGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.question).toBe('New question?');
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
