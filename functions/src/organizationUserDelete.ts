/**
 * Full account deletion for an org member — the real "Delete" behind
 * Admin > Organization > Users.
 *
 * WHY THIS EXISTS
 *   The panel's Delete used to remove only `/organizations/{orgId}/members/
 *   {emailLower}`. That is a roster edit, not a delete: the Auth account and
 *   every `/users/{uid}` document survived, and because `userTier` derives
 *   from the email DOMAIN independent of `orgId`, an Orono user signed back
 *   in to the exact state they left. Deactivate (`status: 'inactive'`) was
 *   strictly more powerful than Delete.
 *
 *   The client cannot do this itself: member docs are keyed by `emailLower`
 *   while all user data is keyed by `uid`, so resolving one to the other
 *   needs the Admin SDK. `recursiveDelete` also has no client equivalent.
 *
 * WHAT IT DELETES
 *   `/users/{uid}` and all 31 subcollections, Storage under `users/{uid}/`,
 *   `/admins/{email}`, the Firebase Auth record, and the member doc (last, so
 *   a retry after a partial failure still resolves its target).
 *
 * WHAT IT PRESERVES
 *   `quiz_sessions` carry student responses and are keyed by `teacherUid`,
 *   not nested under the teacher. Student assessment records are district
 *   records that outlive the teacher's account — the same FERPA line
 *   `deleteQuizMediaForOrgAdmin` draws. The response reports the count so the
 *   admin knows what stayed behind.
 *
 * WHAT IT REFUSES
 *   Shared boards they authored and PLCs they belong to are other teachers'
 *   dependencies. Rather than orphan them, a preflight returns them as
 *   blockers so the admin reassigns first. `dryRun` runs that preflight
 *   alone, which is what the confirmation dialog shows before anything is
 *   destroyed.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';

if (!admin.apps.length) {
  admin.initializeApp();
}

type Firestore = admin.firestore.Firestore;

/**
 * Deleting a whole account is a different weight of action than editing a
 * roster row, so this is narrower than `ADMIN_ROLE_IDS` (which admits
 * domain_admin) used by the rest of the org panel.
 */
export const DELETE_ROLE_IDS: readonly string[] = ['super_admin'];

/** Runaway guard; a teacher with more shared boards than this still reports. */
export const MAX_BLOCKERS_REPORTED = 50;

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];

// ── Wire shapes ────────────────────────────────────────────────────────────

export interface DeleteUserPayload {
  orgId: string;
  email: string;
  /** Preflight only: scan and report, change nothing. */
  dryRun: boolean;
}

export interface DeleteUserBlocker {
  kind: 'shared_board' | 'plc';
  id: string;
  label: string;
}

export interface DeleteUserSummary {
  /** Null when the member never signed in, so no Auth account exists. */
  uid: string | null;
  /** Firestore docs removed under `/users/{uid}` (0 on a dry run). */
  userDocsFound: number;
  storageObjectsFound: number;
  /** Deliberately NOT deleted — see the file header. */
  quizSessionsPreserved: number;
  memberDocRemoved: boolean;
  adminDocRemoved: boolean;
  authAccountRemoved: boolean;
}

export interface DeleteUserResponse {
  deleted: boolean;
  email: string;
  blockers: DeleteUserBlocker[];
  summary: DeleteUserSummary;
}

// ── Payload ────────────────────────────────────────────────────────────────

export function parseDeletePayload(data: unknown): DeleteUserPayload {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Payload must be an object.');
  }
  const raw = data as Record<string, unknown>;
  const orgId = typeof raw.orgId === 'string' ? raw.orgId.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.trim() : '';
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId is required.');
  if (!email) throw new HttpsError('invalid-argument', 'email is required.');
  return { orgId, email: email.toLowerCase(), dryRun: raw.dryRun === true };
}

// ── Authorization ──────────────────────────────────────────────────────────

/**
 * Fails closed. Mirrors `isMemberSuperAdmin()` / `isLegacySuperAdmin()` in
 * firestore.rules — a `/admins/{email}` doc alone is NOT enough, because that
 * collection also carries mirrored building_admins.
 */
export async function assertCallerMayDelete(
  db: Firestore,
  orgId: string,
  callerEmailLower: string
): Promise<void> {
  const memberSnap = await db
    .doc(`organizations/${orgId}/members/${callerEmailLower}`)
    .get();
  if (memberSnap.exists) {
    const roleId = asString(memberSnap.get('roleId'));
    if (DELETE_ROLE_IDS.includes(roleId)) return;
  }
  const legacySnap = await db.doc('admin_settings/user_roles').get();
  const legacy = legacySnap.exists
    ? asStringArray(legacySnap.get('superAdmins'))
    : [];
  if (legacy.includes(callerEmailLower)) return;
  throw new HttpsError(
    'permission-denied',
    'Deleting a user account requires super admin.'
  );
}

// ── Preflight ──────────────────────────────────────────────────────────────

/**
 * Collaborative content owned by, or shared with, the target. Pure so the
 * blocker-classification matrix is unit-testable without an emulator.
 */
export function classifyBlockers(
  sharedBoards: Array<{ id: string; title?: unknown }>,
  plcs: Array<{ id: string; name?: unknown }>
): DeleteUserBlocker[] {
  const out: DeleteUserBlocker[] = [];
  for (const b of sharedBoards) {
    out.push({
      kind: 'shared_board',
      id: b.id,
      label:
        typeof b.title === 'string' && b.title ? b.title : 'Untitled board',
    });
  }
  for (const p of plcs) {
    out.push({
      kind: 'plc',
      id: p.id,
      label: typeof p.name === 'string' && p.name ? p.name : 'Unnamed PLC',
    });
  }
  return out.slice(0, MAX_BLOCKERS_REPORTED);
}

