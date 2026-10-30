// Send block list matching (docs/plans/IMPORT.md D16); copied into functions/src/import/shared.gen.ts.
import {
  IMPORT_MAX_BLOCK_PATTERNS,
  IMPORT_MAX_BLOCK_PATTERN_CHARS,
} from './contract';

/** D16 starting list: the student information system and Schoology's student-data pages. */
export const DEFAULT_SEND_BLOCK_PATTERNS: readonly string[] = [
  '*.infinitecampus.org',
  '*.schoology.com/course/*/gradebook*',
  '*.schoology.com/course/*/student_grades*',
  '*.schoology.com/course/*/members*',
  '*.schoology.com/course/*/attendance*',
  '*.schoology.com/course/*/mastery*',
  '*.schoology.com/grades*',
  '*.schoology.com/*submissions*',
  '*.schoology.com/*assessment_results*',
  '*.schoology.com/*dropbox*',
  '*.schoology.com/user/*',
  '*.schoology.com/enrollments*',
];

const HOST = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const PATH = /^\/[a-z0-9\-._~%!$&'()*+,;=:@/]*$/;

/**
 * A pattern as stored: `host` or `host/path`, lower case, no scheme. `*.example.org` is the domain and its subdomains;
 * `*` in the path matches anything, and the path must match the whole URL path. Query and hash are never matched.
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
  if (path && (!PATH.test(path) || path.includes('**'))) return null;
  return path === '/' ? host : host + path;
}

export const isValidBlockPattern = (raw: string): boolean =>
  normalizeBlockPattern(raw) !== null;

/** Linear-time glob match (`*` = any run), so no saved pattern can stall a check. */
function globMatch(glob: string, text: string): boolean {
  let g = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (g < glob.length && glob[g] !== '*' && glob[g] === text[t]) {
      g++;
      t++;
    } else if (g < glob.length && glob[g] === '*') {
      star = g++;
      mark = t;
    } else if (star >= 0) {
      g = star + 1;
      t = ++mark;
    } else return false;
  }
  while (g < glob.length && glob[g] === '*') g++;
  return g === glob.length;
}

function matchesPattern(pattern: string, host: string, path: string): boolean {
  const p = normalizeBlockPattern(pattern);
  if (!p) return false;
  const slash = p.indexOf('/');
  const pHost = slash < 0 ? p : p.slice(0, slash);
  const pPath = slash < 0 ? '' : p.slice(slash);
  const hostOk = pHost.startsWith('*.')
    ? host === pHost.slice(2) || host.endsWith(pHost.slice(1))
    : host === pHost;
  return hostOk && (!pPath || globMatch(pPath, path));
}

/** The raw path plus how a server may read it: percent-decoded, `;params` dropped, repeated slashes merged. */
function pathForms(raw: string): string[] {
  let decoded = raw;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      break;
    }
    if (next === decoded) break;
    decoded = next;
  }
  const forms = new Set<string>();
  for (const p of [raw, decoded]) {
    const lower = p.toLowerCase();
    forms.add(lower);
    forms.add(
      lower
        .replace(/;[^/]*/g, '')
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/')
    );
  }
  return [...forms];
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
  const host = u.hostname.toLowerCase().replace(/\.+$/, '');
  const paths = pathForms(u.pathname);
  return patterns.some((p) =>
    paths.some((path) => matchesPattern(p, host, path))
  );
}

/** The admin's saved list; the defaults when nothing is saved or nothing saved is valid. `[]` means block nothing. */
export function resolveBlockPatterns(raw: unknown): string[] {
  const saved =
    raw && typeof raw === 'object'
      ? (raw as { patterns?: unknown }).patterns
      : undefined;
  if (!Array.isArray(saved)) return [...DEFAULT_SEND_BLOCK_PATTERNS];
  const valid = saved
    .filter((p): p is string => typeof p === 'string')
    .map(normalizeBlockPattern)
    .filter((p): p is string => p !== null)
    .slice(0, IMPORT_MAX_BLOCK_PATTERNS);
  return saved.length > 0 && valid.length === 0
    ? [...DEFAULT_SEND_BLOCK_PATTERNS]
    : valid;
}
