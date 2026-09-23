import { describe, expect, it } from 'vitest';
import type { GuidedLearningPublicStep } from '@/types';
import { defaultPlayback, hasStepTarget } from './playback';

const step = (
  over: Partial<GuidedLearningPublicStep>
): GuidedLearningPublicStep => ({
  id: 's',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  ...over,
});

describe('playback helpers', () => {
  it('maps guided to Watch and structured to Try', () => {
    expect(defaultPlayback('guided')).toBe('watch');
    expect(defaultPlayback('structured')).toBe('try');
  });

  it('treats media, questions and region-less popovers as targetless', () => {
    expect(hasStepTarget(step({}))).toBe(true);
    expect(hasStepTarget(step({ interactionType: 'pan-zoom' }))).toBe(true);
    expect(hasStepTarget(step({ interactionType: 'audio' }))).toBe(false);
    expect(hasStepTarget(step({ interactionType: 'video' }))).toBe(false);
    expect(hasStepTarget(step({ interactionType: 'question' }))).toBe(false);
    expect(hasStepTarget(step({ interactionType: 'text-popover' }))).toBe(
      false
    );
    expect(
      hasStepTarget(
        step({
          interactionType: 'text-popover',
          region: { shape: 'rect', wPct: 10, hPct: 10 },
        })
      )
    ).toBe(true);
    expect(hasStepTarget(null)).toBe(false);
  });
});
