import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QRConfigurationPanel } from './QRConfigurationPanel';
import { QRGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// The panel reads its building list from useAdminBuildings(), which for a
// real org can hand back a legacy long-form building doc id (e.g.
// `schumann-elementary`) when that org's building record predates the
// short-id migration — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('QRConfigurationPanel', () => {
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

    const config: QRGlobalConfig = {
      buildingDefaults: {
        schumann: {
          buildingId: 'schumann',
          defaultUrl: 'https://schumann.example.com',
        },
      },
    };

    render(<QRConfigurationPanel config={config} onChange={mockOnChange} />);

    // If the lookup missed (raw-id bug), the input would fall back to the
    // empty default instead of the saved URL.
    expect(
      screen.getByDisplayValue('https://schumann.example.com')
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

    const config: QRGlobalConfig = { buildingDefaults: {} };

    render(<QRConfigurationPanel config={config} onChange={mockOnChange} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. https://google.com'), {
      target: { value: 'https://new-url.example.com' },
    });

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as QRGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.defaultUrl).toBe(
      'https://new-url.example.com'
    );
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
