import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChecklistConfigurationPanel } from './ChecklistConfigurationPanel';
import { ChecklistGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// The panel reads its building list from useAdminBuildings(), which for a
// real org can hand back a legacy long-form building doc id (e.g.
// `schumann-elementary`) when that org's building record predates the
// short-id migration — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('ChecklistConfigurationPanel', () => {
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

    const config: ChecklistGlobalConfig = {
      buildingDefaults: {
        schumann: {
          buildingId: 'schumann',
          items: [{ id: 'item-1', text: 'Pencils sharpened' }],
        },
      },
    };

    render(
      <ChecklistConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the saved item would not render
    // and the empty-state message would show instead.
    expect(screen.getByDisplayValue('Pencils sharpened')).toBeInTheDocument();
    expect(
      screen.queryByText('No default items configured. Add items below.')
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

    const config: ChecklistGlobalConfig = { buildingDefaults: {} };

    render(
      <ChecklistConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.change(screen.getByPlaceholderText('New default item...'), {
      target: { value: 'Chromebook charged' },
    });
    fireEvent.click(screen.getByText('Add'));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const updated = mockOnChange.mock.calls[0][0] as ChecklistGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.items?.[0]?.text).toBe(
      'Chromebook charged'
    );
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
