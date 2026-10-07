import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
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
import { isSuperAdminRoleId } from './authz';
import { assertViewAsAllowed } from './viewAsGuard';

// Admin-only drill-down behind the Active Students KPIs: teachers come from assignments opened; names come live from ClassLink.

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const IN_CHUNK = 10;
const IN_QUERY_MAX = 30;
const CLASSLINK_CONCURRENCY = 6;
const PAGE_LIMIT = 200;
const MAX_PAGES = 10;
const API_TIMEOUT_MS = 20000;
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

/** Sections to fetch from ClassLink, most-covering first, so names resolve in as few calls as possible. */
export function orderSectionsForNameLookup(
  students: readonly ActiveStudentInput[],
  rosteredSections: ReadonlySet<string>
): string[] {
  const counts = new Map<string, number>();
  for (const s of students) {
    for (const id of s.sectionIds) {
      if (rosteredSections.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
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
  sinceMs: number
): Promise<AssignmentOpen[]> {
  const wanted = new Set(studentUids);
  const hits: {
    studentUid: string;
    sessionRef: admin.firestore.DocumentReference;
    openedMs: number;
  }[] = [];
  const queries: Promise<void>[] = [];
  for (const src of OPEN_SOURCES) {
    for (const ids of chunk(studentUids, IN_QUERY_MAX)) {
      queries.push(
        db
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
          })
      );
    }
  }
  // Flashcard progress is keyed by uid with no uid field, so read the window and match ids.
  queries.push(
    db
      .collectionGroup('progress')
      .where('lastActiveAt', '>=', sinceMs)
      .select('lastActiveAt')
      .get()
      .then((snap) => {
        for (const doc of snap.docs) {
          const sessionRef = doc.ref.parent.parent;
          if (sessionRef?.parent.id !== 'flashcard_sessions') continue;
          if (!wanted.has(doc.id)) continue;
          const at: unknown = doc.get('lastActiveAt');
          if (typeof at !== 'number') continue;
          hits.push({ studentUid: doc.id, sessionRef, openedMs: at });
        }
      })
  );
  await Promise.all(queries);

  const sessionRefs = new Map<string, admin.firestore.DocumentReference>();
  for (const h of hits) sessionRefs.set(h.sessionRef.path, h.sessionRef);
  const teacherBySession = new Map<string, string>();
  for (const refs of chunk([...sessionRefs.values()], 300)) {
    const docs = await db.getAll(...refs, { fieldMask: ['teacherUid'] });
    for (const d of docs) {
      const teacherUid: unknown = d.get('teacherUid');
      if (typeof teacherUid === 'string' && teacherUid) {
        teacherBySession.set(d.ref.path, teacherUid);
      }
    }
  }
  return hits.flatMap((h) => {
    const teacherUid = teacherBySession.get(h.sessionRef.path);
    return teacherUid
      ? [{ studentUid: h.studentUid, teacherUid, openedMs: h.openedMs }]
      : [];
  });
}

async function assertOrgWideAdmin(
  db: admin.firestore.Firestore,
  orgId: string,
  emailLower: string
): Promise<void> {
  const [adminDoc, memberDoc] = await Promise.all([
    db.collection('admins').doc(emailLower).get(),
    db.doc(`organizations/${orgId}/members/${emailLower}`).get(),
  ]);
  if (adminDoc.exists && isSuperAdminRoleId(adminDoc.get('roleId'))) return;
  const roleId: unknown = memberDoc.exists ? memberDoc.get('roleId') : null;
  if (typeof roleId === 'string' && ORG_WIDE_ROLE_IDS.has(roleId)) return;
  throw new HttpsError(
    'permission-denied',
    'Only district admins can view the student list.'
  );
}

async function mapWithConcurrency<T>(
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
    if (!orgId) throw new HttpsError('invalid-argument', 'orgId is required.');

    const db = admin.firestore();
    await assertOrgWideAdmin(db, orgId, email.toLowerCase());

    const now = Date.now();
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

    // Sections that teachers imported as rosters; only these can be fetched from ClassLink for names.
    const allSections = [...new Set(active.flatMap((s) => s.sectionIds))];
    const rosteredSections = new Set<string>();
    const rosterSnaps = await Promise.all(
      chunk(allSections, IN_CHUNK).map((ids) =>
        db
          .collectionGroup('rosters')
          .where('classlinkClassId', 'in', ids)
          .select('classlinkClassId')
          .get()
      )
    );
    for (const rs of rosterSnaps) {
      for (const doc of rs.docs) {
        const sectionId: unknown = doc.get('classlinkClassId');
        if (typeof sectionId === 'string') rosteredSections.add(sectionId);
      }
    }

    const opens = await collectAssignmentOpens(
      db,
      active.map((s) => s.uid),
      now - MONTH_MS
    );
    const opensByStudent = latestOpensByStudent(opens);

    const teacherNames = new Map<string, string>();
    const teacherUids = [...new Set(opens.map((o) => o.teacherUid))];
    for (const ids of chunk(teacherUids, 100)) {
      const result = await admin
        .auth()
        .getUsers(ids.map((uid) => ({ uid })))
        .catch(() => null);
      for (const u of result?.users ?? []) {
        teacherNames.set(u.uid, u.displayName || u.email || '');
      }
    }

    // Names: walk rostered sections until every active student is matched.
    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    const clientId = CLASSLINK_CLIENT_ID.value();
    const clientSecret = CLASSLINK_CLIENT_SECRET.value();
    const tenantUrl = CLASSLINK_TENANT_URL.value().replace(/\/$/, '');
    const namesByUid = new Map<string, string>();
    let partial = false;
    if (hmacSecret && clientId && clientSecret && tenantUrl) {
      const wanted = new Set(active.map((s) => s.uid));
      const sections = orderSectionsForNameLookup(active, rosteredSections);
      await mapWithConcurrency(
        sections,
        CLASSLINK_CONCURRENCY,
        async (sectionId) => {
          const covers = active.some(
            (s) => !namesByUid.has(s.uid) && s.sectionIds.includes(sectionId)
          );
          if (!covers) return;
          const url = `${tenantUrl}${ONEROSTER_BASE}/classes/${encodeURIComponent(sectionId)}/students`;
          try {
            for (let page = 0; page < MAX_PAGES; page += 1) {
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
                timeout: API_TIMEOUT_MS,
              });
              const batch = res.data.users ?? [];
              for (const st of batch) {
                if (!st.sourcedId) continue;
                const uid = computeStudentUid(st.sourcedId, hmacSecret);
                if (!wanted.has(uid) || namesByUid.has(uid)) continue;
                const name = [st.givenName, st.familyName]
                  .filter((p) => typeof p === 'string' && p.trim())
                  .join(' ');
                if (name) namesByUid.set(uid, name);
              }
              if (batch.length < PAGE_LIMIT) break;
            }
          } catch (err) {
            partial = true;
            console.error(
              '[getActiveStudentsV1] ClassLink request failed:',
              axios.isAxiosError(err) ? err.response?.status : 'unexpected'
            );
          }
        }
      );
    } else {
      partial = true;
    }

    return {
      asOf: now,
      partial,
      students: buildActiveStudentRows({
        students: active,
        opensByStudent,
        teacherNames,
        namesByUid,
      }),
    };
  }
);
