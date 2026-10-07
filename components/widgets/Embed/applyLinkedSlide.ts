// Matches Google's own `slide=id.<objectId>` (query or hash) from a copied Slides link.
const LINKED_SLIDE = /[?#&]slide=(id\.[A-Za-z0-9_-]+)/;

/** Opens a Google Slides `/preview` embed on the slide named in the link the teacher pasted. */
export function applyLinkedSlide(
  embedUrl: string,
  originalUrl: string,
  enabled: boolean
): string {
  if (!enabled || !embedUrl || !originalUrl) return embedUrl;
  const slide = LINKED_SLIDE.exec(originalUrl)?.[1];
  if (!slide) return embedUrl;
  try {
    const u = new URL(embedUrl);
    if (
      u.hostname.toLowerCase() !== 'docs.google.com' ||
      !/^\/presentation\/d\/[A-Za-z0-9_-]+\/preview$/.test(u.pathname)
    ) {
      return embedUrl;
    }
    // Google's own links carry the slide in both places, so mirror that.
    u.searchParams.set('slide', slide);
    u.hash = `slide=${slide}`;
    return u.toString();
  } catch {
    return embedUrl;
  }
}
