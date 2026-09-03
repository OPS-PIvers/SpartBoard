import { convertToEmbedUrl } from '@/utils/urlHelpers';
import type { HelpEmbedType } from '@/types/helpCenter';

export const HELP_IFRAME_SANDBOX =
  'allow-scripts allow-forms allow-popups allow-same-origin';

// https-only guard for admin-entered embed URLs.
export const isAllowedHelpUrl = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

// Infers the display kind for an embed URL; unrecognized URLs are 'other'.
export const inferHelpEmbedType = (url: string): HelpEmbedType => {
  const trimmed = url.trim();
  let host = '';
  let path = '';
  try {
    const parsed = new URL(trimmed);
    host = parsed.hostname;
    path = parsed.pathname;
  } catch {
    return 'other';
  }
  if (host.includes('youtube.com') || host.includes('youtu.be'))
    return 'youtube';
  if (host === 'docs.google.com') {
    if (path.startsWith('/document')) return 'doc';
    if (path.startsWith('/presentation')) return 'slides';
    if (path.startsWith('/spreadsheets')) return 'sheet';
  }
  if (host === 'drive.google.com' && path.includes('/file')) return 'drive';
  if (path.toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'other';
};

// 'other' is an arbitrary admin-entered host: never pair allow-same-origin with allow-scripts there.
export const helpIframeSandbox = (embedType: HelpEmbedType | null): string =>
  embedType === 'other'
    ? 'allow-scripts allow-forms allow-popups'
    : HELP_IFRAME_SANDBOX;

// Delegates to the shared converter; callers compare the result to the input to decide whether to render an iframe or an open-in-new-tab card.
export const toHelpEmbedSrc = (url: string): string => convertToEmbedUrl(url);
