import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EffectiveRegion, GuidedLearningStageProps } from './stage';

const read = (p: string): string =>
  readFileSync(resolve(process.cwd(), p), 'utf8');

describe('GL/types/stage.ts', () => {
  it('matches the frozen block in the plan verbatim', () => {
    const plan = read('docs/plans/GUIDED_LEARNING_STUDIO.md');
    const match = /```ts\n\/\/ GL\/types\/stage\.ts\n([\s\S]*?)```/.exec(plan);
    expect(match).not.toBeNull();
    const source = read('components/widgets/GuidedLearning/types/stage.ts');
    expect(source).toBe(match?.[1]);
  });

  it('compiles as the stage contract', () => {
    const region: EffectiveRegion = { cx: 0, cy: 0, w: 1, h: 1, shape: 'pin' };
    const props: Pick<GuidedLearningStageProps, 'activeStepId'> = {
      activeStepId: null,
    };
    expect(region.shape).toBe('pin');
    expect(props.activeStepId).toBeNull();
  });
});
