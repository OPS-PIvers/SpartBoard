// Regression test: useAdminBuildings() can hand back a legacy long-form
// building doc id (e.g. `schumann-elementary`) when an org's building
// record predates the short-id migration — see config/buildings.ts's
// BUILDING_ID_ALIASES. Building-defaults reads/writes must key off the
// canonical id or a saved default becomes invisible on read and a new
// save silently writes under the wrong key.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { TalkingToolGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

import { TalkingToolConfigurationPanel } from '@/components/admin/TalkingToolConfigurationPanel';

afterEach(cleanup);

describe('TalkingToolConfigurationPanel — legacy building id canonicalization', () => {
  it('finds a buildingDefaults entry keyed by the canonical id when the org building record resolves to a legacy raw id', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    const config: TalkingToolGlobalConfig = {
      buildingDefaults: {
        schumann: { buildingId: 'schumann', cardColor: '#abcdef' },
      },
    };

    render(
      <TalkingToolConfigurationPanel config={config} onChange={vi.fn()} />
    );

    // If the lookup missed (raw-id bug), the colour field would show the
    // fallback ('#ffffff') instead of the saved value.
    expect(
      screen.getByLabelText('Pick default Talking Tool surface colour')
    ).toHaveValue('#abcdef');
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

    const onChange = vi.fn<(config: TalkingToolGlobalConfig) => void>();
    const config: TalkingToolGlobalConfig = { buildingDefaults: {} };

    render(
      <TalkingToolConfigurationPanel config={config} onChange={onChange} />
    );

    fireEvent.change(
      screen.getByLabelText('Pick default Talking Tool surface colour'),
      { target: { value: '#123456' } }
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0];
    expect(updated.buildingDefaults?.schumann?.cardColor).toBe('#123456');
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
