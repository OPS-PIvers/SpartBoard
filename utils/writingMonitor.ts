// The Writing monitor's class list (WRITING_ASSIGNMENT.md D15): who has started, word counts and time away.
import type {
  WritingResponse,
  WritingResponseStatus,
  WritingResponseSummary,
} from '@/types';
import type { StudentName } from '@/hooks/useAssignmentPseudonyms';
import { deriveWritingStatus } from '@/utils/writingResponseState';
import { lastFirst } from '@/utils/studentName';

const SUMMARY_NUMBERS = [
  'wordCount',
  'savedAt',
  'writingMs',
  'sessions',
  'pasteCount',
  'pastedChars',
  'untypedCount',
  'untypedChars',
  'awayMs',
  'awayCount',
] as const;

/** A student-written summary with every value a number; anything else reads as 0, or as absent for logStoppedAt. */
export function safeWritingSummary(
  raw: unknown
): WritingResponseSummary | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  const out = Object.fromEntries(
    SUMMARY_NUMBERS.map((k) => [k, num(r[k]) ?? 0])
  ) as Record<(typeof SUMMARY_NUMBERS)[number], number>;
  const stopped = num(r.logStoppedAt);
  const dictated = num(r.dictatedCount);
  return {
    ...out,
    ...(stopped === undefined ? {} : { logStoppedAt: stopped }),
    ...(dictated === undefined
      ? {}
      : { dictatedCount: dictated, dictatedChars: num(r.dictatedChars) ?? 0 }),
  };
}

/** A response doc as the teacher views read it, with its summary made safe. */
export function readWritingResponse(
  data: Record<string, unknown>,
  studentUid: string
): WritingResponse {
  return {
    ...data,
    studentUid,
    summary: safeWritingSummary(data.summary),
  } as WritingResponse;
}

export type WritingMonitorBucket = 'notStarted' | 'inProgress' | 'done';

export interface WritingMonitorRow {
  key: string;
  name: string;
  /** Sort key: family name, then given name; '' when unnamed. */
  sortName: string;
  bucket: WritingMonitorBucket;
  /** Null for a roster student with no response yet. */
  status: WritingResponseStatus | null;
  response: WritingResponse | null;
  wordCount: number;
  awayMs: number;
  awayCount: number;
  /** Client ms of the last save; null before the first. */
  savedAt: number | null;
  /** In progress with no save for this long; null otherwise. */
  idleMs: number | null;
}

/** Writing in progress with no save for 2 minutes reads as idle, as in Quiz. */
export const WRITING_IDLE_MS = 120_000;
/** A last save older than this reads as away from the piece, not idle, unless this tab saw it. */
export const WRITING_IDLE_WINDOW_MS = 30 * 60_000;

const bucketOf = (
  status: WritingResponseStatus,
  r: WritingResponse
): WritingMonitorBucket => {
  if (status === 'turned-in' || status === 'returned') return 'done';
  // Opened but nothing saved yet: still Not started.
  return (r.saveCount ?? 0) > 0 || (r.summary?.wordCount ?? 0) > 0
    ? 'inProgress'
    : 'notStarted';
};

const nameOf = (
  uid: string,
  names: Map<string, StudentName>
): { name: string; sortName: string } => {
  const n = names.get(uid);
  if (!n) return { name: 'Student', sortName: '' };
  const name = `${n.givenName} ${n.familyName}`.trim() || 'Student';
  return {
    name,
    sortName: lastFirst(n).toLowerCase(),
  };
};

/** Every response in the class, plus roster students who haven't opened it; sorted by last name. */
export function buildWritingMonitorRows(params: {
  responses: WritingResponse[];
  /** Names for every student the session reaches. */
  names: Map<string, StudentName>;
  /** Roster students to list as Not started when they have no response; already narrowed to the class. */
  rosterUids: Iterable<string>;
  /** Keep only responses from this class; '' keeps every class. */
  classId: string;
  now: number;
  /** When this tab saw each student's last save; beats the student's own clock. */
  seenAt?: Record<string, number>;
}): WritingMonitorRow[] {
  const { responses, names, rosterUids, classId, now, seenAt = {} } = params;
  const rows: WritingMonitorRow[] = [];
  const seen = new Set<string>();
  for (const r of responses) {
    seen.add(r.studentUid);
    if (classId && r.classId !== classId) continue;
    const status = deriveWritingStatus(r);
    const bucket = bucketOf(status, r);
    // The student's clock can be off, so it never reads as later than now.
    const seenSave = (r.saveCount ?? 0) > 0 ? seenAt[r.studentUid] : undefined;
    const savedAt =
      seenSave ??
      (typeof r.summary?.savedAt === 'number' && (r.saveCount ?? 0) > 0
        ? Math.min(r.summary.savedAt, now)
        : null);
    const since = savedAt ?? r.startedAt;
    rows.push({
      key: r.studentUid,
      ...nameOf(r.studentUid, names),
      bucket,
      status,
      response: r,
      wordCount: r.summary?.wordCount ?? 0,
      awayMs: r.summary?.awayMs ?? 0,
      awayCount: r.summary?.awayCount ?? 0,
      savedAt,
      // Work runs for days, so an old save is not idle: only one seen here or within the last half hour.
      idleMs:
        bucket === 'inProgress' &&
        typeof since === 'number' &&
        now - since > WRITING_IDLE_MS &&
        (seenSave != null || now - since < WRITING_IDLE_WINDOW_MS)
          ? now - since
          : null,
    });
  }
  for (const uid of rosterUids) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    rows.push({
      key: uid,
      ...nameOf(uid, names),
      bucket: 'notStarted',
      status: null,
      response: null,
      wordCount: 0,
      awayMs: 0,
      awayCount: 0,
      savedAt: null,
      idleMs: null,
    });
  }
  // Unnamed students (lookup still loading or failed) go last.
  return rows.sort(
    (a, b) =>
      Number(!a.sortName) - Number(!b.sortName) ||
      a.sortName.localeCompare(b.sortName) ||
      a.key.localeCompare(b.key)
  );
}

export function countWritingBuckets(
  rows: WritingMonitorRow[]
): Record<WritingMonitorBucket, number> {
  const counts = { notStarted: 0, inProgress: 0, done: 0 };
  for (const row of rows) counts[row.bucket] += 1;
  return counts;
}

/** "3 min ago", "just now"; minutes up to an hour, then hours. */
export function savedAgo(savedAt: number | null, now: number): string | null {
  if (savedAt == null) return null;
  const mins = Math.floor(Math.max(0, now - savedAt) / 60_000);
  if (mins < 1) return 'Saved just now';
  if (mins < 60) return `Saved ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Saved ${hours} hr ago`;
  return `Saved ${new Date(savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
