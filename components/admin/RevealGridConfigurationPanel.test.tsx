import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RevealGridConfigurationPanel } from './RevealGridConfigurationPanel';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('RevealGridConfigurationPanel', () => {
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

    const config = {
      buildingDefaults: {
        schumann: { buildingId: 'schumann', columns: 5 },
      },
    };

    render(
      <RevealGridConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the "3" columns button would be
    // highlighted (default) instead of "5".
    const fiveButton = screen.getByRole('button', { name: '5' });
    expect(fiveButton.className).toContain('bg-brand-blue-primary');
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

    const config = { buildingDefaults: {} };

    render(
      <RevealGridConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: '4' }));

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as {
      buildingDefaults: Record<string, { columns?: number }>;
    };
    expect(updated.buildingDefaults?.schumann?.columns).toBe(4);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
