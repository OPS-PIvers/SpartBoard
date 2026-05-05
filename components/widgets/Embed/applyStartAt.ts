/**
 * Appends `&start=N` to YouTube embed URLs so the player begins at the given
 * offset (seconds). Returns the original URL unchanged otherwise.
 *
 * Drive and Vids are intentionally excluded — same rationale as applyAutoplay.
 * Their `/preview` iframes don't honor any documented seek parameter, so the
 * value would silently be ignored. Hiding the field in the admin editor for
 * non-YouTube hosts keeps the UI honest; this guard is a defense-in-depth
 * fallback in case stale config flows in.
 */
export function applyStartAt(
  embedUrl: string,
  startAtSeconds?: number
): string {
  if (!startAtSeconds || startAtSeconds <= 0 || !embedUrl) return embedUrl;
  try {
    const u = new URL(embedUrl);
    const host = u.hostname.toLowerCase();
    const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com');
    if (!isYouTube) return embedUrl;
    u.searchParams.set('start', String(Math.floor(startAtSeconds)));
    return u.toString();
  } catch {
    return embedUrl;
  }
}
