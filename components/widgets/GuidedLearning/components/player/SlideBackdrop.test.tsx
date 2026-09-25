import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GuidedLearningPublicStep, GuidedLearningSet } from '@/types';
import { GuidedLearningStage } from '../GuidedLearningStage';

afterEach(cleanup);

const NO_ANSWERS: ReadonlySet<string> = new Set();
const noop = () => undefined;
const SLIDE = 'https://example.com/slide.png';
const CLIP = 'https://example.com/clip.mp4';

const renderStage = (kind: 'image' | 'video') => {
  const set: GuidedLearningSet = {
    id: 'set',
    schemaVersion: 3,
    title: 'Letterbox',
    imageUrls: [kind === 'video' ? CLIP : SLIDE],
    imageKinds: [kind],
    steps: [],
    mode: 'structured',
    createdAt: 1,
    updatedAt: 1,
  };
  return render(
    <GuidedLearningStage
      set={set}
      steps={[] as GuidedLearningPublicStep[]}
      imageIndex={0}
      activeStepId={null}
      authorMode="structured"
      answeredStepIds={NO_ANSWERS}
      teacherMode={false}
      zoomScale={1}
      onPinClick={noop}
      onAdvance={noop}
      onDismiss={noop}
    />
  ).container;
};

describe('slide letterbox', () => {
  it('fills the letterbox with the same image, outside the zoom layer', () => {
    const root = renderStage('image');
    const backdrop = screen.getByTestId('gl-slide-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop.closest('[data-testid="gl-panzoom-layer"]')).toBeNull();
    const fill = backdrop.firstElementChild as HTMLElement;
    expect(fill.style.backgroundImage).toContain(SLIDE);
    expect(fill.style.filter).toContain('blur');
    // No second <img>, so no second download and no extra node for the slide.
    expect(root.querySelectorAll('img')).toHaveLength(1);
  });

  it('uses a still of a video slide rather than a second video', () => {
    const root = renderStage('video');
    const backdrop = screen.getByTestId('gl-slide-backdrop');
    expect(backdrop.querySelector('canvas')).not.toBeNull();
    expect(root.querySelectorAll('video')).toHaveLength(1);
  });
});
