// Focus allowlist parsing and matching (docs/plans/CHROME_EXTENSION.md F9); copied into functions/src/focus/shared.gen.ts.
import {
  FOCUS_ALWAYS_ALLOWED_HOSTS,
  FOCUS_MAX_SITES,
  type FocusSite,
} from './contract';

const GOOGLE_FILE_HOSTS = new Set([
  'docs.google.com',
  'drive.google.com',
  'classroom.google.com',
  'sites.google.com',
  'jamboard.google.com',
]);

// Docs editors and Drive files: everything after the file id (/edit, /view, /preview, ...) is the same file.
const GOOGLE_FILE_PATH =
  /^(\/(?:document|spreadsheets|presentation|drawings)\/d\/[^/]+|\/forms\/d\/(?:e\/)?[^/]+|\/file\/d\/[^/]+)(?:\/|$)/;

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function cleanHost(raw: string): string | null {
  let host = raw.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every((l) => HOST_LABEL.test(l)))
    return null;
  // A bare number host is an IP address; sessions allow named sites only.
  if (labels.every((l) => /^\d+$/.test(l))) return null;
  return host;
}

/** Path in the form matching uses: Google's /u/N/ account segment dropped, Google file paths cut at the file id, no trailing '/'. */
export function canonicalFocusPath(host: string, rawPath: string): string {
  // Both sides come from URL.pathname, so percent-encoding already agrees; never decode (that would widen a prefix).
  let path = rawPath.replace(/\/{2,}/g, '/');
  if (GOOGLE_FILE_HOSTS.has(host)) {
    path = path.replace(/\/u\/\d+(?=\/|$)/g, '');
    const file = GOOGLE_FILE_PATH.exec(path);
    if (file) path = file[1];
  }
  path = path.replace(/\/+$/, '');
  return path === '' || path === '/' ? '' : path;
}

/** Parses what a teacher typed ("desmos.com", "https://docs.google.com/document/d/abc/edit") into a site, or null. */
export function parseFocusSite(input: string): FocusSite | null {
  const text = input.trim().replace(/^\*\./, '');
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text)
    ? text
    : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = cleanHost(url.hostname);
  if (!host) return null;
  return { host, path: canonicalFocusPath(host, url.pathname) };
}

/** True for a well-formed stored site: what parseFocusSite would return for it. */
export function isFocusSite(value: unknown): value is FocusSite {
  if (!value || typeof value !== 'object') return false;
  const { host, path } = value as Record<string, unknown>;
  if (typeof host !== 'string' || typeof path !== 'string') return false;
  const parsed = parseFocusSite(`https://${host}${path}`);
  return parsed?.host === host && parsed.path === path;
}

/** Drops invalid and duplicate sites and caps the list at FOCUS_MAX_SITES. */
export function normalizeFocusSites(values: readonly unknown[]): FocusSite[] {
  const out: FocusSite[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isFocusSite(value)) continue;
    const key = `${value.host}${value.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ host: value.host, path: value.path });
    if (out.length >= FOCUS_MAX_SITES) break;
  }
  return out;
}

function hostCovers(entryHost: string, host: string): boolean {
  return host === entryHost || host.endsWith(`.${entryHost}`);
}

function pathCovers(entryPath: string, path: string): boolean {
  return (
    entryPath === '' || path === entryPath || path.startsWith(`${entryPath}/`)
  );
}

export type FocusUrlVerdict = 'allowed' | 'blocked' | 'not-web';

/** Checks a top-level address against a session's sites; `alwaysAllowedOrigins` are the listing's SpartBoard origins (D5). */
export function matchFocusUrl(
  address: string,
  sites: readonly FocusSite[],
  alwaysAllowedOrigins: readonly string[] = []
): FocusUrlVerdict {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return 'not-web';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'not-web';
  if (alwaysAllowedOrigins.includes(url.origin)) return 'allowed';
  const rawHost = url.hostname.toLowerCase().replace(/\.$/, '');
  if (FOCUS_ALWAYS_ALLOWED_HOSTS.includes(rawHost)) return 'allowed';
  const host = rawHost.startsWith('www.') ? rawHost.slice(4) : rawHost;
  const path = canonicalFocusPath(host, url.pathname);
  return sites.some((s) => hostCovers(s.host, host) && pathCovers(s.path, path))
    ? 'allowed'
    : 'blocked';
}
