// Turns a support into a URL that shows inside the quiz's side panel.
import type { QuizSupport } from '@/types';

const DOCS_RE =
  /^\/(document|presentation|spreadsheets|forms|drawings)\/d\/([A-Za-z0-9_-]+)/;

/** Embeddable https URL for a link or Drive support, or null when it can't be shown safely. */
export function embeddableSupportUrl(support: QuizSupport): string | null {
  if (support.kind === 'text') return null;
  if (support.kind === 'drive')
    return `https://drive.google.com/file/d/${encodeURIComponent(support.fileId)}/preview`;
  let url: URL;
  try {
    url = new URL(support.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host === 'docs.google.com') {
    const m = DOCS_RE.exec(url.pathname);
    if (m && m[1] !== 'forms')
      return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
  }
  if (host === 'drive.google.com') {
    const m = /^\/file\/d\/([A-Za-z0-9_-]+)/.exec(url.pathname);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  }
  const yt =
    host === 'youtu.be'
      ? url.pathname.slice(1)
      : host === 'www.youtube.com' || host === 'youtube.com'
        ? url.pathname === '/watch'
          ? url.searchParams.get('v')
          : null
        : null;
  if (yt && /^[A-Za-z0-9_-]{6,20}$/.test(yt))
    return `https://www.youtube-nocookie.com/embed/${yt}`;
  return url.toString();
}
