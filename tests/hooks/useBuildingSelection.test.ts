import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import type { Building } from '@/config/buildings';

const building = (id: string): Building => ({ id, name: id }) as Building;

describe('useBuildingSelection', () => {
  it('selects the first building initially', () => {
    const { result } = renderHook(() =>
      useBuildingSelection([building('high'), building('middle')])
    );
    expect(result.current[0]).toBe('high');
  });

  it('snaps forward when the selected id drops out of a non-empty list', () => {
    const { result, rerender } = renderHook(
      ({ buildings }: { buildings: Building[] }) =>
        useBuildingSelection(buildings),
      { initialProps: { buildings: [building('high'), building('middle')] } }
    );
    expect(result.current[0]).toBe('high');
    // Org admin renames/removes the currently selected building.
    rerender({ buildings: [building('middle')] });
    expect(result.current[0]).toBe('middle');
  });

  // Regression: an org membership revoke mid-session (AuthContext clears
  // orgId -> useAdminBuildings falls back to []) drops `buildings` from
  // non-empty to empty. `selectedId` must clear along with it — a stale id
  // pointing at a building no longer in the list otherwise sticks forever
  // (no building in the now-empty list can ever match it again), leaving
  // every *ConfigurationPanel consumer showing a blank building tab with no
  // way for the user to recover by reselecting.
  it('clears the selection when buildings transitions from non-empty to empty', () => {
    const { result, rerender } = renderHook(
      ({ buildings }: { buildings: Building[] }) =>
        useBuildingSelection(buildings),
      { initialProps: { buildings: [building('high'), building('middle')] } }
    );
    expect(result.current[0]).toBe('high');
    rerender({ buildings: [] });
    expect(result.current[0]).toBe('');
  });

  it('re-populates the selection once buildings comes back non-empty', () => {
    const { result, rerender } = renderHook(
      ({ buildings }: { buildings: Building[] }) =>
        useBuildingSelection(buildings),
      { initialProps: { buildings: [] as Building[] } }
    );
    expect(result.current[0]).toBe('');
    rerender({ buildings: [building('high')] });
    expect(result.current[0]).toBe('high');
  });
});
