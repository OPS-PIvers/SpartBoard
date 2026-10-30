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

/** Untrusted: any server fetch of `url` must go through the SSRF guards (`ssrfGuard.ts`). */
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
