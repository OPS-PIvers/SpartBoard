import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { freshTourPictureUrl, tourPictureUrl } from './liveTour';

const set = {
  imageUrls: ['https://img/0.png', 'https://img/1.mp4'],
  imageKinds: ['image', 'video'],
} as Pick<GuidedLearningSet, 'imageUrls' | 'imageKinds'>;

const step = (s: Partial<GuidedLearningStep>) => s as GuidedLearningStep;
const thumb = { url: 'https://img/t.png', anchor: 'dock.boards', w: 1, h: 1 };

describe('tour pictures', () => {
  it('prefers the thumbnail over the legacy slide', () => {
    const s = step({
      imageIndex: 0,
      tour: { anchor: 'dock.boards', action: 'click', thumbnail: thumb },
    });
    expect(tourPictureUrl(s, set)).toBe('https://img/t.png');
    expect(freshTourPictureUrl(s, set)).toBe('https://img/t.png');
  });

  it('falls back to the legacy still slide, never a video', () => {
    const tour = { anchor: 'dock.boards', action: 'click' } as const;
    expect(tourPictureUrl(step({ imageIndex: 0, tour }), set)).toBe(
      'https://img/0.png'
    );
    expect(freshTourPictureUrl(step({ tour }), set)).toBe('https://img/0.png');
    expect(tourPictureUrl(step({ imageIndex: 1, tour }), set)).toBeNull();
    expect(tourPictureUrl(step({ tour }), { imageUrls: [] })).toBeNull();
  });

  it('treats a thumbnail of another anchor as stale without falling back', () => {
    const s = step({
      imageIndex: 0,
      tour: { anchor: 'dock.other', action: 'click', thumbnail: thumb },
    });
    expect(tourPictureUrl(s, set)).toBe('https://img/t.png');
    expect(freshTourPictureUrl(s, set)).toBeNull();
  });
});
