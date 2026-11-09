import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import type { WebTourStep } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { stepsFromWebTour } from './stepsModel';
import { stepsFromLiveTour } from './liveSteps';
import { targetOf } from '@/components/tours/editor/useEditorThumbnails';

const webStep = (id: string, web: Record<string, unknown>): WebTourStep =>
  ({
    id,
    label: `Title ${id}`,
    text: `Tip ${id}`,
    web: {
      urlPattern: 'https://app.example.com/',
      action: 'click',
      locator: { role: 'button', name: 'Go' },
      ...web,
    },
  }) as unknown as WebTourStep;

describe('stepsFromWebTour', () => {
  it('rings the recorded target and keeps the picture size', () => {
    const [step] = stepsFromWebTour([
      webStep('a', {
        picture: {
          path: 'p',
          w: 1000,
          h: 500,
          cssW: 800,
          target: { x: 0.2, y: 0.3, w: 0.2, h: 0.1 },
        },
      }),
    ]);
    expect(step.picture).toEqual({
      w: 1000,
      h: 500,
      cssW: 800,
      target: { x: 0.2, y: 0.3, w: 0.2, h: 0.1 },
    });
    expect(step.title).toBe('Title a');
    expect(step.text).toBe('Tip a');
  });

  it('draws no ring when the target cannot be placed with confidence', () => {
    const [step] = stepsFromWebTour([
      webStep('a', { picture: { path: 'p', w: 1000, h: 500 } }),
    ]);
    expect(step.picture?.target).toBeNull();
  });

  it('has no picture for a step without one, and marks observe steps', () => {
    const [step] = stepsFromWebTour([webStep('a', { action: 'observe' })]);
    expect(step.picture).toBeNull();
    expect(step.observe).toBe(true);
  });

  it('notes a step that only shows when a condition holds', () => {
    const steps = stepsFromWebTour([
      webStep('a', { showWhen: [{ kind: 'present' }] }),
      webStep('b', { showWhen: [] }),
      webStep('c', {}),
    ]);
    expect(steps.map((s) => s.onlyIfAppears)).toEqual([true, false, false]);
  });
});

const liveStep = (
  id: string,
  tour: Record<string, unknown>
): GuidedLearningStep =>
  ({
    id,
    label: `Title ${id}`,
    text: `Tip ${id}`,
    imageIndex: 0,
    tour: { anchor: 'dock.open-tools', action: 'click', ...tour },
  }) as unknown as GuidedLearningStep;

const liveSet = (steps: GuidedLearningStep[]): GuidedLearningSet =>
  ({
    id: 's',
    title: 'Tour',
    mode: 'tour',
    imageUrls: [],
    steps,
  }) as unknown as GuidedLearningSet;

describe('stepsFromLiveTour', () => {
  it('uses each step thumbnail as its picture, with the target when it was recorded', () => {
    const { steps, urls } = stepsFromLiveTour(
      liveSet([
        liveStep('a', {
          thumbnail: {
            url: 'https://img/a.png',
            anchor: 'dock.open-tools',
            w: 640,
            h: 360,
            target: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
          },
        }),
        liveStep('b', {
          thumbnail: {
            url: 'https://img/b.png',
            anchor: 'dock.open-tools',
            w: 640,
            h: 360,
          },
        }),
      ])
    );
    expect(urls).toEqual({
      a: 'https://img/a.png',
      b: 'https://img/b.png',
    });
    expect(steps[0].picture?.target).toEqual({
      x: 0.4,
      y: 0.4,
      w: 0.2,
      h: 0.2,
    });
    expect(steps[1].picture?.target).toBeNull();
  });

  it('shows no picture for a step with none, or one taken of a different control', () => {
    const { steps, urls } = stepsFromLiveTour(
      liveSet([
        liveStep('a', {}),
        liveStep('b', {
          thumbnail: {
            url: 'https://img/old.png',
            anchor: 'sidebar.open-menu',
            w: 10,
            h: 10,
          },
        }),
      ])
    );
    expect(steps.map((s) => s.picture)).toEqual([null, null]);
    expect(urls).toEqual({});
  });

  it('notes a step with a show condition', () => {
    const { steps } = stepsFromLiveTour(
      liveSet([
        liveStep('a', { showWhen: [{ kind: 'widget-open', type: 'timer' }] }),
        liveStep('b', {}),
      ])
    );
    expect(steps.map((s) => s.onlyIfAppears)).toEqual([true, false]);
  });

  it('leaves a web tour with no steps', () => {
    expect(
      stepsFromLiveTour({ ...liveSet([liveStep('a', {})]), surface: 'web' })
        .steps
    ).toEqual([]);
  });
});

describe('targetOf', () => {
  it('turns the recorded centre and size, in percent, into a box in the picture', () => {
    const box = targetOf({
      xPct: 50,
      yPct: 50,
      region: { shape: 'rect', wPct: 20, hPct: 10 },
    });
    expect(box?.x).toBeCloseTo(0.4);
    expect(box?.y).toBeCloseTo(0.45);
    expect(box?.w).toBeCloseTo(0.2);
    expect(box?.h).toBeCloseTo(0.1);
  });

  it('refuses a box that falls outside the picture', () => {
    expect(
      targetOf({
        xPct: 99,
        yPct: 50,
        region: { shape: 'rect', wPct: 20, hPct: 10 },
      })
    ).toBeNull();
  });
});
