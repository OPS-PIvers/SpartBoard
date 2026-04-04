/**
 * MusicWidget YouTube/Spotify utilities.
 *
 * Compatibility re-exports for MusicWidget imports that still use this module:
 * `loadYouTubeApi`, `buildSpotifyEmbedUrl`, and the `YTPlayer` type are
 * re-exported from the shared `@/utils/youtube` module.
 *
 * Helpers that are not re-exported here, including `extractYouTubeId`, should
 * be imported directly from `@/utils/youtube`.
 */
export { loadYouTubeApi, buildSpotifyEmbedUrl } from '@/utils/youtube';

export type { YTPlayer } from '@/utils/youtube';
