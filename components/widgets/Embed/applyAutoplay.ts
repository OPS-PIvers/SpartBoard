/**
 * Appends `?autoplay=1` to embed URLs for supported video hosts.
 * For YouTube, also appends `mute=1` to satisfy browser autoplay policies.
 * Returns the original URL unchanged for unsupported hosts or when autoplay is off.
 */
export function applyAutoplay(embedUrl: string, autoplay: boolean): string {
  if (!autoplay || !embedUrl) return embedUrl;
  try {
    const u = new URL(embedUrl);
    const host = u.hostname.toLowerCase();
    const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com');
    const supportsAutoplay =
      isYouTube ||
      host === 'drive.google.com' ||
      host.endsWith('.drive.google.com') ||
      host === 'vids.google.com' ||
      host.endsWith('.vids.google.com');
    if (supportsAutoplay) {
      u.searchParams.set('autoplay', '1');
      // YouTube requires mute=1 for reliable autoplay in most browsers
      if (isYouTube) {
        u.searchParams.set('mute', '1');
      }
    }
    return u.toString();
  } catch {
    return embedUrl;
  }
}
