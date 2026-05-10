/**
 * YouTube Data API v3 search wrapper.
 *
 * Used by the Video Activity Creator's "discover" step to let teachers
 * search for videos by keyword and pick one. Search-on-Enter only — no
 * keystroke debounce — because each `search.list` call costs 100 quota
 * units and the default daily cap is 10k = 100 queries/day district-wide.
 * One unit per intentional query keeps a busy day under quota.
 *
 * The API key (`VITE_YOUTUBE_API_KEY`) MUST be referrer-restricted in the
 * Google Cloud Console to the production + preview origins. Without that
 * restriction, a leaked key is an open quota tap.
 */

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  /** URL of a medium-resolution (320x180) thumbnail. */
  thumbnailUrl: string;
  /** Duration in seconds, parsed from the videos.list contentDetails. */
  durationSeconds: number;
}

export class YouTubeKeyMissingError extends Error {
  constructor() {
    super(
      'YouTube search is not configured. The VITE_YOUTUBE_API_KEY environment variable is missing.'
    );
    this.name = 'YouTubeKeyMissingError';
  }
}

export class YouTubeQuotaError extends Error {
  constructor() {
    super(
      'YouTube search quota exceeded for the day. Try again tomorrow, or paste a video URL directly.'
    );
    this.name = 'YouTubeQuotaError';
  }
}

export class YouTubeSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YouTubeSearchError';
  }
}

/**
 * Parse an ISO 8601 duration (e.g. `PT4M13S`, `PT1H2M`) to total seconds.
 * Returns 0 for unparseable input.
 */
export function parseIsoDuration(iso: string): number {
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (
    (h ? parseInt(h, 10) * 3600 : 0) +
    (m ? parseInt(m, 10) * 60 : 0) +
    (s ? parseInt(s, 10) : 0)
  );
}

/**
 * Format a duration in seconds as `M:SS` (or `H:MM:SS` for ≥ 1h).
 * Used by the search-result card to show a runtime badge.
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

interface RawSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
}

interface RawVideoItem {
  id?: string;
  contentDetails?: { duration?: string };
}

interface RawSearchResponse {
  items?: RawSearchItem[];
  error?: { code?: number; errors?: { reason?: string }[]; message?: string };
}

interface RawVideosResponse {
  items?: RawVideoItem[];
  error?: { code?: number; errors?: { reason?: string }[]; message?: string };
}

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';

/**
 * Search YouTube for videos matching `query`. Returns up to `maxResults`
 * results (clamped 1–25; default 10). Two API calls total: search.list
 * for snippets, then videos.list for durations.
 */
export async function searchYouTube(
  query: string,
  maxResults: number = 10
): Promise<YouTubeSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const apiKey = String(
    (import.meta.env as Record<string, string | undefined>)
      .VITE_YOUTUBE_API_KEY ?? ''
  ).trim();
  if (apiKey.length === 0) {
    throw new YouTubeKeyMissingError();
  }

  const safeMax = Math.max(1, Math.min(25, Math.floor(maxResults)));

  // 1) Snippet search.
  const searchParams = new URLSearchParams({
    part: 'snippet',
    q: trimmed,
    type: 'video',
    maxResults: String(safeMax),
    key: apiKey,
    // Educational filter: prefer videos that are embeddable so they
    // actually load in our IFrame player.
    videoEmbeddable: 'true',
    safeSearch: 'strict',
  });

  let searchData: RawSearchResponse;
  try {
    const resp = await fetch(`${SEARCH_ENDPOINT}?${searchParams.toString()}`);
    searchData = (await (resp.json() as Promise<unknown>)) as RawSearchResponse;
    if (!resp.ok) {
      const reason = searchData.error?.errors?.[0]?.reason;
      // YouTube Data API v3 emits multiple distinct quota-exhaustion
      // reasons under HTTP 403. `quotaExceeded` is the project-wide one;
      // `dailyLimitExceeded` and `userRateLimitExceeded` cover per-day
      // and per-user rate caps. All three should surface the same
      // user-friendly "quota" message rather than the generic search-
      // failed copy.
      if (
        resp.status === 403 &&
        (reason === 'quotaExceeded' ||
          reason === 'dailyLimitExceeded' ||
          reason === 'userRateLimitExceeded')
      ) {
        throw new YouTubeQuotaError();
      }
      throw new YouTubeSearchError(
        searchData.error?.message ?? `YouTube search failed (${resp.status})`
      );
    }
  } catch (err) {
    if (
      err instanceof YouTubeQuotaError ||
      err instanceof YouTubeSearchError ||
      err instanceof YouTubeKeyMissingError
    ) {
      throw err;
    }
    throw new YouTubeSearchError(
      err instanceof Error ? err.message : 'YouTube search request failed.'
    );
  }

  const ids: string[] = (searchData.items ?? [])
    .map((it) => it.id?.videoId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (ids.length === 0) return [];

  // 2) Batch durations. Single call for all ids — costs 1 quota unit.
  const videosParams = new URLSearchParams({
    part: 'contentDetails',
    id: ids.join(','),
    key: apiKey,
  });
  let videosData: RawVideosResponse;
  try {
    const resp = await fetch(`${VIDEOS_ENDPOINT}?${videosParams.toString()}`);
    videosData = (await (resp.json() as Promise<unknown>)) as RawVideosResponse;
    if (!resp.ok) {
      const reason = videosData.error?.errors?.[0]?.reason;
      if (
        resp.status === 403 &&
        (reason === 'quotaExceeded' ||
          reason === 'dailyLimitExceeded' ||
          reason === 'userRateLimitExceeded')
      ) {
        throw new YouTubeQuotaError();
      }
      // Don't fail the whole search if duration lookup partially fails —
      // fall through with empty durations rather than blocking the picker.
      videosData = { items: [] };
    }
  } catch {
    videosData = { items: [] };
  }

  const durationById = new Map<string, number>();
  for (const item of videosData.items ?? []) {
    if (item.id && item.contentDetails?.duration) {
      durationById.set(item.id, parseIsoDuration(item.contentDetails.duration));
    }
  }

  return (searchData.items ?? [])
    .map((it): YouTubeSearchResult | null => {
      const videoId = it.id?.videoId;
      if (!videoId) return null;
      const snippet = it.snippet ?? {};
      return {
        videoId,
        title: snippet.title ?? '',
        channelTitle: snippet.channelTitle ?? '',
        thumbnailUrl:
          snippet.thumbnails?.medium?.url ??
          snippet.thumbnails?.default?.url ??
          '',
        durationSeconds: durationById.get(videoId) ?? 0,
      };
    })
    .filter((r): r is YouTubeSearchResult => r !== null);
}
