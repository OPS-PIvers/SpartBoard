// The Writing monitor's class list (WRITING_ASSIGNMENT.md D15): who has started, word counts and time away.
import type { WritingResponse, WritingResponseStatus } from '@/types';
import type { StudentName } from '@/hooks/useAssignmentPseudonyms';
import { deriveWritingStatus } from '@/utils/writingResponseState';

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
    sortName: `${n.familyName} ${n.givenName}`.trim().toLowerCase(),
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
}): WritingMonitorRow[] {
  const { responses, names, rosterUids, classId, now } = params;
  const rows: WritingMonitorRow[] = [];
  const seen = new Set<string>();
  for (const r of responses) {
    seen.add(r.studentUid);
    if (classId && r.classId !== classId) continue;
    const status = deriveWritingStatus(r);
    const bucket = bucketOf(status, r);
    const savedAt =
      typeof r.summary?.savedAt === 'number' && (r.saveCount ?? 0) > 0
        ? r.summary.savedAt
        : null;
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
      idleMs:
        bucket === 'inProgress' &&
        typeof since === 'number' &&
        now - since > WRITING_IDLE_MS
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
