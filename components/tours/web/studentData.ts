import type { NameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';

/** Hard kinds block publishing until redacted; `possible-name` only warns. */
export type StudentDataKind =
  'roster-name' | 'email' | 'id-number' | 'uuid' | 'possible-name';

export interface StudentDataHit {
  kind: StudentDataKind;
  start: number;
  end: number;
}

export const REDACTED = '•••';

/** Longest captured text kept from a page; the rest is cut. */
export const MAX_CAPTURED_TEXT = 120;

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// Student numbers (five or more digits) and phone numbers.
const ID_RE =
  /(?<![\p{L}\p{N}])(?:\d{5,}|\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4})(?![\p{L}\p{N}])/gu;
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
// "Last, First" or "Last, First M." as rosters and gradebooks print them.
const LAST_FIRST_RE =
  /(?<![\p{L}])\p{Lu}[\p{Ll}'-]+(?:[ -]\p{Lu}[\p{Ll}'-]+)?, \p{Lu}[\p{Ll}'-]+(?: \p{Lu}\.?)?(?![\p{L}])/gu;

const HARD: ReadonlySet<StudentDataKind> = new Set([
  'roster-name',
  'email',
  'id-number',
  'uuid',
]);

export const isHardHit = (hit: StudentDataHit): boolean => HARD.has(hit.kind);

const collect = (
  re: RegExp,
  text: string,
  kind: StudentDataKind
): StudentDataHit[] =>
  [...text.matchAll(re)].map((m) => ({
    kind,
    start: m.index,
    end: m.index + m[0].length,
  }));

// Words run together in ids and addresses: JaneSmith, jane_smith, jane-smith.
const TOKEN_RE = /[\p{L}\p{N}_-]{3,}/gu;
const spaced = (token: string) =>
  token
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

/** Whole tokens whose words, once split apart, contain a roster name. */
const joinedNameHits = (text: string, matcher: NameMatcher): StudentDataHit[] =>
  [...text.matchAll(TOKEN_RE)]
    .filter((m) => {
      const words = spaced(m[0]);
      return words !== m[0] && matcher.test(words);
    })
    .map((m) => ({
      kind: 'roster-name' as const,
      start: m.index,
      end: m.index + m[0].length,
    }));

/** Every span of `text` that looks like student data, earliest first, overlaps merged to the hardest kind. */
export function findStudentData(
  text: string,
  matcher: NameMatcher | null
): StudentDataHit[] {
  if (!text) return [];
  const hits: StudentDataHit[] = [
    ...(matcher
      ? [
          ...matcher.ranges(text).map(([start, end]) => ({
            kind: 'roster-name' as const,
            start,
            end,
          })),
          ...joinedNameHits(text, matcher),
        ]
      : []),
    ...collect(EMAIL_RE, text, 'email'),
    ...collect(UUID_RE, text, 'uuid'),
    ...collect(ID_RE, text, 'id-number'),
    ...collect(LAST_FIRST_RE, text, 'possible-name'),
  ].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: StudentDataHit[] = [];
  for (const hit of hits) {
    const last = out[out.length - 1];
    if (last && hit.start < last.end) {
      last.end = Math.max(last.end, hit.end);
      if (!isHardHit(last) && isHardHit(hit)) last.kind = hit.kind;
      continue;
    }
    out.push({ ...hit });
  }
  return out;
}

/** Text patterns the recorder blurs on the page before each picture. */
export interface PageBlurPatterns {
  emails: boolean;
  ids: boolean;
  lastFirst: boolean;
}

const words = (s: string) => new Set(s.split(' '));
// Greetings and sign-offs: "Hello, World", "Thanks, Everyone".
const LEADING = words(
  'hello hi hey dear thanks thank welcome yes no okay ok please sincerely cheers however also then today tomorrow yesterday'
);
// A phrase made only of these is calendar or UI text: "Monday, October", "Settings, Help".
const COMMON = words(
  'january february march april may june july august september october november december ' +
    'monday tuesday wednesday thursday friday saturday sunday spring summer fall winter ' +
    'home help settings search menu save cancel edit delete new open close more view add remove ' +
    'share print download upload submit done next back previous best regards wishes ' +
    'grade grades class classes course courses section unit lesson week period room ' +
    'teacher teachers student students parent parents assignment assignments quiz test exam ' +
    'math science english history reading writing art music spanish french health'
);
// "City, State" and "City, Country"; states that are common first names are left out.
const PLACES = words(
  'alabama alaska arizona arkansas california colorado connecticut delaware florida hawaii idaho ' +
    'illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota ' +
    'mississippi missouri montana nebraska nevada new north ohio oklahoma oregon pennsylvania rhode ' +
    'south tennessee texas utah vermont washington west wisconsin wyoming ' +
    'usa canada mexico england france spain italy germany china japan'
);

const looksLikeName = (match: string): boolean => {
  const [last, first] = match.split(',').map((p) =>
    p
      .trim()
      .toLowerCase()
      .split(/[\s-]+/)
  );
  const all = [...last, ...first].map((w) => w.replace(/\.$/, ''));
  if (LEADING.has(last[0]) || PLACES.has(first[0])) return false;
  return !all.every((w) => COMMON.has(w) || w.length <= 1);
};

// Wider than LAST_FIRST_RE: McDonald, O'Brien, LeBlanc and all-caps SMITH, JOHN.
const NAME_WORD = "\\p{Lu}[\\p{L}'’-]*\\p{L}";
const PAGE_LAST_FIRST_RE = new RegExp(
  `(?<![\\p{L}])${NAME_WORD}(?:[ -]${NAME_WORD})?, ${NAME_WORD}(?: \\p{Lu}\\.?)?(?![\\p{L}])`,
  'gu'
);

/** Spans of `text` to blur in a picture, by the patterns switched on; earliest first, overlaps merged. */
export function findPageBlurSpans(
  text: string,
  patterns: PageBlurPatterns
): { start: number; end: number }[] {
  if (!text) return [];
  const hits = [
    ...(patterns.emails ? collect(EMAIL_RE, text, 'email') : []),
    ...(patterns.ids
      ? [
          ...collect(UUID_RE, text, 'uuid'),
          ...collect(ID_RE, text, 'id-number'),
        ]
      : []),
    ...(patterns.lastFirst
      ? collect(PAGE_LAST_FIRST_RE, text, 'possible-name').filter((h) =>
          looksLikeName(text.slice(h.start, h.end))
        )
      : []),
  ].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: { start: number; end: number }[] = [];
  for (const { start, end } of hits) {
    const last = out[out.length - 1];
    if (last && start < last.end) last.end = Math.max(last.end, end);
    else out.push({ start, end });
  }
  return out;
}

/** Replaces every hit (or only hard ones) with the redaction mark. */
export function redactStudentData(
  text: string,
  hits: readonly StudentDataHit[],
  only: 'all' | 'hard' = 'all'
): string {
  let out = '';
  let at = 0;
  for (const hit of hits) {
    if (only === 'hard' && !isHardHit(hit)) continue;
    out += text.slice(at, hit.start) + REDACTED;
    at = hit.end;
  }
  return out + text.slice(at);
}

/** Captured page text, trimmed, cut to length and with emails, ids and uuids already removed. */
export function scrubCapturedText(
  raw: string | null | undefined,
  max = MAX_CAPTURED_TEXT
): string {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // Redact before cutting, so a cut never leaves part of an email or number behind.
  const clean = redactStudentData(text, findStudentData(text, null), 'hard');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  // Drop a word the cut split in two.
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

const WILD = '*';
const UUID_ONE = new RegExp(UUID_RE.source, 'iu');
// Opaque ids: Drive file ids, Classroom course ids, base64 tokens.
const OPAQUE_SEGMENT = /^[A-Za-z0-9_-]{16,}$/;

const wildcardSegment = (segment: string): string => {
  if (!segment || segment === WILD) return segment;
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Keep the raw segment; it is still checked below.
  }
  if (UUID_ONE.test(decoded))
    return decoded.replace(UUID_RE, WILD).replace(/\*+/g, WILD);
  if (
    OPAQUE_SEGMENT.test(decoded) &&
    (/\d/.test(decoded) || /[a-z]/.test(decoded) === /[A-Z]/.test(decoded))
  )
    return WILD;
  if (/@/.test(decoded)) return WILD;
  return segment.replace(/\d{2,}/g, WILD);
};

const wildcardPath = (path: string): string =>
  path.split('/').map(wildcardSegment).join('/');

const wildcardQuery = (search: string): string => {
  const params = new URLSearchParams(search);
  const keys = [...new Set([...params.keys()])].sort();
  return keys.length
    ? `?${keys.map((k) => `${encodeURIComponent(k)}=${WILD}`).join('&')}`
    : '';
};

/** Origin plus path with ids, digit runs and every query value turned into `*`; null for non-http(s) pages. */
export function toUrlPattern(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const query = wildcardQuery(url.search);
  // Hash routes (#/students/123) carry ids too.
  const hash = url.hash.startsWith('#/')
    ? `#${wildcardPath(url.hash.slice(1).split('?')[0])}`
    : '';
  return `${url.origin}${wildcardPath(url.pathname)}${query}${hash}`;
}

const LOCAL_BASE = 'https://relative.invalid';
/** Longest link pattern a locator carries, origin included; the recorder protocol refuses longer. */
export const MAX_HREF_PATTERN = 400;

/** A link's path with ids as `*`, no query or hash; origin kept only for another site. Null for non-http(s) links or past the cap. */
export function toHrefPattern(
  rawHref: string,
  pageUrl: string = LOCAL_BASE
): string | null {
  let url: URL;
  let page: URL;
  try {
    page = new URL(pageUrl);
    url = new URL(rawHref, page);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const path = wildcardPath(url.pathname);
  const pattern = url.origin === page.origin ? path : `${url.origin}${path}`;
  return pattern.length <= MAX_HREF_PATTERN ? pattern : null;
}
