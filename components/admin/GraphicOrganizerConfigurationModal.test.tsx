import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GraphicOrganizerConfigurationModal } from './GraphicOrganizerConfigurationModal';
import type { Building } from '@/config/buildings';
import type { FeaturePermission } from '@/types';

// The panel reads its building list from useAdminBuildings(), which for a
// real org can hand back a legacy long-form building doc id (e.g.
// `orono-high-school`) when that org's building record predates the
// short-id migration — see components/auth/NewUserSetup.tsx's canonicalize
// workaround for the same hook.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

const basePermission = (config: Record<string, unknown>): FeaturePermission =>
  ({
    widgetType: 'graphic-organizer',
    accessLevel: 'public',
    betaUsers: [],
    enabled: true,
    config,
  }) as unknown as FeaturePermission;

describe('GraphicOrganizerConfigurationModal', () => {
  afterEach(() => {
    cleanup();
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

    render(
      <GraphicOrganizerConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={basePermission({
          buildings: {},
          buildingDefaults: {
            schumann: { buildingId: 'schumann', cardOpacity: 0.5 },
          },
        })}
        onSave={vi.fn()}
      />
    );

    // If the lookup missed (raw-id bug), it would fall back to the
    // default opacity of 1 (100%) instead of the saved 50%.
    expect(
      screen.getByText('Default Surface Opacity (50%)')
    ).toBeInTheDocument();
  });

  it('saves building defaults under the canonical building id, not the legacy raw id', () => {
    const onSave = vi.fn<(updates: Partial<FeaturePermission>) => void>();
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    render(
      <GraphicOrganizerConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={basePermission({ buildings: {}, buildingDefaults: {} })}
        onSave={onSave}
      />
    );

    fireEvent.change(
      screen.getByLabelText('Default Graphic Organizer surface opacity'),
      { target: { value: '0.75' } }
    );
    fireEvent.click(screen.getByText('Apply Configuration'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const config = onSave.mock.calls[0][0]?.config as unknown as {
      buildingDefaults: Record<string, { cardOpacity?: number }>;
    };
    expect(config.buildingDefaults['schumann']?.cardOpacity).toBe(0.75);
    expect(config.buildingDefaults['schumann-elementary']).toBeUndefined();
  });
});
