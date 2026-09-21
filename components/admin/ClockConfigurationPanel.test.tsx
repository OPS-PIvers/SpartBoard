import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClockConfigurationPanel } from './ClockConfigurationPanel';
import { ClockGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// The panel reads its building list from useAdminBuildings(), which for a
// real org can hand back a legacy long-form building doc id (e.g.
// `schumann-elementary`) when that org's building record predates the
// short-id migration — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

describe('ClockConfigurationPanel', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
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

    const config: ClockGlobalConfig = {
      buildingDefaults: {
        schumann: {
          buildingId: 'schumann',
          glow: true,
        },
      },
    };

    render(<ClockConfigurationPanel config={config} onChange={mockOnChange} />);

    // If the lookup missed (raw-id bug), the toggle would fall back to the
    // widget default of off, not the saved value of on.
    const glowToggle = screen.getByRole('switch', { name: 'Glow Effect' });
    expect(glowToggle).toHaveAttribute('aria-checked', 'true');
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

    const config: ClockGlobalConfig = { buildingDefaults: {} };

    render(<ClockConfigurationPanel config={config} onChange={mockOnChange} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Glow Effect' }));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const updated = mockOnChange.mock.calls[0][0] as ClockGlobalConfig;
    expect(updated.buildingDefaults?.schumann?.glow).toBe(true);
    expect(updated.buildingDefaults?.['schumann-elementary']).toBeUndefined();
  });

  it('marks exactly the selected option as checked and tabbable in the Font Family and Display Style radiogroups', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'b1',
        name: 'Test School',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    const config: ClockGlobalConfig = {
      buildingDefaults: {
        b1: { buildingId: 'b1', fontFamily: 'font-mono', clockStyle: 'lcd' },
      },
    };

    render(<ClockConfigurationPanel config={config} onChange={mockOnChange} />);

    const fontOptions = screen.getAllByRole('radio', {
      name: /Sans-serif|Monospace|Handwritten|Inherit \(Default\)/,
    });
    const checkedFont = fontOptions.filter(
      (el) => el.getAttribute('aria-checked') === 'true'
    );
    expect(checkedFont).toHaveLength(1);
    expect(checkedFont[0]).toHaveTextContent('Monospace');
    expect(checkedFont[0]).toHaveAttribute('tabindex', '0');
    fontOptions
      .filter((el) => el !== checkedFont[0])
      .forEach((el) => expect(el).toHaveAttribute('tabindex', '-1'));

    const styleOptions = screen.getAllByRole('radio', {
      name: /Modern|LCD|Minimal/,
    });
    const checkedStyle = styleOptions.filter(
      (el) => el.getAttribute('aria-checked') === 'true'
    );
    expect(checkedStyle).toHaveLength(1);
    expect(checkedStyle[0]).toHaveTextContent('LCD');
    expect(checkedStyle[0]).toHaveAttribute('tabindex', '0');
  });

  it('selects a Display Style option via click', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'b1',
        name: 'Test School',
        gradeLevels: ['k-2'],
        gradeLabel: 'K-2',
      },
    ]);

    render(
      <ClockConfigurationPanel
        config={{ buildingDefaults: {} }}
        onChange={mockOnChange}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Minimal' }));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const updated = mockOnChange.mock.calls[0][0] as ClockGlobalConfig;
    expect(updated.buildingDefaults?.b1?.clockStyle).toBe('minimal');
  });
});
