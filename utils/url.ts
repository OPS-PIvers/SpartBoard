/**
 * Extract the YouTube video ID from any standard YouTube URL format.
 * Returns null if the URL is not a recognisable YouTube link.
 */
export const extractYouTubeId = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/
  );
  return match ? match[1] : null;
};
