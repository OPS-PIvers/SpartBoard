import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import axios from 'axios';
import './functionsInit';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from './secrets';
import { chunk } from './shared';
import {
  ALLOWED_ORIGINS,
  ONEROSTER_BASE,
  computeStudentUid,
  getOAuthHeaders,
  type ClassLinkStudent,
} from './classlinkShared';
import { isRevokedMemberStatus, isSiteWideAdmin } from './authz';
import { assertViewAsAllowed } from './viewAsGuard';

// Admin-only drill-down behind the Active Students KPIs: teachers come from assignments opened; names come live from ClassLink.

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const IN_CHUNK = 10;
const IN_QUERY_MAX = 30;
const CLASSLINK_CONCURRENCY = 12;
const PAGE_LIMIT = 200;
const MAX_PAGES = 10;
const API_TIMEOUT_MS = 20000;
const QUERY_CONCURRENCY = 8;
// Lookups stop starting new work at these marks so the call returns inside the client's 110s timeout.
const NAME_LOOKUP_BUDGET_MS = 55000;
const QUERY_BUDGET_MS = 35000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const PARTIAL_CACHE_TTL_MS = 60 * 1000;
const NAME_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ORG_WIDE_ROLE_IDS = new Set(['super_admin', 'domain_admin']);

export interface ActiveStudentInput {
  uid: string;
  sectionIds: string[];
  lastSignInMs: number;
}

export interface ActiveStudentRow {
  name: string;
  teachers: { name: string; lastOpenedMs: number }[];
  lastSignInMs: number;
}

/** Students whose last sign-in falls in the rolling 30-day window, newest first. */
export function selectMonthlyActive(
  students: readonly ActiveStudentInput[],
  now: number
): ActiveStudentInput[] {
  return students
    .filter((s) => s.lastSignInMs > 0 && now - s.lastSignInMs <= MONTH_MS)
    .sort((a, b) => b.lastSignInMs - a.lastSignInMs);
}

/** Sections to fetch from ClassLink: a greedy cover of the unnamed students first, then the rest as fallbacks. */
export function orderSectionsForNameLookup(
  students: readonly ActiveStudentInput[],
  rosteredSections: ReadonlySet<string>,
  named: ReadonlySet<string> = new Set()
): string[] {
  const members = new Map<string, Set<string>>();
  for (const s of students) {
    if (named.has(s.uid)) continue;
    for (const id of s.sectionIds) {
      if (!rosteredSections.has(id)) continue;
      const set = members.get(id) ?? new Set<string>();
      set.add(s.uid);
      members.set(id, set);
    }
  }
  const byCount = [...members.entries()]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([id]) => id);
  const covered = new Set<string>();
  const cover: string[] = [];
  const left = new Set(byCount);
  for (;;) {
    let best = '';
    let bestGain = 0;
    for (const id of left) {
      let gain = 0;
      for (const uid of members.get(id) ?? []) if (!covered.has(uid)) gain += 1;
      if (gain > bestGain || (gain === bestGain && gain > 0 && id < best)) {
        best = id;
        bestGain = gain;
      }
    }
    if (bestGain === 0) break;
    cover.push(best);
    left.delete(best);
    for (const uid of members.get(best) ?? []) covered.add(uid);
  }
  return [...cover, ...byCount.filter((id) => left.has(id))];
}

// Student records that mark opening or submitting an assignment, keyed by the student's auth uid.
interface OpenSource {
  group: 'responses' | 'submissions';
  sessions: string;
  studentField: string;
  timeField: string;
}

export const OPEN_SOURCES: readonly OpenSource[] = [
  {
    group: 'responses',
    sessions: 'quiz_sessions',
    studentField: 'studentUid',
    timeField: 'joinedAt',
  },
  {
    group: 'responses',
    sessions: 'video_activity_sessions',
    studentField: 'studentUid',
    timeField: 'joinedAt',
  },
  {
    group: 'responses',
    sessions: 'guided_learning_sessions',
    studentField: 'studentAnonymousId',
    timeField: 'startedAt',
  },
  {
    group: 'submissions',
    sessions: 'mini_app_sessions',
    studentField: 'studentUid',
    timeField: 'submittedAt',
  },
  {
    group: 'submissions',
    sessions: 'activity_wall_sessions',
    studentField: 'authorUid',
    timeField: 'submittedAt',
  },
];

