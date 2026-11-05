import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchYouTubeDetails } from './mySongs';

describe('fetchYouTubeDetails clipping', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not leave half an emoji when clipping long titles and channels', async () => {
    const long = 'a'.repeat(199) + '😀tail';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ title: long, author_name: long }),
      })
    );
    const res = await fetchYouTubeDetails('abc');
    expect(res).not.toBeNull();
    const d = res as { title?: string; channel: string };
    expect(d.title).toBe('a'.repeat(199));
    expect(d.channel).toBe('a'.repeat(199));
  });
});
