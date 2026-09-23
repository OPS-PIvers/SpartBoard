import { describe, it, expect } from 'vitest';
import type { StepEvent } from '../types/stage';
import {
  MAX_CLICKS_PER_STEP,
  MAX_TRACKED_STEPS,
  applyStepEvent,
  emptyProgress,
  parseProgressDoc,
  summarizeEngagement,
  type GuidedLearningProgress,
} from './progress';

const ev = (
  partial: Partial<StepEvent> & Pick<StepEvent, 'type'>
): StepEvent => ({
  stepId: 's1',
  mode: 'try',
  ms: 0,
  ...partial,
});

describe('applyStepEvent', () => {
  it('raises the furthest step on enter and never lowers it', () => {
    let p = applyStepEvent(emptyProgress(), ev({ type: 'enter' }), 3, 5);
    expect(p.furthestStepIdx).toBe(3);
    p = applyStepEvent(p, ev({ type: 'enter', stepId: 's0' }), 1, 5);
    expect(p.furthestStepIdx).toBe(3);
  });

  it('adds time on leave', () => {
    let p = applyStepEvent(
      emptyProgress(),
      ev({ type: 'leave', ms: 1200.4 }),
      0,
      2
    );
    p = applyStepEvent(p, ev({ type: 'leave', ms: 800 }), 0, 2);
    expect(p.steps.s1.ms).toBe(2000);
  });

  it('counts misclicks and caps stored click positions', () => {
    let p = emptyProgress();
    for (let i = 0; i < MAX_CLICKS_PER_STEP + 5; i++) {
      p = applyStepEvent(
        p,
        ev({ type: 'misclick', xPct: 12.345, yPct: 150 }),
        0,
        2
      );
    }
    expect(p.steps.s1.misclicks).toBe(MAX_CLICKS_PER_STEP + 5);
    expect(p.steps.s1.clicks).toHaveLength(MAX_CLICKS_PER_STEP);
    expect(p.steps.s1.clicks?.[0]).toEqual({ x: 12.3, y: 100 });
  });

  it('marks hints and completes only on the last step', () => {
    let p = applyStepEvent(emptyProgress(), ev({ type: 'hint' }), 0, 2);
    expect(p.steps.s1.hinted).toBe(true);
    p = applyStepEvent(p, ev({ type: 'complete' }), 1, 2);
    expect(p.completed).toBe(false);
    p = applyStepEvent(p, ev({ type: 'complete', stepId: 's2' }), 2, 2);
    expect(p.completed).toBe(true);
  });

  it('records the mode and counts switches after the first', () => {
    let p = applyStepEvent(
      emptyProgress(),
      ev({ type: 'enter', mode: 'watch' }),
      0,
      2
    );
    expect(p).toMatchObject({ mode: 'watch', modeSwitches: 0 });
    p = applyStepEvent(p, ev({ type: 'enter', mode: 'try' }), 0, 2);
    p = applyStepEvent(p, ev({ type: 'enter', mode: null }), 0, 2);
    expect(p).toMatchObject({ mode: 'try', modeSwitches: 1 });
  });

  it('adds no new step keys past the rules cap', () => {
    const steps: GuidedLearningProgress['steps'] = {};
    for (let i = 0; i < MAX_TRACKED_STEPS; i++) {
      steps[`k${i}`] = { ms: 0, misclicks: 0, hinted: false };
    }
    const p = applyStepEvent(
      { ...emptyProgress(), steps },
      ev({ type: 'hint', stepId: 'new' }),
      0,
      2
    );
    expect(p.steps.new).toBeUndefined();
    const q = applyStepEvent(p, ev({ type: 'hint', stepId: 'k0' }), 0, 2);
    expect(q.steps.k0.hinted).toBe(true);
  });
});

describe('parseProgressDoc', () => {
  it('drops malformed values', () => {
    expect(
      parseProgressDoc({
        mode: 'sideways',
        furthestStepIdx: '3',
        steps: { a: { ms: 5, clicks: [{ x: 1, y: 2 }, { x: 'no' }] }, b: null },
      })
    ).toEqual({
      modeSwitches: 0,
      furthestStepIdx: 0,
      completed: false,
      steps: {
        a: { ms: 5, misclicks: 0, hinted: false, clicks: [{ x: 1, y: 2 }] },
        b: { ms: 0, misclicks: 0, hinted: false },
      },
    });
  });
});

describe('summarizeEngagement', () => {
  const steps = [
    { id: 'a', imageIndex: 0 },
    { id: 'b', imageIndex: 0 },
    { id: 'c', imageIndex: 1 },
  ];
  const doc = (
    furthestStepIdx: number,
    mode: 'watch' | 'try',
    completed: boolean,
    s: GuidedLearningProgress['steps']
  ): GuidedLearningProgress => ({
    mode,
    modeSwitches: 0,
    furthestStepIdx,
    completed,
    steps: s,
  });

  it('builds the funnel, heatmap dots and mode split', () => {
    const summary = summarizeEngagement(
      [
        doc(2, 'try', true, {
          a: {
            ms: 1000,
            misclicks: 1,
            hinted: false,
            clicks: [{ x: 10, y: 20 }],
          },
          c: {
            ms: 3000,
            misclicks: 1,
            hinted: false,
            clicks: [{ x: 50, y: 50 }],
          },
        }),
        doc(1, 'try', false, {
          a: { ms: 3000, misclicks: 0, hinted: false },
          b: { ms: 500, misclicks: 1, hinted: false, clicks: [{ x: 1, y: 1 }] },
        }),
        doc(0, 'watch', false, {
          a: { ms: 2000, misclicks: 0, hinted: false },
        }),
      ],
      steps
    );
    expect(summary.viewers).toBe(3);
    expect(summary.funnel).toEqual([
      { stepId: 'a', reached: 3, medianMs: 2000 },
      { stepId: 'b', reached: 2, medianMs: 500 },
      { stepId: 'c', reached: 1, medianMs: 3000 },
    ]);
    expect(summary.misclicksBySlide.get(0)).toHaveLength(2);
    expect(summary.misclicksBySlide.get(1)).toEqual([
      { x: 50, y: 50, stepId: 'c' },
    ]);
    expect(summary.split).toEqual({
      watch: { viewers: 1, completed: 0 },
      try: { viewers: 2, completed: 1 },
    });
  });
});
