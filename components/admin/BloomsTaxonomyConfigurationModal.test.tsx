import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BloomsTaxonomyConfigurationModal } from './BloomsTaxonomyConfigurationModal';
import type { Building } from '@/config/buildings';
import type { FeaturePermission } from '@/types';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

const basePermission = (config: Record<string, unknown>): FeaturePermission =>
  ({
    widgetType: 'blooms-taxonomy',
    accessLevel: 'public',
    betaUsers: [],
    enabled: true,
    config,
  }) as unknown as FeaturePermission;

describe('BloomsTaxonomyConfigurationModal', () => {
  afterEach(() => {
    cleanup();
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

    render(
      <BloomsTaxonomyConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={basePermission({
          buildingDefaults: {
            schumann: { aiEnabled: true },
          },
        })}
        onSave={vi.fn()}
      />
    );

    // If the lookup missed (raw-id bug), the checkbox would fall back to the
    // default (unchecked) instead of the saved enabled state.
    expect(
      screen.getByRole('checkbox', { name: /Enable AI content generation/ })
    ).toBeChecked();
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
      <BloomsTaxonomyConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={basePermission({ buildingDefaults: {} })}
        onSave={onSave}
      />
    );

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Enable AI content generation/ })
    );
    fireEvent.click(screen.getByText('Save Configuration'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const config = onSave.mock.calls[0][0]?.config as unknown as {
      buildingDefaults: Record<string, { aiEnabled?: boolean }>;
    };
    expect(config.buildingDefaults['schumann']?.aiEnabled).toBe(true);
    expect(config.buildingDefaults['schumann-elementary']).toBeUndefined();
  });
});
