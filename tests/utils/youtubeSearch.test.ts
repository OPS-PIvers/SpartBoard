import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchYouTube,
  parseIsoDuration,
  formatDuration,
  YouTubeKeyMissingError,
  YouTubeQuotaError,
  YouTubeSearchError,
} from '@/utils/youtubeSearch';

describe('parseIsoDuration', () => {
  it('parses minute+second', () => {
    expect(parseIsoDuration('PT4M13S')).toBe(253);
  });

  it('parses hours+minutes', () => {
    expect(parseIsoDuration('PT1H2M')).toBe(3720);
  });

  it('parses seconds only', () => {
    expect(parseIsoDuration('PT45S')).toBe(45);
  });

  it('returns 0 for unparseable input', () => {
    expect(parseIsoDuration('garbage')).toBe(0);
    expect(parseIsoDuration('')).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats sub-hour as M:SS', () => {
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats >= 1h as H:MM:SS', () => {
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
});

describe('searchYouTube', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('VITE_YOUTUBE_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns empty array for empty/whitespace query', async () => {
    expect(await searchYouTube('')).toEqual([]);
    expect(await searchYouTube('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws YouTubeKeyMissingError when env var is empty', async () => {
    vi.stubEnv('VITE_YOUTUBE_API_KEY', '');
    await expect(searchYouTube('photosynthesis')).rejects.toBeInstanceOf(
      YouTubeKeyMissingError
    );
  });

  it('returns parsed results with durations from videos.list', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: { videoId: 'abc12345678' },
                snippet: {
                  title: 'Photosynthesis',
                  channelTitle: 'Crash Course',
                  thumbnails: {
                    medium: {
                      url: 'https://i.ytimg.com/vi/abc12345678/mqdefault.jpg',
                    },
                  },
                },
              },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: 'abc12345678',
                contentDetails: { duration: 'PT11M30S' },
              },
            ],
          }),
      });

    const results = await searchYouTube('photosynthesis');
    expect(results).toEqual([
      {
        videoId: 'abc12345678',
        title: 'Photosynthesis',
        channelTitle: 'Crash Course',
        thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/mqdefault.jpg',
        durationSeconds: 690,
      },
    ]);
  });

  it('falls back to default thumbnail when medium is absent', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: { videoId: 'abc12345678' },
                snippet: {
                  title: 't',
                  channelTitle: 'c',
                  thumbnails: { default: { url: 'https://example.com/t.jpg' } },
                },
              },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: [] }),
      });

    const results = await searchYouTube('q');
    expect(results[0].thumbnailUrl).toBe('https://example.com/t.jpg');
    expect(results[0].durationSeconds).toBe(0);
  });

  it('throws YouTubeQuotaError on 403 quotaExceeded', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          error: {
            code: 403,
            errors: [{ reason: 'quotaExceeded' }],
            message: 'quotaExceeded',
          },
        }),
    });
    await expect(searchYouTube('photosynthesis')).rejects.toBeInstanceOf(
      YouTubeQuotaError
    );
  });

  it('throws YouTubeSearchError on other failures', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: 'Bad request' } }),
    });
    await expect(searchYouTube('q')).rejects.toBeInstanceOf(YouTubeSearchError);
  });

  it('skips items without a videoId', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: {},
                snippet: { title: 'no id', channelTitle: 'x' },
              },
              {
                id: { videoId: 'abc12345678' },
                snippet: { title: 'good', channelTitle: 'x' },
              },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: [] }),
      });
    const results = await searchYouTube('q');
    expect(results).toHaveLength(1);
    expect(results[0].videoId).toBe('abc12345678');
  });

  it('clamps maxResults to 1..25', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items: [] }),
    });
    await searchYouTube('q', 1000);
    const firstCall = fetchMock.mock.calls[0][0] as string;
    expect(firstCall).toContain('maxResults=25');
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items: [] }),
    });
    await searchYouTube('q', -5);
    const nextCall = fetchMock.mock.calls[0][0] as string;
    expect(nextCall).toContain('maxResults=1');
  });

  it('does not block search on duration-fetch failure', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: { videoId: 'abc12345678' },
                snippet: { title: 't', channelTitle: 'c' },
              },
            ],
          }),
      })
      .mockRejectedValueOnce(new Error('network'));

    const results = await searchYouTube('q');
    expect(results).toHaveLength(1);
    expect(results[0].durationSeconds).toBe(0);
  });
});
