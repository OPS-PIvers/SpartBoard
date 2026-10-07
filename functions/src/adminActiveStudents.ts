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

// Admin-only drill-down behind the Monthly/Daily Active Students KPIs; names come live from ClassLink and are never stored.

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const IN_CHUNK = 10;
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
  teachers: string[];
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

export function buildActiveStudentRows(input: {
  students: readonly ActiveStudentInput[];
  teacherUidsBySection: ReadonlyMap<string, readonly string[]>;
  teacherNames: ReadonlyMap<string, string>;
  namesByUid: ReadonlyMap<string, string>;
}): ActiveStudentRow[] {
  return input.students.map((s) => {
    const teacherUids = new Set<string>();
    for (const id of s.sectionIds) {
      for (const t of input.teacherUidsBySection.get(id) ?? []) {
        teacherUids.add(t);
      }
    }
    const teachers = [...teacherUids]
      .map((t) => input.teacherNames.get(t) ?? '')
      .filter((n) => n.length > 0)
      .sort((a, b) => a.localeCompare(b));
    return {
      name: input.namesByUid.get(s.uid) ?? '',
      teachers: [...new Set(teachers)],
      lastSignInMs: s.lastSignInMs,
    };
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

    // Section → teachers who imported it as a roster.
    const allSections = [...new Set(active.flatMap((s) => s.sectionIds))];
    const teacherUidsBySection = new Map<string, string[]>();
    const rosterSnaps = await Promise.all(
      chunk(allSections, IN_CHUNK).map((ids) =>
        db.collectionGroup('rosters').where('classlinkClassId', 'in', ids).get()
      )
    );
    for (const rs of rosterSnaps) {
      for (const doc of rs.docs) {
        const sectionId: unknown = doc.get('classlinkClassId');
        const teacherUid = doc.ref.parent.parent?.id;
        if (typeof sectionId !== 'string' || !teacherUid) continue;
        const list = teacherUidsBySection.get(sectionId) ?? [];
        if (!list.includes(teacherUid)) list.push(teacherUid);
        teacherUidsBySection.set(sectionId, list);
      }
    }

    const teacherNames = new Map<string, string>();
    const teacherUids = [...new Set([...teacherUidsBySection.values()].flat())];
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
      const sections = orderSectionsForNameLookup(
        active,
        new Set(teacherUidsBySection.keys())
      );
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
        teacherUidsBySection,
        teacherNames,
        namesByUid,
      }),
    };
  }
);
