import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HotspotImageConfigurationPanel } from './HotspotImageConfigurationPanel';
import { HotspotImageGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('HotspotImageConfigurationPanel', () => {
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

    const config: HotspotImageGlobalConfig = {
      buildingDefaults: {
        schumann: { buildingId: 'schumann', popoverTheme: 'dark' },
      },
    };

    render(
      <HotspotImageConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the theme would fall back to the
    // default 'light' instead of the saved 'dark'.
    const darkButton = screen.getByRole('button', { name: 'Dark' });
    expect(darkButton.className).toContain('bg-brand-blue-primary');
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

    const config: HotspotImageGlobalConfig = { buildingDefaults: {} };

    render(
      <HotspotImageConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Glass' }));

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as HotspotImageGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.popoverTheme).toBe('glass');
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
