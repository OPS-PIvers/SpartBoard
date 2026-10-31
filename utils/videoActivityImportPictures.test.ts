import { describe, expect, it, vi } from 'vitest';
import {
  copyLessonPictures,
  MAX_IMPORT_PICTURES,
} from './videoActivityImportPictures';
import type { ImportVideoLesson } from '@/utils/import/contract';

const lesson = (images: string[]): ImportVideoLesson => ({
  youtubeId: 'WjqqUjDkh1c',
  stops: images.map((image, i) => ({
    kind: 'note' as const,
    time: i,
    text: 'n',
    image,
  })),
});

const deps = () => {
  const fetchImage = vi.fn((url: string) =>
    Promise.resolve(
      url.includes('broken')
        ? null
        : { blob: new Blob(['x']), contentType: 'image/png' }
    )
  );
  let n = 0;
  const upload = vi.fn(() =>
    Promise.resolve({ driveFileId: `drive-file-${++n}`, url: '' })
  );
  return { fetchImage, uploader: { upload, remove: vi.fn() } };
};

describe('copyLessonPictures', () => {
  it('copies each picture once and counts the ones that fail', async () => {
    const d = deps();
    const out = await copyLessonPictures(
      lesson([
        'https://a.example/1.png',
        'https://a.example/1.png',
        'https://a.example/broken.png',
      ]),
      d
    );
    expect(d.fetchImage).toHaveBeenCalledTimes(2);
    expect([...out.byUrl]).toEqual([
      ['https://a.example/1.png', 'drive-file-1'],
    ]);
    expect(out.failed).toBe(1);
  });

  it('leaves pictures past the cap out', async () => {
    const d = deps();
    const urls = Array.from(
      { length: MAX_IMPORT_PICTURES + 2 },
      (_, i) => `https://a.example/${i}.png`
    );
    const out = await copyLessonPictures(lesson(urls), d);
    expect(out.byUrl.size).toBe(MAX_IMPORT_PICTURES);
    expect(out.failed).toBe(2);
  });
});
