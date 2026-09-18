import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockDefaultsPanel } from './DockDefaultsPanel';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('DockDefaultsPanel', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds a dockDefaults entry keyed by the canonical id when the org building record resolves to a legacy raw id', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    render(
      <DockDefaultsPanel
        config={{ dockDefaults: { schumann: true } }}
        onChange={mockOnChange}
      />
    );

    // If the lookup missed (raw-id bug), the toggle would render off instead
    // of reflecting the saved on-by-default state.
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('saves dockDefaults under the canonical building id, not the legacy raw id', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    render(
      <DockDefaultsPanel
        config={{ dockDefaults: {} }}
        onChange={mockOnChange}
      />
    );

    fireEvent.click(screen.getByRole('switch'));

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as Record<string, boolean>;
    expect(updated.schumann).toBe(true);
    expect(updated['schumann-elementary']).toBeUndefined();
  });
});
