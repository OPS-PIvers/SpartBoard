// Server-only record of who ClassLink listed in a teacher's class, so results keep names after a student changes class.

import * as admin from './firebaseAdmin';
import axios from 'axios';
import {
  ClassLinkStudent,
  ONEROSTER_BASE,
  getOAuthHeaders,
} from './classlinkShared';

/** `classlink_class_members/{teacherUid}__{classId}`: `{ members: { [sourcedId]: lastSeenMs } }`. No client access. */
export const CLASS_MEMBERS_COLLECTION = 'classlink_class_members';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Only students seen in the class within this window are named after they leave. */
export const FORMER_MEMBER_WINDOW_MS = 400 * DAY_MS;
/** Cap on former students looked up per call, most recently seen first. */
export const MAX_FORMER_MEMBERS = 40;
/** The whole former-student lookup gives up after this, keeping what it found. */
export const FORMER_LOOKUP_BUDGET_MS = 6000;
const LOOKUP_CONCURRENCY = 8;

export type MemberMap = Record<string, number>;

/** Keyed per teacher, so a teacher is only ever named students they saw in their own class. */
export function classMembersDocId(teacherUid: string, classId: string): string {
  return `${teacherUid}__${encodeURIComponent(classId)}`;
}

function readMembers(raw: unknown): MemberMap {
  const out: MemberMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, at] of Object.entries(raw as Record<string, unknown>)) {
    if (id && typeof at === 'number' && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

/** Stamps for ids that are new or last seen a day or more ago; null when nothing needs writing. */
export function nextMembers(
  stored: MemberMap,
  seenIds: readonly string[],
  now: number
): MemberMap | null {
  const updates: MemberMap = {};
  for (const id of seenIds) {
    if (!id) continue;
    const prev = stored[id];
    if (prev === undefined || now - prev >= DAY_MS) updates[id] = now;
  }
  return Object.keys(updates).length > 0 ? updates : null;
}

/** Former members: stored, not enrolled now, seen within the window, newest first and capped. */
export function formerMemberIds(
  stored: MemberMap,
  currentIds: ReadonlySet<string>,
  now: number
): string[] {
  return Object.entries(stored)
    .filter(
      ([id, at]) => !currentIds.has(id) && now - at <= FORMER_MEMBER_WINDOW_MS
    )
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_FORMER_MEMBERS)
    .map(([id]) => id);
}

const docRef = (
  db: admin.firestore.Firestore,
  teacherUid: string,
  classId: string
) =>
  db
    .collection(CLASS_MEMBERS_COLLECTION)
    .doc(classMembersDocId(teacherUid, classId));

export async function loadClassMembers(
  db: admin.firestore.Firestore,
  teacherUid: string,
  classId: string
): Promise<MemberMap> {
  const snap = await docRef(db, teacherUid, classId).get();
  return readMembers(snap.get('members'));
}

/** Stamps `seenIds` as members of the teacher's class, field by field so concurrent writers never drop an entry. */
export async function recordClassMembers(
  db: admin.firestore.Firestore,
  teacherUid: string,
  classId: string,
  seenIds: readonly string[],
  now: number,
  stored?: MemberMap
): Promise<void> {
  if (!teacherUid || !classId || seenIds.length === 0) return;
  const known = stored ?? (await loadClassMembers(db, teacherUid, classId));
  const updates = nextMembers(known, seenIds, now);
  if (!updates) return;
  const members: Record<string, unknown> = { ...updates };
  for (const [id, at] of Object.entries(known)) {
    if (now - at > FORMER_MEMBER_WINDOW_MS && !(id in updates)) {
      members[id] = admin.firestore.FieldValue.delete();
    }
  }
  await docRef(db, teacherUid, classId).set(
    { members, updatedAt: now },
    { merge: true }
  );
}

/** Looks each former student up in OneRoster within one time budget; a student ClassLink no longer knows is left out. */
export async function fetchFormerStudents(
  ids: readonly string[],
  creds: {
    tenantUrl: string;
    classlinkClientId: string;
    classlinkClientSecret: string;
  },
  budgetMs: number = FORMER_LOOKUP_BUDGET_MS
): Promise<ClassLinkStudent[]> {
  const base = creds.tenantUrl.replace(/\/$/, '');
  const found: ClassLinkStudent[] = [];
  const queue = [...ids];
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), budgetMs);
  const lookup = async (id: string): Promise<void> => {
    const url = `${base}${ONEROSTER_BASE}/users/${encodeURIComponent(id)}`;
    try {
      const res = await axios.get<{
        user?: ClassLinkStudent & { role?: string };
      }>(url, {
        headers: getOAuthHeaders(
          url,
          {},
          'GET',
          creds.classlinkClientId,
          creds.classlinkClientSecret
        ),
        timeout: budgetMs,
        signal: abort.signal,
      });
      const user = res.data?.user;
      if (user?.sourcedId === id && user.role === 'student') found.push(user);
    } catch {
      // Best effort: a missing or slow lookup leaves that student unnamed.
    }
  };
  try {
    await Promise.all(
      Array.from(
        { length: Math.min(LOOKUP_CONCURRENCY, queue.length) },
        async () => {
          for (
            let id = queue.shift();
            id !== undefined && !abort.signal.aborted;
            id = queue.shift()
          ) {
            await lookup(id);
          }
        }
      )
    );
  } finally {
    clearTimeout(timer);
  }
  return found;
}
