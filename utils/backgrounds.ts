/**
 * Returns true if the background value is an external URL or data URI
 * (i.e. an image, YouTube link, or Drive URL) rather than a Tailwind class string.
 */
export const isExternalBackground = (background: string): boolean =>
  background.startsWith('http') ||
  background.startsWith('data:') ||
  background.startsWith('blob:');
