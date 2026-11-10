import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep, WebTourPicture } from '@/types';
import { changedPictureSteps, pictureChanged } from './pictureChange';
import { picturesSignature } from './webStepReview';

const pic: WebTourPicture = { path: 'web_tour_pictures/t/a.jpg', w: 10, h: 10 };
const step = (id: string, picture?: WebTourPicture): GuidedLearningStep => ({
  id,
  xPct: 0,
  yPct: 0,
  imageIndex: 0,
  interactionType: 'tooltip',
  web: {
    urlPattern: 'https://x.test/*',
    action: 'click',
    locator: {},
    ...(picture ? { picture } : {}),
  },
});

describe('pictureChanged', () => {
  it('sees a new file: a crop, blur, retake or replacement', () => {
    expect(
      pictureChanged(pic, { ...pic, path: 'web_tour_pictures/t/b.jpg' })
    ).toBe(true);
  });

  it('sees markup added, moved or removed, and ignores shape ids', () => {
    const box = {
      id: 'x',
      kind: 'box' as const,
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.2,
    };
    expect(pictureChanged(pic, { ...pic, markup: [box] })).toBe(true);
    expect(
      pictureChanged(
        { ...pic, markup: [box] },
        { ...pic, markup: [{ ...box, x: 0.3 }] }
      )
    ).toBe(true);
    expect(
      pictureChanged(
        { ...pic, markup: [box] },
        { ...pic, markup: [{ ...box, id: 'y' }] }
      )
    ).toBe(false);
  });

  it('ignores what a learner never sees: ring place and the uncropped capture', () => {
    expect(
      pictureChanged(pic, {
        ...pic,
        target: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
        original: { path: 'o', w: 1, h: 1, crop: { x: 0, y: 0, w: 1, h: 1 } },
      })
    ).toBe(false);
  });

  it('sees a picture added or removed', () => {
    expect(pictureChanged(undefined, pic)).toBe(true);
    expect(pictureChanged(pic, undefined)).toBe(true);
    expect(pictureChanged(undefined, undefined)).toBe(false);
  });
});

describe('changedPictureSteps', () => {
  it('lists the steps whose picture differs from the published copy', () => {
    const published = { steps: [step('a', pic), step('b', pic)] };
    const draft = {
      steps: [
        step('a', pic),
        step('b', {
          ...pic,
          markup: [{ id: 'n', kind: 'number', x: 0.5, y: 0.5, n: 1 }],
        }),
        step('c', pic),
      ],
    };
    expect(changedPictureSteps(draft, published)).toEqual(['b', 'c']);
  });
});

describe('picturesSignature', () => {
  it('changes with markup and keeps older confirmations without it', () => {
    const bare = { steps: [step('a', pic)] };
    const marked = {
      steps: [
        step('a', {
          ...pic,
          markup: [{ id: 'n', kind: 'number' as const, x: 0.5, y: 0.5, n: 1 }],
        }),
      ],
    };
    expect(picturesSignature(marked)).not.toBe(picturesSignature(bare));
    expect(picturesSignature(bare)).toBe(
      picturesSignature({ steps: [step('z', pic)] })
    );
  });
});
