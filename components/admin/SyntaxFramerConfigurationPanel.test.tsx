import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyntaxFramerConfigurationPanel } from './SyntaxFramerConfigurationPanel';
import { SyntaxFramerGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('SyntaxFramerConfigurationPanel', () => {
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

    const config: SyntaxFramerGlobalConfig = {
      buildingDefaults: {
        schumann: { buildingId: 'schumann', mode: 'math', alignment: 'left' },
      },
    };

    render(
      <SyntaxFramerConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the Math mode button would not be
    // highlighted as selected.
    const mathButton = screen.getByRole('button', { name: /Math/ });
    expect(mathButton.className).toContain('bg-blue-50');
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

    const config: SyntaxFramerGlobalConfig = { buildingDefaults: {} };

    render(
      <SyntaxFramerConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Math/ }));

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as SyntaxFramerGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.mode).toBe('math');
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });
});
