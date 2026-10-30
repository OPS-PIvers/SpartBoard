// Generated from utils/import/ by tests/importSharedCopy.test.ts; rerun it with UPDATE_IMPORT_SHARED_COPY=1.
// Import shared contract (docs/plans/IMPORT.md); copied into functions/src/import/shared.gen.ts.

/** D29 preview flag gating Import, drop-to-import and the any-page Send. */
export const UNIVERSAL_IMPORT_FEATURE = 'universal-import';

/** `users/{uid}/import_inbox/{id}`: server-written Sends; the owner reads, then deletes. */
export const IMPORT_INBOX_COLLECTION = 'import_inbox';
export const IMPORT_INBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const IMPORT_MAX_INBOX_ITEMS = 200;

/** D18 `import_reader_failures/{id}`: server-written, admins read. */
export const IMPORT_READER_FAILURES_COLLECTION = 'import_reader_failures';
export const IMPORT_READER_FAILURE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** D16 `admin_settings/{id}`: `{ patterns: string[], updatedAt, updatedBy }`; missing means the defaults. */
export const IMPORT_SEND_BLOCK_LIST_DOC = 'import_send_block_list';
export const IMPORT_MAX_BLOCK_PATTERNS = 200;
export const IMPORT_MAX_BLOCK_PATTERN_CHARS = 300;

/** D28: AI Conversions queued per import before the teacher has to continue. */
export const MAX_AI_CONVERSIONS_PER_IMPORT = 25;

// Send caps, checked by the server.
export const IMPORT_MAX_URL_CHARS = 2048;
export const IMPORT_MAX_TITLE_CHARS = 500;
export const IMPORT_MAX_BLOCKS = 2000;
export const IMPORT_MAX_BLOCK_CHARS = 20_000;
export const IMPORT_MAX_TEXT_CHARS = 400_000;
export const IMPORT_MAX_TABLE_ROWS = 500;
export const IMPORT_MAX_TABLE_CELLS = 20;
export const IMPORT_MAX_IMAGES = 200;
export const IMPORT_MAX_REASON_CHARS = 500;

/** Platform reader id: `generic` for the article read, else the reader's id (`schoology`, `google-forms`, ...). */
export const IMPORT_PLATFORM_ID = /^[a-z0-9-]{1,40}$/;
export const GENERIC_PLATFORM = 'generic';

/** Everything Import can turn a Source into (D2). */
export type ImportTarget =
  | 'quiz'
  | 'questionBank'
  | 'flashcards'
  | 'notebook'
  | 'guidedLearning'
  | 'activityWall'
  | 'board'
  | 'videoActivity'
  | 'miniApp'
  | 'rubric'
  | 'poll'
  | 'embed'
  | 'pdf'
  | 'links'
  | 'sticker';

export const IMPORT_TARGETS: readonly ImportTarget[] = [
  'quiz',
  'questionBank',
  'flashcards',
  'notebook',
  'guidedLearning',
  'activityWall',
  'board',
  'videoActivity',
  'miniApp',
  'rubric',
  'poll',
  'embed',
  'pdf',
  'links',
  'sticker',
];

/** Plain text only, never HTML; a table's rows are maps because Firestore has no nested arrays. */
export type ImportBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph' | 'listItem' | 'quote'; text: string }
  | { type: 'table'; rows: { cells: string[] }[] };

export interface ImportImage {
  url: string;
  alt?: string;
}

/** D18: the Platform reader that fell back to the generic read, and why. */
export interface ImportReaderFailure {
  platform: string;
  reason: string;
}

/** Body of `importInboxV1` (D14). */
export interface ImportSendRequest {
  url: string;
  title: string;
  platform: string;
  /** True when the teacher had text selected and only the selection was read. */
  selectionOnly: boolean;
  blocks: ImportBlock[];
  images: ImportImage[];
  readerFailure?: ImportReaderFailure;
}

/** A stored Send, `users/{uid}/import_inbox/{id}`; `expireAt` (a Timestamp) drives the TTL. */
export interface ImportInboxItem extends Omit<
  ImportSendRequest,
  'readerFailure'
> {
  id: string;
  receivedAt: number;
}

/** `importStatusV1` reply: whether the extension shows Send, and where it must not. */
export interface ImportStatusReply {
  enabled: boolean;
  hasAccount: boolean;
  /** Empty when `enabled` is false. */
  blockPatterns: string[];
}

/** `importInboxV1` reply. */
export interface ImportSendReply {
  id: string;
  blocks: number;
  images: number;
}

/** D7: stored as `importedFrom` on a Library item made by Import; teacher only. */
export interface ImportAttribution {
  sourceUrl: string;
  sourceTitle: string;
  platform?: string;
  importedAt: number;
}

// Send block list matching (docs/plans/IMPORT.md D16); copied into functions/src/import/shared.gen.ts.

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
