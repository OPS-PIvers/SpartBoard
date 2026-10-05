import { describe, expect, it } from 'vitest';
import {
  summarizeExtras,
  tabInversions,
  type ExtrasRaw,
} from '@/scripts/widget-grader/measure/extrasLevels';
import type { CriterionId } from '@/scripts/widget-grader/types';

const STOP = { path: 'button', visibleFocus: true, x: 10, y: 10 };
const FACE = { text: 'Ready', controls: 1, media: 0, spinner: false };

const raw = (over: Partial<ExtrasRaw> = {}): ExtrasRaw => ({
  controls: 2,
  clutter: {
    visibleControls: 2,
    fontSizes: 2,
    colors: 3,
    words: 5,
    borders: 1,
    boxes: 2,
  },
  hoverOnly: [],
  doubleClick: 0,
  keyboard: {
    unreachable: [],
    stops: [STOP, { ...STOP, x: 60 }],
    axe: [],
  },
  motion: {
    normal: { running: 0, infinite: 0 },
    reduced: { running: 0, infinite: 0 },
  },
  theming: {
    opaqueFraction: 0.1,
    fontMatch: 1,
    textElements: 3,
    radiusMismatches: 0,
  },
  settings: {
    hasPanel: true,
    panelOverlap: 0.2,
    tried: [{ label: 'Show seconds', kind: 'toggle', changed: true }],
  },
  states: { loading: FACE, error: FACE, offline: FACE, noRoster: FACE },
  destructive: [],
  perf: {
    idleCommits: 0,
    dragCommits: 0,
    resizeCommits: 1,
    fastIntervals: [],
    animates: false,
    chunkBytes: 1000,
  },
  multi: { rendered: true, errors: 0, secondChanged: false },
  ...over,
});

const level = (
  r: ExtrasRaw,
  id: CriterionId,
  g4: boolean | null = true
): number | null | undefined =>
  summarizeExtras('clock', r, g4).find((m) => m.criterionId === id)
    ?.impliedLevel;

const values = (r: ExtrasRaw, id: CriterionId) =>
  summarizeExtras('clock', r, true).find((m) => m.criterionId === id)?.values ??
  {};

