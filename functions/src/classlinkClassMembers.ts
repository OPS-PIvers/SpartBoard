// Server-only record of who ClassLink listed in each class, so results keep names after a student changes class.

import * as admin from './firebaseAdmin';
import axios from 'axios';
import {
  CLASSLINK_TIMEOUT_MS,
  ClassLinkStudent,
  ONEROSTER_BASE,
  getOAuthHeaders,
} from './classlinkShared';

/** `classlink_class_members/{classId}`: `{ members: { [sourcedId]: lastSeenMs } }`. No client access. */
export const CLASS_MEMBERS_COLLECTION = 'classlink_class_members';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Only students seen in the class within this window are named after they leave. */
export const FORMER_MEMBER_WINDOW_MS = 400 * DAY_MS;
/** Cap on former students looked up per call, most recently seen first. */
export const MAX_FORMER_MEMBERS = 60;
const LOOKUP_CONCURRENCY = 5;

export type MemberMap = Record<string, number>;

function readMembers(raw: unknown): MemberMap {
  const out: MemberMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, at] of Object.entries(raw as Record<string, unknown>)) {
    if (id && typeof at === 'number' && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

/** The members map to write, or null when every id was already seen within a day (no write needed). */
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

export async function loadClassMembers(
  db: admin.firestore.Firestore,
  classId: string
): Promise<MemberMap> {
  const snap = await db.collection(CLASS_MEMBERS_COLLECTION).doc(classId).get();
  return readMembers(snap.get('members'));
}

/** Stamps `seenIds` as current members of `classId`; skips the write when nothing is new. */
export async function recordClassMembers(
  db: admin.firestore.Firestore,
  classId: string,
  seenIds: readonly string[],
  now: number,
  stored?: MemberMap
): Promise<void> {
  if (!classId || seenIds.length === 0) return;
  const known = stored ?? (await loadClassMembers(db, classId));
  const updates = nextMembers(known, seenIds, now);
  if (!updates) return;
  // Rewritten whole so entries past the window drop off and the doc stays small.
  const members: MemberMap = {};
  for (const [id, at] of Object.entries({ ...known, ...updates })) {
    if (now - at <= FORMER_MEMBER_WINDOW_MS) members[id] = at;
  }
  await db
    .collection(CLASS_MEMBERS_COLLECTION)
    .doc(classId)
    .set({ members, updatedAt: now });
}

/** Looks each former student up in OneRoster; a student ClassLink no longer knows is left out. */
export async function fetchFormerStudents(
  ids: readonly string[],
  creds: {
    tenantUrl: string;
    classlinkClientId: string;
    classlinkClientSecret: string;
  }
): Promise<ClassLinkStudent[]> {
  const base = creds.tenantUrl.replace(/\/$/, '');
  const found: ClassLinkStudent[] = [];
  const queue = [...ids];
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
        timeout: CLASSLINK_TIMEOUT_MS,
      });
      const user = res.data?.user;
      if (user?.sourcedId === id && (!user.role || user.role === 'student')) {
        found.push(user);
      }
    } catch (err) {
      if (!axios.isAxiosError(err) || err.response?.status !== 404) {
        console.warn(
          '[classlinkClassMembers] former student lookup failed:',
          axios.isAxiosError(err) ? err.response?.status : 'unexpected'
        );
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(LOOKUP_CONCURRENCY, queue.length) },
      async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          await lookup(id);
        }
      }
    )
  );
  return found;
}
