// Regression test: useAdminBuildings() can hand back a legacy long-form
// building doc id (e.g. `orono-high-school`) when an org's building record
// predates the short-id migration — see config/buildings.ts's
// BUILDING_ID_ALIASES. Building-defaults reads/writes must key off the
// canonical id or a saved default becomes invisible on read and a new
// save silently writes under the wrong key.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { NoteGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

import { NoteConfigurationPanel } from '@/components/admin/NoteConfigurationPanel';

afterEach(cleanup);

describe('NoteConfigurationPanel — legacy building id canonicalization', () => {
  it('finds a buildingDefaults entry keyed by the canonical id when the org building record resolves to a legacy raw id', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'orono-high-school',
        name: 'Orono High School',
        gradeLevels: ['9-12'],
        gradeLabel: '9-12',
      },
    ]);

    const config: NoteGlobalConfig = {
      buildingDefaults: {
        high: { buildingId: 'high', fontSize: 32 },
      },
    };

    render(<NoteConfigurationPanel config={config} onChange={vi.fn()} />);

    // If the lookup missed (raw-id bug), the panel would fall back to the
    // default font size (18/Medium) instead of the saved 32/X-Large.
    const xLargeButton = screen.getByRole('button', { name: /X-Large/ });
    expect(xLargeButton.className).toContain('bg-brand-blue-primary');
  });

  it('saves building defaults under the canonical building id, not the legacy raw id', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'orono-high-school',
        name: 'Orono High School',
        gradeLevels: ['9-12'],
        gradeLabel: '9-12',
      },
    ]);

    const onChange = vi.fn<(config: NoteGlobalConfig) => void>();
    const config: NoteGlobalConfig = { buildingDefaults: {} };

    render(<NoteConfigurationPanel config={config} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Small/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0];
    expect(updated.buildingDefaults?.high?.fontSize).toBe(14);
    expect(updated.buildingDefaults?.['orono-high-school']).toBeUndefined();
  });
});