export interface AssignmentOpen {
  studentUid: string;
  teacherUid: string;
  openedMs: number;
}

/** Latest open per (student, teacher). */
export function latestOpensByStudent(
  opens: readonly AssignmentOpen[]
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const o of opens) {
    const byTeacher = out.get(o.studentUid) ?? new Map<string, number>();
    byTeacher.set(
      o.teacherUid,
      Math.max(byTeacher.get(o.teacherUid) ?? 0, o.openedMs)
    );
    out.set(o.studentUid, byTeacher);
  }
  return out;
}

export function buildActiveStudentRows(input: {
  students: readonly ActiveStudentInput[];
  opensByStudent: ReadonlyMap<string, ReadonlyMap<string, number>>;
  teacherNames: ReadonlyMap<string, string>;
  namesByUid: ReadonlyMap<string, string>;
}): ActiveStudentRow[] {
  return input.students.map((s) => {
    const byName = new Map<string, number>();
    for (const [teacherUid, openedMs] of input.opensByStudent.get(s.uid) ??
      []) {
      const name = input.teacherNames.get(teacherUid);
      if (!name) continue;
      byName.set(name, Math.max(byName.get(name) ?? 0, openedMs));
    }
    return {
      name: input.namesByUid.get(s.uid) ?? '',
      teachers: [...byName.entries()]
        .map(([name, lastOpenedMs]) => ({ name, lastOpenedMs }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      lastSignInMs: s.lastSignInMs,
    };
  });
}

async function collectAssignmentOpens(
  db: admin.firestore.Firestore,
  studentUids: readonly string[],
  sectionIds: readonly string[],
  sinceMs: number,
  deadline: number
): Promise<{ opens: AssignmentOpen[]; partial: boolean }> {
  const wanted = new Set(studentUids);
  let partial = false;
  const outOfTime = () => {
    if (Date.now() < deadline) return false;
    partial = true;
    return true;
  };
  const hits: {
    studentUid: string;
    sessionRef: admin.firestore.DocumentReference;
    openedMs: number;
  }[] = [];
  const settle = (label: string) => (err: unknown) => {
    partial = true;
    console.error(`[getActiveStudentsV1] ${label} query failed:`, errCode(err));
  };
  const jobs = OPEN_SOURCES.flatMap((src) =>
    chunk(studentUids, IN_QUERY_MAX).map((ids) => ({ src, ids }))
  );
  await mapWithConcurrency(jobs, QUERY_CONCURRENCY, async ({ src, ids }) => {
    if (outOfTime()) return;
    await db
      .collectionGroup(src.group)
      .where(src.studentField, 'in', ids)
      .where(src.timeField, '>=', sinceMs)
      .select(src.studentField, src.timeField)
      .get()
      .then((snap) => {
        for (const doc of snap.docs) {
          const sessionRef = doc.ref.parent.parent;
          if (sessionRef?.parent.id !== src.sessions) continue;
          const uid: unknown = doc.get(src.studentField);
          const at: unknown = doc.get(src.timeField);
          if (typeof uid !== 'string' || typeof at !== 'number') continue;
          hits.push({ studentUid: uid, sessionRef, openedMs: at });
        }
      }, settle(src.sessions));
  });
  // Flashcard progress is keyed by uid alone, so find sessions for these students' sections and read their recent progress.
  const flashcardSessions = new Map<
    string,
    admin.firestore.DocumentReference
  >();
  await mapWithConcurrency(
    chunk([...new Set(sectionIds)], IN_QUERY_MAX),
    QUERY_CONCURRENCY,
    async (ids) => {
      if (outOfTime()) return;
      await db
        .collection('flashcard_sessions')
        .where('classIds', 'array-contains-any', ids)
        .select()
        .get()
        .then((snap) => {
          for (const d of snap.docs) flashcardSessions.set(d.ref.path, d.ref);
        }, settle('flashcard_sessions'));
    }
  );
  await mapWithConcurrency(
    [...flashcardSessions.values()],
    QUERY_CONCURRENCY,
    async (sessionRef) => {
      if (outOfTime()) return;
      await sessionRef
        .collection('progress')
        .where('lastActiveAt', '>=', sinceMs)
        .select('lastActiveAt')
        .get()
        .then((progress) => {
          for (const doc of progress.docs) {
            const at: unknown = doc.get('lastActiveAt');
            if (!wanted.has(doc.id) || typeof at !== 'number') continue;
            hits.push({ studentUid: doc.id, sessionRef, openedMs: at });
          }
        }, settle('flashcard progress'));
    }
  );

  const sessionRefs = new Map<string, admin.firestore.DocumentReference>();
  for (const h of hits) sessionRefs.set(h.sessionRef.path, h.sessionRef);
  const teacherBySession = new Map<string, string>();
  for (const refs of chunk([...sessionRefs.values()], 300)) {
    if (outOfTime()) break;
    const docs = await db
      .getAll(...refs, { fieldMask: ['teacherUid'] })
      .catch((err: unknown) => {
        settle('session teacher')(err);
        return [];
      });
    for (const d of docs) {
      const teacherUid: unknown = d.get('teacherUid');
      if (typeof teacherUid === 'string' && teacherUid) {
        teacherBySession.set(d.ref.path, teacherUid);
      }
    }
  }
  const opens = hits.flatMap((h) => {
    const teacherUid = teacherBySession.get(h.sessionRef.path);
    return teacherUid
      ? [{ studentUid: h.studentUid, teacherUid, openedMs: h.openedMs }]
      : [];
  });
  return { opens, partial };
}

function errCode(err: unknown): unknown {
  if (axios.isAxiosError(err)) return err.response?.status ?? err.code;
  return (err as { code?: unknown } | null)?.code ?? 'unexpected';
}

interface ActiveStudentsResult {
  asOf: number;
  partial: boolean;
  students: ActiveStudentRow[];
}

// Per-instance caches so reopening the modal doesn't repeat the full fan-out, and names found by an unfinished walk carry over.
const resultCache = new Map<string, ActiveStudentsResult>();
const nameCache = new Map<string, { name: string; at: number }>();
const inFlight = new Map<string, Promise<ActiveStudentsResult>>();

async function assertOrgWideAdmin(
  db: admin.firestore.Firestore,
  orgId: string,
  emailLower: string
): Promise<void> {
  const [adminDoc, memberDoc] = await Promise.all([
    db.collection('admins').doc(emailLower).get(),
    db.doc(`organizations/${orgId}/members/${emailLower}`).get(),
  ]);
  if (
    adminDoc.exists &&
    (await isSiteWideAdmin(
      db,
      emailLower,
      adminDoc.get('roleId'),
      adminDoc.get('orgId')
    ))
  )
    return;
  const roleId: unknown = memberDoc.exists ? memberDoc.get('roleId') : null;
  if (
    typeof roleId === 'string' &&
    ORG_WIDE_ROLE_IDS.has(roleId) &&
    !isRevokedMemberStatus(memberDoc.get('status'))
  )
    return;
  throw new HttpsError(
    'permission-denied',
    'Only district admins can view the student list.'
  );
}

export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (next < items.length) {
        const item = items[next];
        next += 1;
        await fn(item);
      }
    })()
  );
  await Promise.all(workers);
}

