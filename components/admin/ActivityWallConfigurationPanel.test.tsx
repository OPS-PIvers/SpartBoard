import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityWallConfigurationPanel } from './ActivityWallConfigurationPanel';
import { ActivityWallGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// useAdminBuildings() can return a legacy long-form id — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('ActivityWallConfigurationPanel', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a buildingDefaults entry keyed by the canonical id when the org building record resolves to a legacy raw id', () => {
    // Saved config is canonically keyed ('schumann'); the org's building doc resolves to the legacy id.
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    const config: ActivityWallGlobalConfig = {
      buildingDefaults: {
        schumann: {
          defaultMode: 'text',
          defaultIdentificationMode: 'anonymous',
          defaultModerationEnabled: false,
          defaultMaxPostsPerStudent: 7,
        },
      },
    };

    render(
      <ActivityWallConfigurationPanel
        config={config as unknown as Record<string, unknown>}
        onChange={mockOnChange}
      />
    );

    // A raw-id lookup miss would fall back to the widget default of 0, not the saved 7.
    expect(screen.getByLabelText('Default Max Posts Per Student')).toHaveValue(
      7
    );
  });

  it('keeps a cleared max-posts box empty instead of snapping to 0', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);
    const config: ActivityWallGlobalConfig = {
      buildingDefaults: {
        'schumann-elementary': { defaultMaxPostsPerStudent: 7 },
      },
    };
    render(
      <ActivityWallConfigurationPanel
        config={config as unknown as Record<string, unknown>}
        onChange={mockOnChange}
      />
    );
    const input = screen.getByLabelText('Default Max Posts Per Student');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(null);
    expect(mockOnChange).not.toHaveBeenCalled();
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

    const config: ActivityWallGlobalConfig = { buildingDefaults: {} };

    render(
      <ActivityWallConfigurationPanel
        config={config as unknown as Record<string, unknown>}
        onChange={mockOnChange}
      />
    );

    fireEvent.click(screen.getByText('Show Student Names by Default'));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const updated = mockOnChange.mock
      .calls[0][0] as unknown as ActivityWallGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.defaultShowNames).toBe(true);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
