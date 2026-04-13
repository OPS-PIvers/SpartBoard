import { describe, expect, it } from 'vitest';
import { GuidedLearningSet } from '@/types';
import { normalizeGuidedLearningSet } from './setMigration';

interface LegacyGuidedLearningSet extends GuidedLearningSet {
  imageUrl?: string;
  imagePath?: string;
}

describe('normalizeGuidedLearningSet', () => {
  const baseSet: GuidedLearningSet = {
    id: 'test-set',
    title: 'Test Set',
    imageUrls: ['url1'],
    imagePaths: ['path1'],
    steps: [
      {
        id: 'step1',
        xPct: 50,
        yPct: 50,
        imageIndex: 0,
        interactionType: 'text-popover',
        showOverlay: 'popover',
      },
    ],
    mode: 'guided',
    createdAt: 123456,
    updatedAt: 123456,
  };

  it('identity: returns same values if already normalized', () => {
    const result = normalizeGuidedLearningSet(baseSet);
    expect(result).toEqual(baseSet);
  });

  it('migration: migrates legacy imageUrl to imageUrls array', () => {
    const legacySet: LegacyGuidedLearningSet = {
      ...baseSet,
      imageUrls: [],
      imageUrl: 'legacy-url',
    };

    const result = normalizeGuidedLearningSet(legacySet);
    expect(result.imageUrls).toEqual(['legacy-url']);
  });

  it('migration: migrates legacy imagePath to imagePaths array', () => {
    const legacySet: LegacyGuidedLearningSet = {
      ...baseSet,
      imagePaths: [],
      imagePath: 'legacy-path',
    };

    const result = normalizeGuidedLearningSet(legacySet);
    expect(result.imagePaths).toEqual(['legacy-path']);
  });

  it('step normalization: clamps imageIndex within bounds', () => {
    const setWithBadIndices: GuidedLearningSet = {
      ...baseSet,
      imageUrls: ['url1', 'url2'], // last index is 1
      steps: [
        {
          ...baseSet.steps[0],
          id: 'too-low',
          imageIndex: -1,
        },
        {
          ...baseSet.steps[0],
          id: 'too-high',
          imageIndex: 5,
        },
      ],
    };

    const result = normalizeGuidedLearningSet(setWithBadIndices);
    expect(result.steps[0].imageIndex).toBe(0);
    expect(result.steps[1].imageIndex).toBe(1);
  });

  it('step normalization: defaults imageIndex to 0 if imageUrls is empty', () => {
    const setWithNoImages: GuidedLearningSet = {
      ...baseSet,
      imageUrls: [],
      steps: [
        {
          ...baseSet.steps[0],
          imageIndex: 5,
        },
      ],
    };

    const result = normalizeGuidedLearningSet(setWithNoImages);
    expect(result.steps[0].imageIndex).toBe(0);
  });

  it('step normalization: defaults showOverlay to "none"', () => {
    // To test missing showOverlay, we need to cast or use a partial that we then cast to GuidedLearningSet
    // Since GuidedLearningStep requires showOverlay normally (based on my read of types.ts),
    // we use Omit to simulate it being missing from a legacy source.
    const setWithMissingOverlay = {
      ...baseSet,
      steps: [
        {
          id: 'step1',
          xPct: 10,
          yPct: 10,
          imageIndex: 0,
          interactionType: 'text-popover',
        },
      ],
    } as unknown as GuidedLearningSet;

    const result = normalizeGuidedLearningSet(setWithMissingOverlay);
    expect(result.steps[0].showOverlay).toBe('none');
  });

  it('handles missing steps by defaulting to empty array', () => {
    const setWithoutSteps = {
      ...baseSet,
      steps: undefined,
    } as unknown as GuidedLearningSet;

    const result = normalizeGuidedLearningSet(setWithoutSteps);
    expect(result.steps).toEqual([]);
  });
});
