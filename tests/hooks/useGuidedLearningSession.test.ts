import { describe, expect, it } from 'vitest';
import { toPublicStep } from '@/hooks/useGuidedLearningSession';
import { GuidedLearningStep } from '@/types';

describe('toPublicStep', () => {
  it('forwards public-safe visual configuration fields', () => {
    const step: GuidedLearningStep = {
      id: 'step-1',
      xPct: 42,
      yPct: 64,
      imageIndex: 0,
      label: 'Focus area',
      interactionType: 'tooltip',
      hideStepNumber: true,
      showOverlay: 'tooltip',
      tooltipPosition: 'below',
      tooltipOffset: 24,
      text: 'Read this section carefully.',
      panZoomScale: 3,
      spotlightRadius: 30,
      bannerTone: 'red',
      autoAdvanceDuration: 7,
      question: {
        type: 'multiple-choice',
        text: 'What is 2 + 2?',
        choices: ['4', '5', '6'],
        correctAnswer: '4',
      },
    };

    const publicStep = toPublicStep(step);

    expect(publicStep.tooltipPosition).toBe('below');
    expect(publicStep.tooltipOffset).toBe(24);
    expect(publicStep.bannerTone).toBe('red');
    expect(publicStep.question?.text).toBe('What is 2 + 2?');
    expect(publicStep.question).not.toHaveProperty('correctAnswer');
  });
});
