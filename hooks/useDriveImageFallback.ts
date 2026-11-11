import { useCallback, useContext, useState } from 'react';
import { AuthContext } from '@/context/AuthContextValue';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const LH3_DRIVE_URL =
  /^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)(?:=[\w-]*)?$/;

// One download per file per tab; the blob URLs live as long as the page.
const blobUrls = new Map<string, Promise<string | null>>();

/** The Drive file id behind an `lh3.googleusercontent.com/d/{id}` image link. */
export const lh3DriveFileId = (url: string | undefined): string | null =>
  url ? (LH3_DRIVE_URL.exec(url.trim())?.[1] ?? null) : null;

const downloadAsBlobUrl = (
  fileId: string,
  token: string
): Promise<string | null> => {
  const cached = blobUrls.get(fileId);
  if (cached) return cached;
  const pending = fetch(
    `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
    .then(async (res) => {
      if (!res.ok) throw new Error(`Drive image fetch ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return null;
      return URL.createObjectURL(blob);
    })
    .catch((err: unknown) => {
      // Let a later attempt (say, after the token refreshes) try again.
      blobUrls.delete(fileId);
      console.warn('[DriveImage] Fallback download failed:', err);
      return null;
    });
  blobUrls.set(fileId, pending);
  return pending;
};

/** When a domain-shared lh3 Drive image fails (it needs third-party Google cookies), reload it through the Drive API with the teacher's token. */
export function useDriveImageFallback(src: string | undefined): {
  src: string | undefined;
  onError: () => void;
} {
  const token = useContext(AuthContext)?.googleAccessToken ?? null;
  const [fallback, setFallback] = useState<{
    for: string;
    url: string | null;
  } | null>(null);

  const onError = useCallback(() => {
    const fileId = lh3DriveFileId(src);
    if (!src || !fileId || !token) return;
    // Already tried for this src (or the blob URL itself failed): stop here.
    if (fallback?.for === src) return;
    setFallback({ for: src, url: null });
    void downloadAsBlobUrl(fileId, token).then((url) => {
      if (url) setFallback({ for: src, url });
    });
  }, [src, token, fallback]);

  const active = fallback?.for === src ? fallback.url : null;
  return { src: active ?? src, onError };
}

export const __resetDriveImageFallbackForTests = (): void => {
  blobUrls.clear();
};