export const getActiveStudentsV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
      STUDENT_PSEUDONYM_HMAC_SECRET,
    ],
    invoker: 'public',
  },
  async (request) => {
    assertViewAsAllowed(request, { read: true });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const email = request.auth.token.email;
    if (
      typeof email !== 'string' ||
      !email ||
      request.auth.token.email_verified !== true ||
      request.auth.token.studentRole === true
    ) {
      throw new HttpsError('permission-denied', 'Admin account required.');
    }
    const raw = request.data as { orgId?: unknown } | undefined;
    const orgId = typeof raw?.orgId === 'string' ? raw.orgId.trim() : '';
    if (!orgId || orgId.includes('/')) {
      throw new HttpsError('invalid-argument', 'orgId is required.');
    }

    const db = admin.firestore();
    await assertOrgWideAdmin(db, orgId, email.toLowerCase());

    const now = Date.now();
    const cached = resultCache.get(orgId);
    const ttl = cached?.partial ? PARTIAL_CACHE_TTL_MS : CACHE_TTL_MS;
    if (cached && now - cached.asOf < ttl) return cached;
    resultCache.delete(orgId);
    const running = inFlight.get(orgId);
    if (running) return running;
    const job = computeActiveStudents(db, orgId, now).finally(() =>
      inFlight.delete(orgId)
    );
    inFlight.set(orgId, job);
    return job;
  }
);

