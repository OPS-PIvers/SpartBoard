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
            schumann: { availableCategories: ['questionStems'] },
          },
        })}
        onSave={vi.fn()}
      />
    );

    // If the lookup missed (raw-id bug), every category would fall back to the default (checked).
    expect(
      screen.getAllByRole('checkbox', { name: /Action Verbs/ })[0]
    ).not.toBeChecked();
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
      screen.getAllByRole('checkbox', { name: /Action Verbs/ })[0]
    );
    fireEvent.click(screen.getByText('Save Configuration'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const config = onSave.mock.calls[0][0]?.config as unknown as {
      buildingDefaults: Record<string, { availableCategories?: string[] }>;
    };
    expect(
      config.buildingDefaults['schumann']?.availableCategories
    ).not.toContain('actionVerbs');
    expect(config.buildingDefaults['schumann-elementary']).toBeUndefined();
  });
});
