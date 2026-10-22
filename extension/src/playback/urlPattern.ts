// `*` matches within one path segment or one query value; a pattern's query keys must be present, extra keys are ignored.
const globToRegExp = (glob: string, within: string) =>
  new RegExp(
    `^${glob
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join(`[^${within}]*`)}$`
  );

const trimSlash = (path: string) =>
  path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

function splitPattern(pattern: string): {
  origin: string;
  path: string;
  query: string;
  hash: string | null;
} | null {
  const m = /^(https?:\/\/[^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(pattern);
  if (!m) return null;
  return {
    origin: m[1].toLowerCase(),
    path: m[2] || '/',
    query: m[3]?.slice(1) ?? '',
    hash: m[4] ?? null,
  };
}

export function matchesUrlPattern(pattern: string, url: string): boolean {
  const p = splitPattern(pattern.trim());
  if (!p) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.origin.toLowerCase() !== p.origin) return false;
  if (!globToRegExp(trimSlash(p.path), '/').test(trimSlash(u.pathname))) {
    return false;
  }
  if (p.query) {
    for (const [key, value] of new URLSearchParams(p.query)) {
      const actual = u.searchParams.get(key);
      if (actual === null || !globToRegExp(value, '&').test(actual)) {
        return false;
      }
    }
  }
  if (p.hash !== null && !globToRegExp(p.hash, '').test(u.hash)) return false;
  return true;
}

/** The address a tour opens: the pattern with each wildcard dropped; null when the result isn't an https page. */
export function startUrlFromPattern(pattern: string): string | null {
  if (pattern.includes('*')) return null;
  try {
    const u = new URL(pattern);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
