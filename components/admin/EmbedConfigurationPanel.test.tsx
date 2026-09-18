import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbedConfigurationPanel } from './EmbedConfigurationPanel';
import { EmbedGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('EmbedConfigurationPanel', () => {
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

    const config: EmbedGlobalConfig = {
      buildingDefaults: {
        schumann: {
          buildingId: 'schumann',
          hideUrlField: false,
          whitelistUrls: ['example.com'],
        },
      },
    };

    render(<EmbedConfigurationPanel config={config} onChange={mockOnChange} />);

    // If the lookup missed (raw-id bug), the whitelist would render the
    // empty state instead of the saved domain.
    expect(
      screen.queryByText('No custom domains whitelisted yet.')
    ).not.toBeInTheDocument();
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

    const config: EmbedGlobalConfig = { buildingDefaults: {} };

    render(<EmbedConfigurationPanel config={config} onChange={mockOnChange} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. example.com'), {
      target: { value: 'newsite.com' },
    });
    fireEvent.click(screen.getByText('Add Domain'));

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as EmbedGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.whitelistUrls).toContain(
      'newsite.com'
    );
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
