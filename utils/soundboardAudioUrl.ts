const DRIVE_HOST = 'drive.google.com';
const DOCS_HOST = 'docs.google.com';

const toCanonicalDrivePlaybackUrl = (fileId: string): string =>
  `https://${DRIVE_HOST}/uc?id=${fileId}&export=download`;

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
