import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArtsLettersAgendaConfigurationPanel } from './ArtsLettersAgendaConfigurationPanel';
import type { ArtsLettersAgendaGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

const building: Building = {
  id: 'schumann-elementary',
  name: 'Schumann Elementary',
  gradeLevels: ['k-2'],
  gradeLabel: 'K-2',
};

describe('ArtsLettersAgendaConfigurationPanel', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAdminBuildings.mockReturnValue([building]);
  });

  const lastSaved = () =>
    onChange.mock.calls[
      onChange.mock.calls.length - 1
    ][0] as ArtsLettersAgendaGlobalConfig;

  it('shows Launch, Learn, Land in both lists when nothing is saved', () => {
    render(
      <ArtsLettersAgendaConfigurationPanel
        config={{ buildingDefaults: {} }}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText('Simple version box 1')).toHaveValue('Launch');
    expect(screen.getByLabelText('Detailed version box 3')).toHaveValue('Land');
    expect(screen.getAllByText('Using Launch, Learn, Land')).toHaveLength(2);
  });

  it('finds saved lists keyed by the canonical building id', () => {
    render(
      <ArtsLettersAgendaConfigurationPanel
        config={{
          buildingDefaults: {
            schumann: {
              buildingId: 'schumann',
              detailedParts: [
                { id: 'a', label: 'Warm up' },
                { id: 'b', label: 'Practice' },
              ],
            },
          },
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText('Detailed version box 2')).toHaveValue(
      'Practice'
    );
    expect(screen.getByText('2 of 8 boxes')).toBeInTheDocument();
  });

  it('saves a new box under the canonical building id, in the right list', () => {
    render(
      <ArtsLettersAgendaConfigurationPanel
        config={{ buildingDefaults: {} }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText('New box for Detailed version'), {
      target: { value: 'Share out' },
    });
    fireEvent.click(screen.getAllByText('Add')[1]);
    const saved = lastSaved();
    const building = saved.buildingDefaults.schumann;
    expect(building.detailedParts?.map((p) => p.label)).toEqual([
      'Launch',
      'Learn',
      'Land',
      'Share out',
    ]);
    expect(building.simpleParts).toBeUndefined();
    expect(saved.buildingDefaults['schumann-elementary']).toBeUndefined();
  });

  it('renames a box without changing its id', () => {
    render(
      <ArtsLettersAgendaConfigurationPanel
        config={{
          buildingDefaults: {
            schumann: {
              buildingId: 'schumann',
              simpleParts: [{ id: 'launch', label: 'Launch' }],
            },
          },
        }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText('Simple version box 1'), {
      target: { value: 'Hook' },
    });
    expect(lastSaved().buildingDefaults.schumann.simpleParts).toEqual([
      { id: 'launch', label: 'Hook' },
    ]);
  });

  it('moves a box down and removes a box', () => {
    render(
      <ArtsLettersAgendaConfigurationPanel
        config={{
          buildingDefaults: {
            schumann: {
              buildingId: 'schumann',
              simpleParts: [
                { id: 'a', label: 'One' },
                { id: 'b', label: 'Two' },
              ],
            },
          },
        }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Move One down'));
    expect(
      lastSaved().buildingDefaults.schumann.simpleParts?.map((p) => p.id)
    ).toEqual(['b', 'a']);
    fireEvent.click(screen.getByLabelText('Remove Two'));
    expect(
      lastSaved().buildingDefaults.schumann.simpleParts?.map((p) => p.id)
    ).toEqual(['a']);
  });

  it('will not remove the last box and stops adding at eight', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      label: `Step ${i + 1}`,
    }));
    render(
      <ArtsLettersAgendaConfigurationPanel
        config={{
          buildingDefaults: {
            schumann: {
              buildingId: 'schumann',
              simpleParts: [{ id: 'only', label: 'Only' }],
              detailedParts: eight,
            },
          },
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText('Remove Only')).toBeDisabled();
    expect(
      screen.getByLabelText('New box for Detailed version')
    ).toBeDisabled();
  });

  it('keeps a trailing space and an empty name while the admin is typing', () => {
    const { rerender } = render(
      <ArtsLettersAgendaConfigurationPanel
        config={{
          buildingDefaults: {
            schumann: {
              buildingId: 'schumann',
              simpleParts: [
                { id: 'a', label: 'Big ' },
                { id: 'b', label: '' },
              ],
            },
          },
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText('Simple version box 1')).toHaveValue('Big ');
    expect(screen.getByLabelText('Simple version box 2')).toHaveValue('');
    rerender(
      <ArtsLettersAgendaConfigurationPanel
        config={{
          buildingDefaults: {
            schumann: {
              buildingId: 'schumann',
              simpleParts: [{ id: 'a', label: 'Big I' }],
            },
          },
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText('Simple version box 1')).toHaveValue('Big I');
  });

  it('gives each list its own Add button anchor', () => {
    render(
      <ArtsLettersAgendaConfigurationPanel
        config={{ buildingDefaults: {} }}
        onChange={onChange}
      />
    );
    const anchors = screen
      .getAllByText('Add')
      .map((el) => el.closest('button')?.getAttribute('data-tour-field'));
    expect(new Set(anchors).size).toBe(2);
  });

  it('names an emptied box by its position in the move and remove buttons', () => {
    render(
      <ArtsLettersAgendaConfigurationPanel
        config={{
          buildingDefaults: {
            schumann: {
              buildingId: 'schumann',
              simpleParts: [
                { id: 'a', label: 'One' },
                { id: 'b', label: '' },
              ],
            },
          },
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText('Move box 2 up')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove box 2')).toBeInTheDocument();
  });
});
