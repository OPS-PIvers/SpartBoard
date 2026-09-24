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

/** Stamps the files a set owns: every Storage path it lists or shows, its slides' Drive ids, and only live thumbnails. */
export function withSlideFileRefs<
  T extends {
    imageUrls: string[];
    imagePaths?: string[];
    driveFileIds?: string[];
    slideThumbnails?: Record<string, string>;
  },
>(set: T): T {
  const {
    imagePaths: _paths,
    driveFileIds: _ids,
    slideThumbnails: _t,
    ...rest
  } = set;
  const thumbs = Object.fromEntries(
    set.imageUrls.flatMap((url) => {
      const thumb = set.slideThumbnails?.[url];
      return thumb ? [[url, thumb] as const] : [];
    })
  );
  const derivedPaths = [...set.imageUrls, ...Object.values(thumbs)].flatMap(
    (url) => {
      const ref = slideMediaRef(url);
      return ref && 'storagePath' in ref ? [ref.storagePath] : [];
    }
  );
  // Listed paths are kept: dropping one could let the sweep delete a file this set still uses.
  const imagePaths = [
    ...new Set([...(set.imagePaths ?? []), ...derivedPaths].filter(Boolean)),
  ];
  const driveFileIds = [
    ...new Set(
      set.imageUrls.flatMap((url) => {
        const id = driveIdFromSlideUrl(url);
        return id ? [id] : [];
      })
    ),
  ];
  return {
    ...rest,
    ...(imagePaths.length > 0 ? { imagePaths } : {}),
    ...(driveFileIds.length > 0 ? { driveFileIds } : {}),
    ...(Object.keys(thumbs).length > 0 ? { slideThumbnails: thumbs } : {}),
  } as T;
}
