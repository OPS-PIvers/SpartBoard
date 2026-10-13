import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { glSetToLiveTour } from './glToLiveTour';

const storage = (n: number) =>
  `https://firebasestorage.googleapis.com/v0/b/app/o/slide${n}.png?alt=media`;

const source: GuidedLearningSet = {
  id: 'gl-1',
  title: 'Make a quiz',
  description: 'Walkthrough',
  imageUrls: [
    storage(0),
    'https://lh3.googleusercontent.com/d/abc',
    storage(2),
  ],
  imageKinds: ['image', 'image', 'video'],
  imagePaths: ['users/u/slide0.png'],
  steps: [
    {
      id: 's1',
      xPct: 20,
      yPct: 30,
      imageIndex: 0,
      label: ' Open the library ',
      text: 'Click Quiz.',
      interactionType: 'spotlight',
      calloutScale: 1.5,
    },
    {
      id: 's2',
      xPct: 0,
      yPct: 0,
      imageIndex: 1,
      interactionType: 'question',
      question: { type: 'multiple-choice', text: 'Which button?' },
    },
    {
      id: 's3',
      xPct: 0,
      yPct: 0,
      imageIndex: 2,
      interactionType: 'tooltip',
      tour: { anchor: 'dock.add-widget', action: 'click' },
    },
  ],
  mode: 'guided',
  createdAt: 1,
  updatedAt: 2,
};

describe('glSetToLiveTour', () => {
  const tour = glSetToLiveTour(source, { id: 'new', now: 99, authorUid: 'u' });

  it('makes a new building tour with no slides', () => {
    expect(tour).toMatchObject({
      id: 'new',
      title: 'Make a quiz',
      description: 'Walkthrough',
      mode: 'tour',
      isBuilding: true,
      authorUid: 'u',
      imageUrls: [],
      createdAt: 99,
      updatedAt: 99,
      hasLiveTour: true,
      tourSetup: { widgets: [] },
    });
    // The original owns its Storage files; deleting the tour must not remove them.
    expect(tour.imagePaths).toBeUndefined();
    expect(tour.imageKinds).toBeUndefined();
  });

  it('keeps step text, leaves new steps waiting for a control, and drops slide fields', () => {
    expect(tour.steps.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(tour.steps[0]).toMatchObject({
      label: 'Open the library',
      text: 'Click Quiz.',
      interactionType: 'text-popover',
      imageIndex: 0,
      tour: {
        anchor: '',
        action: 'click',
        thumbnail: { url: storage(0), anchor: '', w: 0, h: 0 },
      },
    });
    expect(tour.steps[0].calloutScale).toBeUndefined();
    expect(tour.steps[1].text).toBe('Which button?');
    expect(tour.steps[1].question).toBeUndefined();
  });

  it('carries only Storage pictures and keeps an existing binding', () => {
    expect(tour.steps[1].tour?.thumbnail).toBeUndefined();
    expect(tour.steps[2].tour).toEqual({
      anchor: 'dock.add-widget',
      action: 'click',
    });
  });

  it('leaves the source untouched', () => {
    expect(source.steps[0].interactionType).toBe('spotlight');
    expect(source.mode).toBe('guided');
  });
});
