/**
 * MusicWidget YouTube/Spotify utilities.
 *
 * Re-exports from the shared @/utils/youtube module so the MusicWidget keeps
 * its existing import paths while the singleton is shared with VideoActivityWidget.
 */
export {
  loadYouTubeApi,
  extractYouTubeId,
  buildSpotifyEmbedUrl,
} from '@/utils/youtube';

export type { YTPlayer } from '@/utils/youtube';
