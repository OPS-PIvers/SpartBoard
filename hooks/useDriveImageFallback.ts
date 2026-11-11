import { useContext, useEffect, useState } from 'react';
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
      // Not cached, so a refreshed token gets another try.
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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ for: string; url: string } | null>(
    null
  );

  const fileId = failedSrc === src ? lh3DriveFileId(src) : null;
  // Runs once per (failed src, token): a token that arrives or refreshes after the failure retries.
  useEffect(() => {
    if (!src || !fileId || !token) return;
    let cancelled = false;
    void downloadAsBlobUrl(fileId, token).then((url) => {
      if (!cancelled && url) setLoaded({ for: src, url });
    });
    return () => {
      cancelled = true;
    };
  }, [src, fileId, token]);

  const onError = () => {
    // The blob copy failing too ends it; the original link failing starts the fallback.
    if (src && loaded?.for !== src) setFailedSrc(src);
  };

  return { src: loaded?.for === src ? loaded.url : src, onError };
}

export const __resetDriveImageFallbackForTests = (): void => {
  blobUrls.clear();
};
