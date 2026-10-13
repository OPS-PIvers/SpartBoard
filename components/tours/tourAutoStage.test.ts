import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import {
  autoStage,
  needsAutoStage,
  stageBoxes,
  stageSlots,
} from './tourAutoStage';

const step = (anchor: string, slot?: number): GuidedLearningStep =>
  ({
    id: anchor,
    tour: { anchor, action: 'click', ...(slot === undefined ? {} : { slot }) },
  }) as GuidedLearningStep;

const set = (widgets: string[], extra = {}): GuidedLearningSet =>
  ({
    id: 's',
    mode: 'tour',
    steps: [],
    tourSetup: { widgets, ...extra },
  }) as unknown as GuidedLearningSet;

describe('tour auto-stage', () => {
  it('keeps every box on the board, clear of the top bar and the Dock, and the focus widget largest', () => {
    for (const count of [1, 2, 3, 4]) {
      for (let focus = 0; focus < count; focus++) {
        const boxes = stageBoxes(count, focus);
        expect(boxes).toHaveLength(count);
        for (const b of boxes) {
          expect(b.xProp).toBeGreaterThanOrEqual(0);
          expect(b.yProp).toBeGreaterThanOrEqual(0.1);
          expect(b.xProp + b.wProp).toBeLessThanOrEqual(1);
          expect(b.yProp + b.hProp).toBeLessThanOrEqual(0.8401);
        }
        const area = boxes.map((b) => b.wProp * b.hProp);
        expect(Math.max(...area)).toBe(area[focus]);
      }
    }
  });

  it('keeps a slot the steps already use and fills the rest in order', () => {
    expect(
      stageSlots(['clock', 'random', 'poll'], [step('random.pick:random', 1)])
    ).toEqual([0, 1, 2]);
    expect(
      stageSlots(['clock', 'random'], [step('random.pick:random', 0)])
    ).toEqual([1, 0]);
  });

  it('stages only a cleared-stage tour with widgets and no layouts', () => {
    expect(needsAutoStage(set(['clock']))).toBe(true);
    expect(needsAutoStage(set([]))).toBe(false);
    expect(needsAutoStage(set(['clock'], { useTeacherBoard: true }))).toBe(
      false
    );
    expect(
      needsAutoStage(
        set(['clock'], {
          layouts: [
            { slot: 0, type: 'clock', xProp: 0, yProp: 0, wProp: 1, hProp: 1 },
          ],
        })
      )
    ).toBe(false);
  });

  it('starts on the first step widget and adds a keyframe only where the focus changes', () => {
    const steps = [
      step('board.whole'),
      step('widget.settings-opener:random'),
      step('random.pick:random'),
      step('widget.settings-opener:clock'),
    ];
    const out = autoStage(set(['clock', 'random']), steps);
    const layouts = out.set.tourSetup?.layouts ?? [];
    expect(layouts.map((l) => [l.type, l.slot])).toEqual([
      ['clock', 0],
      ['random', 1],
    ]);
    // Random is the first widget a step points at, so it starts large.
    expect(layouts[1].wProp).toBeGreaterThan(layouts[0].wProp);
    expect(out.steps.map((s) => s.tour?.layoutKeyframes?.length ?? 0)).toEqual([
      0, 0, 0, 2,
    ]);
    const kf = out.steps[3].tour?.layoutKeyframes ?? [];
    expect(kf.find((k) => k.slot === 0)?.wProp).toBeGreaterThan(
      kf.find((k) => k.slot === 1)?.wProp ?? 1
    );
  });
});
