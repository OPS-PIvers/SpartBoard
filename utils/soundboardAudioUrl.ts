import { extractGoogleFileId } from './urlHelpers';
import { DRIVE_API_URL, DriveSession } from './driveRequest';

const DRIVE_HOST = 'drive.google.com';
const DOCS_HOST = 'docs.google.com';

const toCanonicalDrivePlaybackUrl = (fileId: string): string =>
  `https://${DRIVE_HOST}/uc?id=${fileId}&export=download`;

/** Returns true when the URL points to a Google Drive / Docs host. */
export const isDriveUrl = (url: string): boolean => {
  try {
    const { hostname } = new URL(url.trim());
    return hostname === DRIVE_HOST || hostname === DOCS_HOST;
  } catch {
    return false;
  }
};

/** Extracts the Drive file ID from a Drive share/view/open URL. */
export const extractDriveAudioFileId = (url: string): string | null =>
  extractGoogleFileId(url);

/**
 * Downloads a Drive file via the authenticated API and returns a blob object
 * URL suitable for `new Audio(blobUrl)`.
 *
 * Callers are responsible for revoking the URL via `URL.revokeObjectURL()`
 * when playback finishes or on error.
 */
export const fetchDriveAudioBlobUrl = async (
  fileId: string,
  accessToken: string
): Promise<string> => {
  const response = await new DriveSession(accessToken).request(
    `${DRIVE_API_URL}/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Drive audio (${response.status}). Check sharing permissions.`
    );
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

/**
 * Normalizes a Google Drive URL to the canonical `uc?export=download` form.
 * Used as a fallback when no access token is available.
 */
export const normalizeSoundboardAudioUrl = (url: string): string => {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return '';

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return trimmedUrl;
  }

  if (parsedUrl.hostname !== DRIVE_HOST && parsedUrl.hostname !== DOCS_HOST) {
    return trimmedUrl;
  }

  const filePathMatch = /^\/file\/d\/([a-zA-Z0-9_-]+)/.exec(parsedUrl.pathname);
  if (filePathMatch) {
    return toCanonicalDrivePlaybackUrl(filePathMatch[1]);
  }

  if (parsedUrl.pathname === '/open') {
    const fileId = parsedUrl.searchParams.get('id');
    if (fileId) {
      return toCanonicalDrivePlaybackUrl(fileId);
    }
  }

  if (parsedUrl.pathname === '/uc') {
    const fileId = parsedUrl.searchParams.get('id');
    if (fileId) {
      return toCanonicalDrivePlaybackUrl(fileId);
    }
  }

  return trimmedUrl;
};
