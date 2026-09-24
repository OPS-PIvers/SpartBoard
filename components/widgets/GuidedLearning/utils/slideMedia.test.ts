import { describe, expect, it } from 'vitest';
import { withSlideFileRefs } from './slideMedia';
import { pickThumbnailUrl, thumbnailUrl } from '@/utils/guidedLearningMedia';

const storageUrl = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(path)}?alt=media&token=t`;

describe('withSlideFileRefs', () => {
  it('lists Storage paths, keeps already-listed ones, and skips the TTS cache', () => {
    const out = withSlideFileRefs({
      imageUrls: [
        storageUrl('users/u/hotspot_images/1-a.webp'),
        storageUrl('quiz_tts_cache/x.mp3'),
        'https://lh3.googleusercontent.com/d/drive-a',
      ],
      imagePaths: ['', 'users/u/hotspot_images/0-old.webp'],
      driveFileIds: [] as string[],
    });
    expect(out.imagePaths).toEqual([
      'users/u/hotspot_images/0-old.webp',
      'users/u/hotspot_images/1-a.webp',
    ]);
    expect(out.driveFileIds).toEqual(['drive-a']);
  });

  it('lists step audio, video and recorded narration, but not the TTS cache', () => {
    const out = withSlideFileRefs({
      imageUrls: [],
      imagePaths: [] as string[],
      steps: [
        { audioStoragePath: 'users/u/hotspot_images/a.mp3' },
        { videoUrl: storageUrl('users/u/hotspot_images/v.mp4') },
        {
          narration: {
            url: storageUrl('quiz_tts_cache/n.mp3'),
            storagePath: 'quiz_tts_cache/n.mp3',
          },
        },
        {
          narration: {
            url: storageUrl('users/u/hotspot_images/take.webm'),
            storagePath: 'users/u/hotspot_images/take.webm',
          },
        },
      ],
    });
    expect(out.imagePaths).toEqual([
      'users/u/hotspot_images/a.mp3',
      'users/u/hotspot_images/v.mp4',
      'users/u/hotspot_images/take.webm',
    ]);
  });

  it('omits empty fields rather than writing empty arrays', () => {
    const out = withSlideFileRefs({
      imageUrls: ['https://example.com/a.png'],
      driveFileIds: ['stale'],
      slideThumbnails: {},
    });
    expect(out).toEqual({ imageUrls: ['https://example.com/a.png'] });
  });
});

describe('thumbnails', () => {
  it('sizes Drive slides to 400px and prefers a stored thumbnail', () => {
    const drive = 'https://lh3.googleusercontent.com/d/abc';
    expect(thumbnailUrl(drive)).toBe(`${drive}=w400`);
    expect(thumbnailUrl(`${drive}=w400`)).toBe(`${drive}=w400`);
    expect(thumbnailUrl('https://s/slide', { 'https://s/slide': 'T' })).toBe(
      'T'
    );
    expect(thumbnailUrl('https://s/other')).toBe('https://s/other');
  });

  it('picks the first image slide’s thumbnail for the library card', () => {
    expect(
      pickThumbnailUrl({
        imageUrls: ['v.mp4', 'https://s/img'],
        imageKinds: ['video', 'image'],
        slideThumbnails: { 'https://s/img': 'https://s/thumb' },
      })
    ).toBe('https://s/thumb');
  });
});
