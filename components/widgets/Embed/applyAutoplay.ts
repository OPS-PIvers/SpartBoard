/**
 * Appends `?autoplay=1&mute=1` to YouTube embed URLs so the browser will
 * honor autoplay. Returns the original URL unchanged otherwise.
 *
 * Drive and Vids are intentionally excluded: their `/preview` endpoints
 * treat `?autoplay=1` as a privileged action and route the request through
 * `accounts.google.com` to verify the viewer. That redirect can't be framed
 * cross-origin, so the embed hangs. Without the autoplay param, Drive serves
 * the thumbnail anonymously and the user clicks play (which uses a
 * gesture-gated auth path that works inside the iframe).
 */
export function applyAutoplay(embedUrl: string, autoplay: boolean): string {
  if (!autoplay || !embedUrl) return embedUrl;
  try {
    const u = new URL(embedUrl);
    const host = u.hostname.toLowerCase();
    const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com');
    if (isYouTube) {
      u.searchParams.set('autoplay', '1');
      // YouTube requires mute=1 for reliable autoplay in most browsers
      u.searchParams.set('mute', '1');
    }
    return u.toString();
  } catch {
    return embedUrl;
  }
}
