/**
 * Appends `&start=N` to YouTube embed URLs so the player begins at the given
 * offset (seconds). Returns the original URL unchanged otherwise.
 *
 * **Input contract:** the caller is expected to pass a URL that has already
 * been normalized through `convertToEmbedUrl()` — i.e. in
 * `https://www.youtube.com/embed/{id}` form. `youtu.be` short links and
 * `youtube.com/watch?v=` URLs are intentionally NOT matched here because:
 *   1. They never reach this helper in production — `convertToEmbedUrl`
 *      rewrites them to the `/embed/` form first (see Embed/Widget.tsx).
 *   2. The `?start=N` parameter is only honored by the embed player. Short
 *      links and the watch player use `?t=N` instead, so naively appending
 *      `?start=N` to those would produce a non-functional URL.
 *
 * Drive and Vids are intentionally excluded — same rationale as applyAutoplay.
 * Their `/preview` iframes don't honor any documented seek parameter.
 */
export function applyStartAt(
  embedUrl: string,
  startAtSeconds?: number
): string {
  if (!startAtSeconds || startAtSeconds <= 0 || !embedUrl) return embedUrl;
  try {
    const u = new URL(embedUrl);
    const host = u.hostname.toLowerCase();
    const isYouTubeHost =
      host === 'youtube.com' || host.endsWith('.youtube.com');
    // Require the embed path explicitly: the `start` query param is only
    // honored by `/embed/` URLs. Watch URLs and short links (`youtu.be`)
    // would silently ignore it, so we leave them unchanged rather than
    // producing a URL that looks valid but doesn't seek.
    if (!isYouTubeHost || !u.pathname.startsWith('/embed/')) return embedUrl;
    u.searchParams.set('start', String(Math.floor(startAtSeconds)));
    return u.toString();
  } catch {
    return embedUrl;
  }
}