async function computeActiveStudents(
  db: admin.firestore.Firestore,
  orgId: string,
  now: number
): Promise<ActiveStudentsResult> {
  for (const [uid, hit] of nameCache) {
    if (now - hit.at >= NAME_CACHE_TTL_MS) nameCache.delete(uid);
  }
  const queryDeadline = now + QUERY_BUDGET_MS;
  const deadline = now + NAME_LOOKUP_BUDGET_MS;
  const snap = await db
    .collection('student_sections')
    .where('orgId', '==', orgId)
    .select('updatedAt', 'sectionIds')
    .get();
  const active = selectMonthlyActive(
    snap.docs.map((d) => {
      const at: unknown = d.get('updatedAt');
      const ids: unknown = d.get('sectionIds');
      return {
        uid: d.id,
        lastSignInMs: typeof at === 'number' ? at : 0,
        sectionIds: Array.isArray(ids)
          ? ids.filter((x): x is string => typeof x === 'string' && !!x)
          : [],
      };
    }),
    now
  );
  const allSections = [...new Set(active.flatMap((s) => s.sectionIds))];

  // Teachers and names don't depend on each other, so both run at once.
  const [teachers, names] = await Promise.all([
    loadTeachers(db, active, allSections, now - MONTH_MS, queryDeadline),
    loadNames(db, active, allSections, queryDeadline, deadline),
  ]);

  const result: ActiveStudentsResult = {
    asOf: now,
    partial: teachers.partial || names.partial,
    students: buildActiveStudentRows({
      students: active,
      opensByStudent: teachers.opensByStudent,
      teacherNames: teachers.teacherNames,
      namesByUid: names.namesByUid,
    }),
  };
  // Unfinished results expire after a minute, so a later open fills more names from nameCache.
  resultCache.set(orgId, result);
  return result;
}

async function loadTeachers(
  db: admin.firestore.Firestore,
  active: readonly ActiveStudentInput[],
  allSections: readonly string[],
  sinceMs: number,
  queryDeadline: number
): Promise<{
  partial: boolean;
  opensByStudent: Map<string, Map<string, number>>;
  teacherNames: Map<string, string>;
}> {
  const collected = await collectAssignmentOpens(
    db,
    active.map((s) => s.uid),
    allSections,
    sinceMs,
    queryDeadline
  );
  let partial = collected.partial;
  const teacherNames = new Map<string, string>();
  const teacherUids = [...new Set(collected.opens.map((o) => o.teacherUid))];
  for (const ids of chunk(teacherUids, 100)) {
    const result = await admin
      .auth()
      .getUsers(ids.map((uid) => ({ uid })))
      .catch(() => {
        partial = true;
        return null;
      });
    for (const u of result?.users ?? []) {
      teacherNames.set(u.uid, u.displayName || u.email || '');
    }
  }
  return {
    partial,
    opensByStudent: latestOpensByStudent(collected.opens),
    teacherNames,
  };
}