async function scanBlockers(
  db: Firestore,
  uid: string
): Promise<DeleteUserBlocker[]> {
  const [boards, plcs] = await Promise.all([
    db
      .collection('shared_boards')
      .where('originalAuthor', '==', uid)
      .limit(MAX_BLOCKERS_REPORTED)
      .get(),
    db
      .collection('plcs')
      .where('memberUids', 'array-contains', uid)
      .limit(MAX_BLOCKERS_REPORTED)
      .get(),
  ]);
  return classifyBlockers(
    boards.docs.map((d) => ({ id: d.id, title: asString(d.get('title')) })),
    plcs.docs.map((d) => ({ id: d.id, name: asString(d.get('name')) }))
  );
}

/** Recursive doc count under `/users/{uid}`, for the confirmation dialog. */
async function countUserDocs(db: Firestore, uid: string): Promise<number> {
  const root = db.doc(`users/${uid}`);
  const rootSnap = await root.get();
  let total = rootSnap.exists ? 1 : 0;
  const subs = await root.listCollections();
  for (const c of subs) {
    const agg = await c.count().get();
    total += agg.data().count;
  }
  return total;
}

async function countStorageObjects(uid: string): Promise<number> {
  try {
    const [files] = await admin
      .storage()
      .bucket()
      .getFiles({ prefix: `users/${uid}/` });
    return files.length;
  } catch (err) {
    console.error('[deleteOrganizationUser] Storage scan failed', err);
    return 0;
  }
}

async function countQuizSessions(db: Firestore, uid: string): Promise<number> {
  try {
    const agg = await db
      .collection('quiz_sessions')
      .where('teacherUid', '==', uid)
      .count()
      .get();
    return agg.data().count;
  } catch (err) {
    console.error('[deleteOrganizationUser] quiz_sessions scan failed', err);
    return 0;
  }
}

// ── Callable ───────────────────────────────────────────────────────────────

export const deleteOrganizationUser = onCall(
  {
    cors: ALLOWED_ORIGINS,
    memory: '512MiB',
    // recursiveDelete over 31 subcollections plus a Storage sweep.
    timeoutSeconds: 300,
  },
  async (request): Promise<DeleteUserResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const callerEmail = request.auth.token.email;
    if (!callerEmail) {
      throw new HttpsError('invalid-argument', 'Caller must have an email.');
    }
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError(
        'permission-denied',
        'Caller email must be verified.'
      );
    }
    const callerEmailLower = callerEmail.toLowerCase();
    const { orgId, email, dryRun } = parseDeletePayload(request.data);

    const db = admin.firestore();
    await assertCallerMayDelete(db, orgId, callerEmailLower);

    // An admin deleting themselves would strip their own super_admin mirror
    // mid-operation and could leave the org with no one able to administer it.
    if (email === callerEmailLower) {
      throw new HttpsError(
        'failed-precondition',
        'You cannot delete your own account.'
      );
    }

    const memberRef = db.doc(`organizations/${orgId}/members/${email}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      throw new HttpsError(
        'not-found',
        `No member record for ${email} in this organization.`
      );
    }

    // A member who never signed in has no Auth account and no `/users` tree;
    // deleting them is just the roster row.
    let uid: string | null = null;
    try {
      uid = (await admin.auth().getUserByEmail(email)).uid;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'auth/user-not-found') {
        console.error('[deleteOrganizationUser] Auth lookup failed', err);
        throw new HttpsError('internal', 'Failed to look up the Auth account.');
      }
    }

    const blockers = uid ? await scanBlockers(db, uid) : [];
    const [userDocsFound, storageObjectsFound, quizSessionsPreserved] = uid
      ? await Promise.all([
          countUserDocs(db, uid),
          countStorageObjects(uid),
          countQuizSessions(db, uid),
        ])
      : [0, 0, 0];

    const adminRef = db.doc(`admins/${email}`);
    const adminExists = (await adminRef.get()).exists;

    const summary: DeleteUserSummary = {
      uid,
      userDocsFound,
      storageObjectsFound,
      quizSessionsPreserved,
      memberDocRemoved: false,
      adminDocRemoved: false,
      authAccountRemoved: false,
    };

    if (dryRun || blockers.length > 0) {
      return { deleted: false, email, blockers, summary };
    }

    if (uid) {
      await db.recursiveDelete(db.doc(`users/${uid}`));
      try {
        await admin
          .storage()
          .bucket()
          .deleteFiles({ prefix: `users/${uid}/` });
      } catch (err) {
        // Firestore is already gone; report honestly rather than fail the call.
        console.error('[deleteOrganizationUser] Storage delete failed', err);
      }
    }

    if (adminExists) {
      await adminRef.delete();
      summary.adminDocRemoved = true;
    }

    if (uid) {
      try {
        await admin.auth().deleteUser(uid);
        summary.authAccountRemoved = true;
      } catch (err) {
        console.error('[deleteOrganizationUser] Auth delete failed', err);
      }
    }

    // Last: leaving it until the end keeps a retry after a partial failure
    // able to find and authorize its target.
    await memberRef.delete();
    summary.memberDocRemoved = true;

    await db
      .collection('admin_audit_log')
      .add({
        action: 'user_account_deleted',
        email: callerEmailLower,
        targetEmail: email,
        targetUid: uid,
        orgId,
        userDocsDeleted: userDocsFound,
        storageObjectsDeleted: storageObjectsFound,
        quizSessionsPreserved,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch((err) => {
        console.error('[deleteOrganizationUser] Audit write failed', err);
      });

    return { deleted: true, email, blockers: [], summary };
  }
);
