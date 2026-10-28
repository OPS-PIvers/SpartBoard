import type { MusicConfig, MusicStation, MySong } from '@/types';

export const MY_SONGS_LIMIT = 50;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The video id of a pasted YouTube link, or null when it isn't one. */
export const parseYouTubeVideoId = (input: string): string | null => {
  let url: URL;
  try {
    const raw = input.trim();
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = url.pathname.split('/');
    if (first === 'watch') id = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(first)) id = second;
  }
  return id && VIDEO_ID.test(id) ? id : null;
};

export const canonicalYouTubeUrl = (id: string) =>
  `https://www.youtube.com/watch?v=${id}`;

export const youTubeThumbnail = (id: string) =>
  `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

/** Title and channel from YouTube's oEmbed; 'unavailable' when YouTube says it can't be embedded, null when unreachable. */
export const fetchYouTubeDetails = async (
  id: string
): Promise<{ title?: string; channel: string } | 'unavailable' | null> => {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalYouTubeUrl(id))}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if ([400, 401, 403, 404].includes(res.status)) return 'unavailable';
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null) return null;
    const { title, author_name: channel } = data as Record<string, unknown>;
    return {
      title:
        typeof title === 'string' && title.trim()
          ? title.trim().slice(0, 200)
          : undefined,
      channel: typeof channel === 'string' ? channel.trim().slice(0, 200) : '',
    };
  } catch {
    return null;
  }
};

/** The widget-config copy of a song (no createdAt). */
export const toConfigSong = ({
  id,
  title,
  channel,
  url,
  thumbnail,
}: MySong): NonNullable<MusicConfig['mySong']> => ({
  id,
  title,
  channel,
  url,
  thumbnail,
});

/** The admin station the widget points at, else the teacher's own song copied into its config. */
export const resolveActiveStation = (
  stations: MusicStation[],
  config: Pick<MusicConfig, 'stationId' | 'mySong'>
): MusicStation | undefined => {
  const curated = stations.find((s) => s.id === config.stationId);
  if (curated) return curated;
  const song = config.mySong;
  if (!song || !config.stationId || song.id !== config.stationId)
    return undefined;
  const videoId = parseYouTubeVideoId(song.url);
  if (!videoId) return undefined;
  return {
    id: song.id,
    title: song.title,
    channel: song.channel,
    url: canonicalYouTubeUrl(videoId),
    thumbnail: youTubeThumbnail(videoId),
    color: '',
    isActive: true,
    order: 0,
  };
};