async function loadNames(
  db: admin.firestore.Firestore,
  active: readonly ActiveStudentInput[],
  allSections: readonly string[],
  queryDeadline: number,
  deadline: number
): Promise<{ partial: boolean; namesByUid: Map<string, string> }> {
  let partial = false;
  const namesByUid = new Map<string, string>();
  // Sections that teachers imported as rosters; only students in one get a name.
  const rosteredSections = new Set<string>();
  await mapWithConcurrency(
    chunk(allSections, IN_CHUNK),
    QUERY_CONCURRENCY,
    async (ids) => {
      if (Date.now() >= queryDeadline) {
        partial = true;
        return;
      }
      await db
        .collectionGroup('rosters')
        .where('classlinkClassId', 'in', ids)
        .select('classlinkClassId')
        .get()
        .then(
          (rs) => {
            for (const doc of rs.docs) {
              const sectionId: unknown = doc.get('classlinkClassId');
              if (typeof sectionId === 'string') {
                rosteredSections.add(sectionId);
              }
            }
          },
          (err: unknown) => {
            partial = true;
            console.error(
              '[getActiveStudentsV1] rosters query failed:',
              errCode(err)
            );
          }
        );
    }
  );

  for (const s of active) {
    const hit = nameCache.get(s.uid);
    if (hit && s.sectionIds.some((id) => rosteredSections.has(id))) {
      namesByUid.set(s.uid, hit.name);
    }
  }
  const unnamed = active.filter((s) => !namesByUid.has(s.uid));
  if (unnamed.length === 0) return { partial, namesByUid };

  const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
  const clientId = CLASSLINK_CLIENT_ID.value();
  const clientSecret = CLASSLINK_CLIENT_SECRET.value();
  const tenantUrl = CLASSLINK_TENANT_URL.value().replace(/\/$/, '');
  if (!hmacSecret || !clientId || !clientSecret || !tenantUrl) {
    return { partial: true, namesByUid };
  }
  const wanted = new Set(unnamed.map((s) => s.uid));
  const sections = orderSectionsForNameLookup(unnamed, rosteredSections);
  await mapWithConcurrency(
    sections,
    CLASSLINK_CONCURRENCY,
    async (sectionId) => {
      const covers = unnamed.some(
        (s) => !namesByUid.has(s.uid) && s.sectionIds.includes(sectionId)
      );
      if (!covers) return;
      if (Date.now() >= deadline) {
        partial = true;
        return;
      }
      const url = `${tenantUrl}${ONEROSTER_BASE}/classes/${encodeURIComponent(sectionId)}/students`;
      try {
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0) {
            partial = true;
            break;
          }
          const params = {
            limit: String(PAGE_LIMIT),
            offset: String(page * PAGE_LIMIT),
          };
          const headers = getOAuthHeaders(
            url,
            params,
            'GET',
            clientId,
            clientSecret
          );
          const res = await axios.get<{ users?: ClassLinkStudent[] }>(url, {
            params,
            headers,
            timeout: Math.min(API_TIMEOUT_MS, remainingMs),
          });
          const batch = res.data.users ?? [];
          for (const st of batch) {
            if (!st.sourcedId) continue;
            const uid = computeStudentUid(st.sourcedId, hmacSecret);
            if (!wanted.has(uid) || namesByUid.has(uid)) continue;
            const name = [st.givenName, st.familyName]
              .filter((p) => typeof p === 'string' && p.trim())
              .join(' ');
            if (!name) continue;
            namesByUid.set(uid, name);
            nameCache.set(uid, { name, at: Date.now() });
          }
          if (batch.length < PAGE_LIMIT) break;
        }
      } catch (err) {
        partial = true;
        console.error(
          '[getActiveStudentsV1] ClassLink request failed:',
          errCode(err)
        );
      }
    }
  );
  return { partial, namesByUid };
}