describe('summarizeExtras', () => {
  it('emits one widget-level measurement per S7 criterion', () => {
    const ms = summarizeExtras('clock', raw(), true, 'partial fixture');
    expect(ms.map((m) => m.criterionId)).toEqual([
      'I3',
      'I4',
      'I5',
      'V2',
      'V5',
      'C4',
      'C6',
      'R1',
      'R2',
      'R3',
      'R5',
    ]);
    expect(ms.every((m) => m.size === null && m.values.partial)).toBe(true);
  });

  it('I3: tap-only faces imply 3; hover or double-click goes to the judge', () => {
    expect(level(raw(), 'I3')).toBe(3);
    expect(level(raw({ hoverOnly: ['button[Delete]'] }), 'I3')).toBeNull();
    expect(level(raw({ doubleClick: 1 }), 'I3')).toBeNull();
    expect(values(raw({ controls: 0 }), 'I3').applicable).toBe(false);
  });

  it('I4: unreachable or unnamed is 1, violations or hidden focus is 2', () => {
    expect(level(raw(), 'I4')).toBe(3);
    expect(
      level(
        raw({ keyboard: { unreachable: ['div "x"'], stops: [STOP], axe: [] } }),
        'I4'
      )
    ).toBe(1);
    expect(
      level(
        raw({
          keyboard: {
            unreachable: [],
            stops: [STOP],
            axe: [{ id: 'button-name', nodes: 2 }],
          },
        }),
        'I4'
      )
    ).toBe(1);
    expect(
      level(
        raw({
          keyboard: {
            unreachable: [],
            stops: [{ ...STOP, visibleFocus: false }],
            axe: [],
          },
        }),
        'I4'
      )
    ).toBe(2);
    expect(
      level(
        raw({
          keyboard: {
            unreachable: [],
            stops: [STOP],
            axe: [{ id: 'nested-interactive', nodes: 1 }],
          },
        }),
        'I4'
      )
    ).toBe(2);
    expect(
      level(
        raw({ keyboard: { unreachable: [], stops: [STOP], axe: null } }),
        'I4'
      )
    ).toBeNull();
  });

  it('counts a tab stop that jumps up and back as an inversion', () => {
    expect(
      tabInversions([
        { ...STOP, x: 100, y: 200 },
        { ...STOP, x: 50, y: 20 },
        { ...STOP, x: 300, y: 10 },
      ])
    ).toBe(1);
  });

  it('I5 applies only when something animates and fails on loops under reduced motion', () => {
    expect(values(raw(), 'I5').applicable).toBe(false);
    const moving = { running: 2, infinite: 1 };
    expect(
      level(raw({ motion: { normal: moving, reduced: moving } }), 'I5')
    ).toBe(1);
    expect(
      level(
        raw({
          motion: { normal: moving, reduced: { running: 0, infinite: 0 } },
        }),
        'I5'
      )
    ).toBe(3);
  });

  it('V2 records the proxies without a level until thresholds exist', () => {
    expect(level(raw(), 'V2')).toBeNull();
    expect(values(raw(), 'V2').words).toBe(5);
  });

  it('V5 drops a level per ignored global setting', () => {
    expect(level(raw(), 'V5')).toBe(3);
    const theming = {
      opaqueFraction: 0.9,
      fontMatch: 0.2,
      textElements: 3,
      radiusMismatches: 1,
    };
    expect(level(raw({ theming }), 'V5')).toBe(1);
    expect(
      level(
        raw({ theming: { ...theming, fontMatch: 1, radiusMismatches: 0 } }),
        'V5'
      )
    ).toBe(2);
  });

  it('C4 and C6 read the settings changes', () => {
    expect(level(raw(), 'C4')).toBe(3);
    expect(level(raw(), 'C6')).toBe(3);
    const clear = raw({
      settings: { ...raw().settings, panelOverlap: 0 },
    });
    expect(level(clear, 'C6')).toBe(4);
    const dead = raw({
      settings: {
        hasPanel: true,
        panelOverlap: 0,
        tried: [
          { label: 'A', kind: 'toggle', changed: true },
          { label: 'B', kind: 'select', changed: false },
        ],
      },
    });
    expect(level(dead, 'C4')).toBeNull();
    expect(level(dead, 'C6')).toBeNull();
    expect(values(dead, 'C4').noVisibleChange).toBe('select "B"');
    const none = raw({
      settings: { hasPanel: false, panelOverlap: 0, tried: [] },
    });
    expect(values(none, 'C4').applicable).toBe(false);
    expect(values(none, 'C6').applicable).toBe(false);
  });

  it('R1 flags blank faces, raw errors and endless spinners', () => {
    expect(level(raw(), 'R1')).toBeNull();
    const blank = { text: '', controls: 0, media: 0, spinner: false };
    expect(
      level(raw({ states: { ...raw().states, noRoster: blank } }), 'R1')
    ).toBe(1);
    expect(
      level(
        raw({
          states: {
            ...raw().states,
            error: { ...FACE, text: 'TypeError: x is undefined' },
          },
        }),
        'R1'
      )
    ).toBe(1);
    const spinning = { ...FACE, spinner: true };
    expect(
      level(raw({ states: { ...raw().states, loading: spinning } }), 'R1')
    ).toBeNull();
    expect(
      level(raw({ states: { ...raw().states, offline: spinning } }), 'R1')
    ).toBe(1);
  });

  it('R2 is 0 on a G4 failure, 1 on an instant destructive action, 3 when all confirm', () => {
    expect(level(raw(), 'R2', false)).toBe(0);
    expect(level(raw(), 'R2')).toBeNull();
    expect(
      level(
        raw({
          destructive: [{ label: 'Clear', confirmed: false, changed: true }],
        }),
        'R2'
      )
    ).toBe(1);
    expect(
      level(
        raw({
          destructive: [{ label: 'Clear', confirmed: true, changed: true }],
        }),
        'R2'
      )
    ).toBe(3);
  });

  it('R3 counts missed budgets', () => {
    expect(level(raw(), 'R3')).toBe(3);
    const perf = raw().perf;
    expect(level(raw({ perf: { ...perf, dragCommits: 4 } }), 'R3')).toBe(2);
    expect(
      level(
        raw({ perf: { ...perf, dragCommits: 4, fastIntervals: [100] } }),
        'R3'
      )
    ).toBe(1);
    // A fast timer is fine while something visibly animates.
    expect(
      level(
        raw({ perf: { ...perf, fastIntervals: [16], animates: true } }),
        'R3'
      )
    ).toBe(3);
    expect(
      level(
        raw({ perf: { ...perf, dragCommits: null, resizeCommits: null } }),
        'R3'
      )
    ).toBeNull();
  });

  it('R5 is 1 when the second instance breaks or follows the first', () => {
    expect(level(raw(), 'R5')).toBeNull();
    expect(
      level(
        raw({ multi: { rendered: true, errors: 0, secondChanged: true } }),
        'R5'
      )
    ).toBe(1);
    expect(
      level(
        raw({ multi: { rendered: false, errors: 0, secondChanged: null } }),
        'R5'
      )
    ).toBe(1);
  });
});
