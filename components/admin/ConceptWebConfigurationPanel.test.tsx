import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConceptWebConfigurationPanel } from './ConceptWebConfigurationPanel';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('ConceptWebConfigurationPanel', () => {
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
        schumann: { buildingId: 'schumann', defaultNodeWidth: 30 },
      },
    };

    render(
      <ConceptWebConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the width input would fall back to
    // the default of 15 instead of the saved 30.
    const widthInput = screen.getAllByRole('spinbutton')[0];
    expect(widthInput).toHaveValue(30);
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
      <ConceptWebConfigurationPanel config={config} onChange={mockOnChange} />
    );

    const widthInput = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(widthInput, { target: { value: '25' } });

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as {
      buildingDefaults: Record<string, { defaultNodeWidth?: number }>;
    };
    expect(updated.buildingDefaults?.schumann?.defaultNodeWidth).toBe(25);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });

  it('lets an admin type a width below the minimum digit by digit (20 is not turned into 50)', async () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann-elementary',
        name: 'Schumann Elementary',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);
    let latest: Record<string, unknown> = {};
    const Harness = () => {
      const [cfg, setCfg] = useState<Record<string, unknown>>({
        buildingDefaults: {},
      });
      return (
        <ConceptWebConfigurationPanel
          config={cfg}
          onChange={(c) => {
            latest = c;
            setCfg(c);
          }}
        />
      );
    };
    render(<Harness />);
    const widthInput = screen.getAllByRole('spinbutton')[0];
    await userEvent.clear(widthInput);
    await userEvent.type(widthInput, '20');
    expect(widthInput).toHaveValue(20);
    expect(JSON.stringify(latest)).toContain('"defaultNodeWidth":20');
  });
});
