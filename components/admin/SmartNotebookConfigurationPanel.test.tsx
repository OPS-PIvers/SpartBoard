import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmartNotebookConfigurationPanel } from './SmartNotebookConfigurationPanel';
import { SmartNotebookGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('SmartNotebookConfigurationPanel', () => {
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

    const config: SmartNotebookGlobalConfig = {
      buildingDefaults: {
        schumann: { buildingId: 'schumann', storageLimitMb: 200 },
      },
    };

    render(
      <SmartNotebookConfigurationPanel
        config={config}
        onChange={mockOnChange}
      />
    );

    // If the lookup missed (raw-id bug), the input would fall back to the
    // default 50 instead of the saved 200.
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();
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

    const config: SmartNotebookGlobalConfig = { buildingDefaults: {} };

    render(
      <SmartNotebookConfigurationPanel
        config={config}
        onChange={mockOnChange}
      />
    );

    fireEvent.change(screen.getByDisplayValue('50'), {
      target: { value: '100' },
    });

    expect(mockOnChange).toHaveBeenCalled();
    const updated = mockOnChange.mock.calls[0][0] as SmartNotebookGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.storageLimitMb).toBe(100);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });

  it('keeps the storage limit field empty while typing instead of snapping back to 50', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'schumann',
        name: 'Schumann',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);
    const Harness = () => {
      const [cfg, setCfg] = React.useState<SmartNotebookGlobalConfig>({
        buildingDefaults: {
          schumann: { buildingId: 'schumann', storageLimitMb: 50 },
        },
      });
      return <SmartNotebookConfigurationPanel config={cfg} onChange={setCfg} />;
    };
    render(<Harness />);
    const input = screen.getByDisplayValue<HTMLInputElement>('50');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.change(input, { target: { value: '30' } });
    expect(input.value).toBe('30');
  });
});
