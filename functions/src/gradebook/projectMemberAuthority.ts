// Which student uids a teacher may grade in a project: any class they teach in ClassLink, or a test class they run.
import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from '../firebaseAdmin';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from '../secrets';
import { computeStudentUid } from '../classlinkShared';
import {
  loadClassLinkMembership,
  loadOwnedRosterClasses,
  loadTestClassMembership,
} from '../studentAssignmentTargets';
import { isLmsClassId } from '../verifiedClassList';
import { RosterUnavailableError } from './rosterUnavailable';

export interface ClassStudents {
  uids: Set<string>;
  /** Set when ClassLink could not answer; the uids then hold only what the test classes vouch for. */
  degraded: RosterUnavailableError | null;
}

interface OwnerSweep {
  email: string | null;
  classlinkUids: Set<string>;
  degraded: RosterUnavailableError | null;
}

const SWEEP_CACHE_MS = 90_000;
const sweepCache = new Map<
  string,
  { at: number; sweep: Promise<OwnerSweep> }
>();

export function __resetClassLinkSweepCache(): void {
  sweepCache.clear();
}

/** The owner's verified email, or null for a missing or unverified account. */
async function verifiedOwnerEmail(ownerUid: string): Promise<string | null> {
  let owner;
  try {
    owner = await admin
      .auth()
      .getUser(ownerUid)
      .catch((err: unknown) => {
        if ((err as { code?: string })?.code === 'auth/user-not-found')
          return null;
        throw err;
      });
  } catch (err) {
    throw new RosterUnavailableError(err);
  }
  return owner?.email && owner.emailVerified ? owner.email : null;
}

async function sweepOwnerClasses(
  ownerUid: string,
  hmacSecret: string
): Promise<OwnerSweep> {
  const email = await verifiedOwnerEmail(ownerUid);
  const classlinkUids = new Set<string>();
  if (!email) return { email: null, classlinkUids, degraded: null };

  const classlinkClientId = CLASSLINK_CLIENT_ID.value();
  const classlinkClientSecret = CLASSLINK_CLIENT_SECRET.value();
  const tenantUrl = CLASSLINK_TENANT_URL.value();
  let degraded: RosterUnavailableError | null = null;
  if (classlinkClientId && classlinkClientSecret && tenantUrl) {
    try {
      const membership = await loadClassLinkMembership(
        email,
        null,
        classlinkClientId,
        classlinkClientSecret,
        tenantUrl
      );
      for (const sourcedId of membership.keys())
        classlinkUids.add(computeStudentUid(sourcedId, hmacSecret));
    } catch (err) {
      degraded = new RosterUnavailableError(err);
    }
  }
  return { email, classlinkUids, degraded };
}

/** One ClassLink sweep per owner for 90 s, shared by every group class id; failures and empty results are not kept. */
function cachedOwnerSweep(
  ownerUid: string,
  hmacSecret: string
): Promise<OwnerSweep> {
  const now = Date.now();
  let entry = sweepCache.get(ownerUid);
  if (!entry || now - entry.at > SWEEP_CACHE_MS) {
    const stored = {
      at: now,
      sweep: sweepOwnerClasses(ownerUid, hmacSecret),
    };
    entry = stored;
    sweepCache.set(ownerUid, stored);
    const evict = () => {
      if (sweepCache.get(ownerUid) === stored) sweepCache.delete(ownerUid);
    };
    stored.sweep.then((result) => {
      if (result.degraded || result.classlinkUids.size === 0) evict();
    }, evict);
  }
  return entry.sweep;
}

/** Pseudonym uids of every student in a class `ownerUid` teaches; `classId` only hints at a test class to read. */
export async function loadClassStudentUids(
  db: admin.firestore.Firestore,
  ownerUid: string,
  classId: string
): Promise<ClassStudents> {
  const uids = new Set<string>();
  if (!ownerUid) return { uids, degraded: null };
  const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
  if (!hmacSecret) {
    throw new HttpsError('internal', 'Server configuration missing.');
  }
  const sweep = await cachedOwnerSweep(ownerUid, hmacSecret);
  if (!sweep.email) return { uids, degraded: null };
  for (const uid of sweep.classlinkUids) uids.add(uid);
  const owner = { email: sweep.email };
  const degraded = sweep.degraded;

  // Test classes: the ones on the owner's rosters, plus the group's own class id.
  const owned = await loadOwnedRosterClasses(db, ownerUid);
  const testClassIds = [
    ...new Set([
      ...owned.testClassIds,
      ...(classId && !classId.startsWith('local:') ? [classId] : []),
    ]),
  ];
  const { membership, authorized } = await loadTestClassMembership(
    db,
    owner.email,
    testClassIds
  );
  if (authorized) {
    for (const email of membership.keys())
      uids.add(computeStudentUid(`test:${email}`, hmacSecret));
  }
  // ClassLink down and no test class matched: nothing to go on, so let the caller retry.
  if (degraded && uids.size === 0) throw degraded;
  return { uids, degraded };
}

/** Pseudonym uids enrolled in `classId`, only when `ownerUid` teaches it in ClassLink or may run it as a test class. */
export async function loadTaughtClassStudentUids(
  db: admin.firestore.Firestore,
  ownerUid: string,
  classId: string
): Promise<ClassStudents> {
  const uids = new Set<string>();
  const none = { uids, degraded: null };
  if (!ownerUid || !classId || classId.startsWith('local:')) return none;
  if (isLmsClassId(classId)) return none;
  const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
  if (!hmacSecret) {
    throw new HttpsError('internal', 'Server configuration missing.');
  }
  const email = await verifiedOwnerEmail(ownerUid);
  if (!email) return none;
  const test = await loadTestClassMembership(db, email, [classId]);
  for (const member of test.membership.keys())
    uids.add(computeStudentUid(`test:${member}`, hmacSecret));
  if (uids.size > 0) return none;
  const clientId = CLASSLINK_CLIENT_ID.value();
  const clientSecret = CLASSLINK_CLIENT_SECRET.value();
  const tenantUrl = CLASSLINK_TENANT_URL.value();
  if (!clientId || !clientSecret || !tenantUrl) return none;
  try {
    // Only students of `classId`, and nobody unless ClassLink lists the owner as its teacher.
    const membership = await loadClassLinkMembership(
      email,
      [classId],
      clientId,
      clientSecret,
      tenantUrl
    );
    for (const sourcedId of membership.keys())
      uids.add(computeStudentUid(sourcedId, hmacSecret));
    return none;
  } catch (err) {
    return { uids, degraded: new RosterUnavailableError(err) };
  }
}
