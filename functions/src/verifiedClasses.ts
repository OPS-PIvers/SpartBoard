// Refreshes and fills each teacher's verified class list (see verifiedClassList.ts).
import * as admin from './firebaseAdmin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import './functionsInit';
import {
  ALLOWED_ORIGINS,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from './classlinkShared';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
} from './secrets';
import { loadTeacherClassIds } from './studentIdentity';
import { isTestClassAuthority } from './studentAssignmentTargets';
import { assertViewAsAllowed } from './viewAsGuard';
import { chunk } from './shared';
import {
  VERIFIED_CLASSES_COLLECTION,
  writeVerifiedClasses,
  staffEmailFromToken,
  type VerifiedClassesDoc,
} from './verifiedClassList';

/** Kill switch for the fill job. Absent doc == off. */
export const VERIFIED_CLASSES_FILL_PATH =
  'admin_settings/verified_classes_fill';
const MAX_TEST_CLASSES = 200;
/** The fill job re-reads a list whose ClassLink part is this old. */
export const FILL_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const FILL_MAX_TEACHERS_PER_RUN = 400;
const FILL_BUDGET_MS = 420_000;
const FILL_CONCURRENCY = 4;
const AUTH_GET_USERS_MAX = 100;

/** Test class ids the caller may target: every org test class, for a test-class authority only. */
export async function loadAuthorizedTestClassIds(
  db: admin.firestore.Firestore,
  email: string
): Promise<string[]> {
  const domain = normalizeEmailDomain(email);
  const orgId = domain ? await resolveOrgIdForDomain(db, domain) : null;
  if (!orgId) return [];
  if (!(await isTestClassAuthority(db, email.toLowerCase(), orgId))) return [];
  const snap = await db
    .collection(`organizations/${orgId}/testClasses`)
    .select()
    .limit(MAX_TEST_CLASSES)
    .get();
  return snap.docs.map((d) => d.id);
}

interface ClassLinkCreds {
  classlinkClientId: string;
  classlinkClientSecret: string;
  tenantUrl: string;
}

const readCreds = (): ClassLinkCreds => ({
  classlinkClientId: CLASSLINK_CLIENT_ID.value(),
  classlinkClientSecret: CLASSLINK_CLIENT_SECRET.value(),
  tenantUrl: CLASSLINK_TENANT_URL.value(),
});

/** ClassLink's taught classes; [] for a non-teacher; null when ClassLink can't answer (keep the stored list). */
async function taughtClassIdsOrNull(
  email: string,
  creds: ClassLinkCreds
): Promise<string[] | null> {
  if (!creds.classlinkClientId || !creds.classlinkClientSecret) return null;
  if (!creds.tenantUrl) return null;
  try {
    const taught = await loadTeacherClassIds(email, creds);
    return taught ? [...taught] : [];
  } catch {
    return null;
  }
}

/** Re-reads every source for one teacher and stores the list. */
export async function refreshVerifiedClasses(
  db: admin.firestore.Firestore,
  uid: string,
  email: string,
  creds: ClassLinkCreds = readCreds(),
  now: number = Date.now()
): Promise<VerifiedClassesDoc> {
  const [classlink, test] = await Promise.all([
    taughtClassIdsOrNull(email, creds),
    loadAuthorizedTestClassIds(db, email).catch(() => null),
  ]);
  return writeVerifiedClasses(db, uid, { classlink, test }, now);
}

export const refreshMyClassesV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: ALLOWED_ORIGINS,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
    ],
    invoker: 'public',
  },
  async (request) => {
    // Recomputes only server-verified data for the signed-in uid, so a read-only View as tab may run it.
    await assertViewAsAllowed(request, { read: true });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const email = staffEmailFromToken(request.auth.token);
    if (!email) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }
    const doc = await refreshVerifiedClasses(
      admin.firestore(),
      request.auth.uid,
      email
    );
    return { count: doc.ids.length, classlinkAt: doc.classlinkAt ?? null };
  }
);

type RosterOwnerRow = { uid: string; email: string };

/** Roster owners who are verified, non-student accounts. */
async function rosterOwners(
  db: admin.firestore.Firestore
): Promise<RosterOwnerRow[]> {
  const snap = await db.collectionGroup('rosters').select().get();
  const uids = new Set<string>();
  for (const doc of snap.docs) {
    const owner = doc.ref.parent.parent;
    // Only users/{uid}/rosters/{id}.
    if (owner && owner.parent.id === 'users') uids.add(owner.id);
  }
  const out: RosterOwnerRow[] = [];
  for (const group of chunk([...uids], AUTH_GET_USERS_MAX)) {
    const res = await admin.auth().getUsers(group.map((uid) => ({ uid })));
    for (const user of res.users) {
      const claims = (user.customClaims ?? {}) as Record<string, unknown>;
      const email = staffEmailFromToken({
        ...claims,
        email: user.email,
        email_verified: user.emailVerified && !user.disabled,
      });
      if (email) out.push({ uid: user.uid, email });
    }
  }
  return out;
}

/** Fills or refreshes the list for every roster owner whose list is missing or stale. */
export async function runVerifiedClassesFill(
  db: admin.firestore.Firestore,
  now: number = Date.now(),
  creds: ClassLinkCreds = readCreds()
): Promise<{
  owners: number;
  written: number;
  skipped: number;
  remaining: number;
  attempted: number;
}> {
  const owners = await rosterOwners(db);
  const started = Date.now();
  let written = 0;
  let skipped = 0;
  const due: RosterOwnerRow[] = [];
  for (const group of chunk(owners, AUTH_GET_USERS_MAX)) {
    const snaps = await db.getAll(
      ...group.map((o) => db.doc(`${VERIFIED_CLASSES_COLLECTION}/${o.uid}`))
    );
    snaps.forEach((snap, i) => {
      // Keyed on ClassLink's last answer, so an outage during a fill is retried.
      const at: unknown = snap.exists ? snap.get('classlinkAt') : null;
      if (typeof at === 'number' && now - at < FILL_STALE_MS) skipped += 1;
      else due.push(group[i]);
    });
  }
  const batch = due.slice(0, FILL_MAX_TEACHERS_PER_RUN);
  let attempted = 0;
  for (const group of chunk(batch, FILL_CONCURRENCY)) {
    if (Date.now() - started > FILL_BUDGET_MS) break;
    attempted += group.length;
    const results = await Promise.allSettled(
      group.map((o) => refreshVerifiedClasses(db, o.uid, o.email, creds, now))
    );
    for (const r of results) {
      // A list ClassLink didn't answer for stays due for the next run.
      if (r.status === 'fulfilled' && r.value.classlinkAt === now) written += 1;
      else if (r.status === 'rejected') {
        console.error(
          '[verifiedClassesFill] refresh failed:',
          r.reason instanceof Error ? r.reason.message : 'unexpected'
        );
      }
    }
  }
  return {
    owners: owners.length,
    written,
    skipped,
    remaining: due.length - written,
    attempted,
  };
}

export const verifiedClassesFill = onSchedule(
  {
    // 03:15 America/Chicago, after the ClassLink roster sync.
    schedule: '15 3 * * *',
    timeZone: 'America/Chicago',
    memory: '512MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
    ],
  },
  async () => {
    const db = admin.firestore();
    const settings = await db.doc(VERIFIED_CLASSES_FILL_PATH).get();
    if (!(settings.exists && settings.get('enabled') === true)) return;
    const result = await runVerifiedClassesFill(db);
    console.log('[verifiedClassesFill] done', result);
  }
);
