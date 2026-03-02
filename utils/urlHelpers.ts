/**
 * Get the current origin URL safely, handling SSR contexts where window may be undefined.
 * @returns The origin URL (e.g., 'https://example.com') or an empty string if window is unavailable
 */
export const getOriginUrl = (): string => {
  return typeof window !== 'undefined' ? window.location.origin : '';
};

/**
 * Get the full join URL for students to access the live session.
 * @returns The join URL (e.g., 'https://example.com/join')
 */
export const getJoinUrl = (): string => {
  const origin = getOriginUrl();
  return origin ? `${origin}/join` : '/join';
};

/**
 * Converts various service URLs (YouTube, Google Docs/Slides/Sheets/Forms) to their embeddable counterparts.
 * @param url The original URL to convert
 * @returns The embeddable URL
 */
export const convertToEmbedUrl = (url: string): string => {
  if (!url) return '';
  const trimmedUrl = url.trim();

  // YouTube watch & short links
  const ytMatch =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(
      trimmedUrl
    );
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }

  // YouTube Live  (youtube.com/live/{id}  or  youtu.be/live/{id})
  const ytLiveMatch =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/live\/([a-zA-Z0-9_-]{11})/.exec(
      trimmedUrl
    );
  if (ytLiveMatch) {
    return `https://www.youtube.com/embed/${ytLiveMatch[1]}`;
  }

  // Google Drive file links  (drive.google.com/file/d/{id}/...)
  const driveFileMatch = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/.exec(
    trimmedUrl
  );
  if (driveFileMatch) {
    return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;
  }

  // Google Drive open links  (drive.google.com/open?id={id})
  const driveOpenMatch =
    /drive\.google\.com\/open\?(?:.*&)?id=([a-zA-Z0-9_-]+)/.exec(trimmedUrl);
  if (driveOpenMatch) {
    return `https://drive.google.com/file/d/${driveOpenMatch[1]}/preview`;
  }

  // Google Services
  if (trimmedUrl.includes('docs.google.com/')) {
    const fullUrlString = trimmedUrl.startsWith('http')
      ? trimmedUrl
      : `https://${trimmedUrl}`;
    try {
      const parsed = new URL(fullUrlString);

      // Google Docs
      if (
        parsed.hostname.includes('docs.google.com') &&
        parsed.pathname.includes('/document/')
      ) {
        const docIdMatch = /\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/.exec(
          parsed.pathname
        );
        if (docIdMatch) {
          const docId = docIdMatch[1];
          parsed.pathname = `/document/d/${docId}/edit`;
          parsed.searchParams.set('rm', 'minimal');

          // Extract tab parameter if present in original URL
          const tabMatch = /[?&]tab=([^&]+)/.exec(trimmedUrl);
          if (tabMatch) {
            parsed.searchParams.set('tab', tabMatch[1]);
          }

          return parsed.toString();
        }
      }

      // Google Slides
      if (
        parsed.hostname.includes('docs.google.com') &&
        parsed.pathname.includes('/presentation/')
      ) {
        const slideIdMatch =
          /\/presentation\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/.exec(
            parsed.pathname
          );
        if (slideIdMatch) {
          const slideId = slideIdMatch[1];
          parsed.pathname = `/presentation/d/${slideId}/preview`;
          parsed.search = '';
          parsed.hash = '';
          return parsed.toString();
        }
      }

      // Google Sheets
      if (
        parsed.hostname.includes('docs.google.com') &&
        parsed.pathname.includes('/spreadsheets/')
      ) {
        const sheetIdMatch =
          /\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/.exec(
            parsed.pathname
          );
        if (sheetIdMatch) {
          const sheetId = sheetIdMatch[1];
          parsed.pathname = `/spreadsheets/d/${sheetId}/preview`;
          return parsed.toString();
        }
      }

      // Google Forms
      if (
        parsed.hostname.includes('docs.google.com') &&
        parsed.pathname.includes('/forms/')
      ) {
        parsed.searchParams.set('embedded', 'true');
        return parsed.toString();
      }
    } catch (_e) {
      // Fallback if URL constructor fails
    }
  }

  return trimmedUrl;
};
