import { describe, it, expect } from 'vitest';
import type { SeatingChartConfig, FurnitureItem } from '@/types';
import {
  cleanPlanName,
  deletePlan,
  detachPlan,
  hasUnsavedSeats,
  renamePlan,
  saveAsNewPlan,
  switchPlan,
} from './seatingPlans';

const desk = (id: string): FurnitureItem => ({
  id,
  type: 'desk',
  x: 0,
  y: 0,
  width: 60,
  height: 50,
  rotation: 0,
});

const base = (over: Partial<SeatingChartConfig> = {}): SeatingChartConfig => ({
  furniture: [desk('d1'), desk('d2'), desk('d3')],
  assignments: { s1: 'd1', s2: 'd2' },
  gridSize: 20,
  ...over,
});

describe('seatingPlans', () => {
  it('saves the seats on screen as a new active plan', () => {
    const patch = saveAsNewPlan(base(), '  Test   day ', 'p1');
    expect(patch.activePlanId).toBe('p1');
    expect(patch.savedPlans).toEqual([
      { id: 'p1', name: 'Test day', assignments: { s1: 'd1', s2: 'd2' } },
    ]);
  });

  it('keeps edits to the active plan when saving another', () => {
    const cfg = base({
      savedPlans: [{ id: 'p1', name: 'A', assignments: { s1: 'd3' } }],
      activePlanId: 'p1',
    });
    const patch = saveAsNewPlan(cfg, 'B', 'p2');
    expect(patch.savedPlans?.[0].assignments).toEqual({ s1: 'd1', s2: 'd2' });
    expect(patch.activePlanId).toBe('p2');
  });

  it('switches plans, snapshotting the current one first', () => {
    const cfg = base({
      savedPlans: [
        { id: 'p1', name: 'A', assignments: {} },
        { id: 'p2', name: 'B', assignments: { s1: 'd3' } },
      ],
      activePlanId: 'p1',
    });
    const patch = switchPlan(cfg, 'p2');
    expect(patch?.assignments).toEqual({ s1: 'd3' });
    expect(patch?.activePlanId).toBe('p2');
    expect(patch?.savedPlans?.[0].assignments).toEqual({ s1: 'd1', s2: 'd2' });
  });

  it('drops seats whose furniture no longer exists when switching', () => {
    const cfg = base({
      savedPlans: [
        { id: 'p2', name: 'B', assignments: { s1: 'gone', s2: 'd2' } },
      ],
    });
    expect(switchPlan(cfg, 'p2')?.assignments).toEqual({ s2: 'd2' });
  });

  it('returns null for an unknown plan', () => {
    expect(switchPlan(base(), 'nope')).toBeNull();
  });

  it('renames only the named plan', () => {
    const cfg = base({
      savedPlans: [
        { id: 'p1', name: 'A', assignments: {} },
        { id: 'p2', name: 'B', assignments: {} },
      ],
    });
    expect(
      renamePlan(cfg, 'p2', 'Groups').savedPlans?.map((p) => p.name)
    ).toEqual(['A', 'Groups']);
  });

  it('deleting the active plan loads the next one', () => {
    const cfg = base({
      savedPlans: [
        { id: 'p1', name: 'A', assignments: {} },
        { id: 'p2', name: 'B', assignments: { s2: 'd3' } },
      ],
      activePlanId: 'p1',
    });
    const patch = deletePlan(cfg, 'p1');
    expect(patch.activePlanId).toBe('p2');
    expect(patch.assignments).toEqual({ s2: 'd3' });
  });

  it('deleting the last plan keeps the seats on screen', () => {
    const cfg = base({
      savedPlans: [{ id: 'p1', name: 'A', assignments: {} }],
      activePlanId: 'p1',
    });
    const patch = deletePlan(cfg, 'p1');
    expect(patch.activePlanId).toBeNull();
    expect(patch.assignments).toEqual({ s1: 'd1', s2: 'd2' });
  });

  it('deleting another plan leaves the active one alone', () => {
    const cfg = base({
      savedPlans: [
        { id: 'p1', name: 'A', assignments: {} },
        { id: 'p2', name: 'B', assignments: {} },
      ],
      activePlanId: 'p1',
    });
    const patch = deletePlan(cfg, 'p2');
    expect(patch.activePlanId).toBe('p1');
    expect(patch.assignments).toEqual({ s1: 'd1', s2: 'd2' });
  });

  it('flags seats that are not in any plan', () => {
    expect(hasUnsavedSeats(base())).toBe(true);
    expect(hasUnsavedSeats(base({ assignments: {} }))).toBe(false);
    expect(
      hasUnsavedSeats(
        base({
          savedPlans: [{ id: 'p1', name: 'A', assignments: {} }],
          activePlanId: 'p1',
        })
      )
    ).toBe(false);
  });

  it('caps plan names', () => {
    expect(cleanPlanName('x'.repeat(80))).toHaveLength(40);
  });

  it('never cuts an emoji in half at the length cap', () => {
    const out = cleanPlanName('x'.repeat(39) + '😀tail');
    expect(out).toBe('x'.repeat(39));
  });
});

describe('detachPlan', () => {
  it('saves the live seats into the plan before detaching', () => {
    const cfg: SeatingChartConfig = {
      furniture: [],
      gridSize: 20,
      assignments: { s1: 'd2' },
      savedPlans: [{ id: 'p1', name: 'A', assignments: { s1: 'd1' } }],
      activePlanId: 'p1',
    };
    expect(detachPlan(cfg)).toEqual({
      savedPlans: [{ id: 'p1', name: 'A', assignments: { s1: 'd2' } }],
      activePlanId: null,
    });
  });
});

describe('custom rosters', () => {
  it('never snapshots name-keyed seats into a plan', () => {
    const cfg: SeatingChartConfig = {
      furniture: [],
      gridSize: 20,
      rosterMode: 'custom',
      assignments: { 'Ana Ba': 'd1' },
      savedPlans: [{ id: 'p1', name: 'A', assignments: { s1: 'd2' } }],
      activePlanId: 'p1',
    };
    expect(detachPlan(cfg).savedPlans).toEqual(cfg.savedPlans);
  });
});
