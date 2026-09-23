const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

/** The Drive file id behind an `lh3.googleusercontent.com/d/{id}` slide URL. */
export function driveIdFromSlideUrl(url: string): string | null {
  if (hostOf(url) !== 'lh3.googleusercontent.com') return null;
  return /^\/d\/([^/?#=]+)/.exec(new URL(url).pathname)?.[1] ?? null;
}

/** The Storage object path behind a Firebase Storage download URL. */
export function storagePathFromSlideUrl(url: string): string | null {
  if (hostOf(url) !== 'firebasestorage.googleapis.com') return null;
  const encoded = /\/o\/([^?#]+)/.exec(new URL(url).pathname)?.[1];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/** What to queue for deletion when a slide image is replaced; never the shared TTS cache. */
export function slideMediaRef(
  url: string
): { storagePath: string } | { driveFileId: string } | null {
  const driveFileId = driveIdFromSlideUrl(url);
  if (driveFileId) return { driveFileId };
  const storagePath = storagePathFromSlideUrl(url);
  if (storagePath && !storagePath.startsWith('quiz_tts_cache/'))
    return { storagePath };
  return null;
}
