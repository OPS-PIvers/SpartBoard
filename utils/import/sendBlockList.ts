// Send block list matching (docs/plans/IMPORT.md D16); copied into functions/src/import/shared.gen.ts.
import { IMPORT_MAX_BLOCK_PATTERN_CHARS } from './contract';

/** D16 starting list: the student information system and Schoology's student-data pages. */
export const DEFAULT_SEND_BLOCK_PATTERNS: readonly string[] = [
  '*.infinitecampus.org',
  '*.schoology.com/course/*/gradebook*',
  '*.schoology.com/course/*/student_grades*',
  '*.schoology.com/course/*/members*',
  '*.schoology.com/course/*/attendance*',
  '*.schoology.com/grades*',
  '*.schoology.com/*submissions*',
  '*.schoology.com/*/dropbox*',
];

const HOST = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const PATH = /^\/[a-z0-9\-._~%!$&'()*+,;=:@/]*$/;

/**
 * A pattern as stored: `host` or `host/path`, lower case, no scheme. `*.example.org` is the domain and its subdomains;
 * `*` in the path matches anything, and the path must match the whole URL path. Null when invalid.
 */
export function normalizeBlockPattern(raw: string): string | null {
  const p = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '');
  if (!p || p.length > IMPORT_MAX_BLOCK_PATTERN_CHARS) return null;
  const slash = p.indexOf('/');
  const host = slash < 0 ? p : p.slice(0, slash);
  const path = slash < 0 ? '' : p.slice(slash);
  if (!HOST.test(host)) return null;
  if (path && (!PATH.test(path) || /\*\*/.test(path))) return null;
  return path === '/' ? host : host + path;
}

export const isValidBlockPattern = (raw: string): boolean =>
  normalizeBlockPattern(raw) !== null;

const pathRegExp = (glob: string) =>
  new RegExp(
    `^${glob
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`
  );

function matchesPattern(pattern: string, host: string, path: string): boolean {
  const p = normalizeBlockPattern(pattern);
  if (!p) return false;
  const slash = p.indexOf('/');
  const pHost = slash < 0 ? p : p.slice(0, slash);
  const pPath = slash < 0 ? '' : p.slice(slash);
  const hostOk = pHost.startsWith('*.')
    ? host === pHost.slice(2) || host.endsWith(pHost.slice(1))
    : host === pHost;
  return hostOk && (!pPath || pathRegExp(pPath).test(path));
}

/** True when Send is refused on `url`; a URL that isn't http(s) is never sent, so it counts as blocked. */
export function isUrlBlocked(
  url: string,
  patterns: readonly string[]
): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return true;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const path = u.pathname.toLowerCase();
  return patterns.some((p) => matchesPattern(p, host, path));
}

/** The admin's saved list, or the defaults when nothing valid is saved. */
export function resolveBlockPatterns(raw: unknown): string[] {
  const saved =
    raw && typeof raw === 'object'
      ? (raw as { patterns?: unknown }).patterns
      : undefined;
  if (!Array.isArray(saved)) return [...DEFAULT_SEND_BLOCK_PATTERNS];
  return saved
    .filter((p): p is string => typeof p === 'string')
    .map(normalizeBlockPattern)
    .filter((p): p is string => p !== null);
}
