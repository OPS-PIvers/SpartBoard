import { describe, expect, it } from 'vitest';
import type { MusicStation } from '@/types';
import { parseYouTubeVideoId, resolveActiveStation } from './mySongs';

const ID = 'jfKfPfyJRdk';

describe('parseYouTubeVideoId', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?list=x&v=${ID}&t=30`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `  https://youtu.be/${ID}  `,
  ])('reads %s', (url) => {
    expect(parseYouTubeVideoId(url)).toBe(ID);
  });

  it.each([
    '',
    'not a link',
    `https://evil.example/watch?v=${ID}`,
    `https://evil.example/?u=youtube.com/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/playlist?list=PL123',
    `javascript:alert('youtu.be/${ID}')`,
  ])('rejects %s', (url) => {
    expect(parseYouTubeVideoId(url)).toBeNull();
  });
});

describe('resolveActiveStation', () => {
  const curated: MusicStation = {
    id: 'c1',
    title: 'Curated',
    channel: 'Admin',
    url: `https://www.youtube.com/watch?v=${ID}`,
    thumbnail: '',
    color: '#000',
    isActive: true,
    order: 0,
  };
  const mySong = {
    id: 'm1',
    title: 'Mine',
    channel: 'Me',
    url: `https://www.youtube.com/watch?v=${ID}`,
    thumbnail: 'ignored',
  };

  it('prefers an admin station with the selected id', () => {
    expect(
      resolveActiveStation([curated], { stationId: 'c1', mySong })?.title
    ).toBe('Curated');
  });

  it('falls back to the copied song when it is the selected one', () => {
    const station = resolveActiveStation([curated], {
      stationId: 'm1',
      mySong,
    });
    expect(station?.title).toBe('Mine');
    expect(station?.thumbnail).toBe(
      `https://img.youtube.com/vi/${ID}/hqdefault.jpg`
    );
  });

  it('ignores a stale or unsafe copied song', () => {
    expect(
      resolveActiveStation([], { stationId: 'other', mySong })
    ).toBeUndefined();
    expect(
      resolveActiveStation([], {
        stationId: 'm1',
        mySong: { ...mySong, url: 'https://evil.example/' },
      })
    ).toBeUndefined();
    expect(
      resolveActiveStation([], { stationId: '', mySong: null })
    ).toBeUndefined();
  });
});
