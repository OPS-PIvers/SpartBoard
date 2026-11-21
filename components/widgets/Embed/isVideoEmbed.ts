const VIDEO_PLAYER_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'vids.google.com',
]);

const VIDEO_PLAYER_IN_HTML =
  /<iframe[^>]+src=["']?(?:https?:)?\/\/(?:www\.)?(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/i;

// Video players pick their quality from the iframe's real size, so a CSS zoom only blurs them.
export const isVideoEmbed = (
  mode: string,
  embedUrl: string,
  html: string
): boolean => {
  if (mode === 'code') return VIDEO_PLAYER_IN_HTML.test(html);
  try {
    return VIDEO_PLAYER_HOSTS.has(new URL(embedUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
};
