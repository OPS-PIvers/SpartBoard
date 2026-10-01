// Super admin "View as" session callables (docs/plans/ADMIN_VIEW_AS.md D1-D4, D16, D17).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';
import { OPERATOR_ORG_ID, isStrictSuperAdmin } from './authz';
import { readViewAsClaim, type ViewAsClaim } from './viewAsGuard';

type Firestore = admin.firestore.Firestore;

export const VIEW_AS_SESSION_MS = 60 * 60 * 1000;
export const VIEW_AS_SESSIONS = 'view_as_sessions';
export const VIEW_AS_SETTINGS_PATH = 'admin_settings/view_as';
export const MAX_REASON_LENGTH = 500;

export type ViewAsServerAuditAction =
  | 'view_as_start'
  | 'view_as_renew'
  | 'view_as_unlock'
  | 'view_as_end';

interface SessionDoc {
  by: string;
  targetEmail: string;
  targetUid: string;
  adminTarget: boolean;
  unlocked: boolean;
  expiresAtMs: number;
  ended: boolean;
}

function verifiedCallerEmail(request: {
  auth?: { token?: Record<string, unknown> } | null;
}): string {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const token = request.auth.token ?? {};
  const email = typeof token.email === 'string' ? token.email : '';
  if (!email || token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'A verified email is required.');
  }
  return email.toLowerCase();
}

export async function isViewAsEnabled(db: Firestore): Promise<boolean> {
  const snap = await db.doc(VIEW_AS_SETTINGS_PATH).get();
  return snap.exists && snap.get('enabled') === true;
}

async function assertEnabled(db: Firestore): Promise<void> {
  if (!(await isViewAsEnabled(db))) {
    throw new HttpsError('failed-precondition', 'View as is turned off.');
  }
}

async function assertStrictSuperAdmin(
  db: Firestore,
  emailLower: string
): Promise<void> {
  if (!(await isStrictSuperAdmin(db, emailLower))) {
    throw new HttpsError('permission-denied', 'View as requires super admin.');
  }
}

function toMillis(value: unknown): number {
  if (value instanceof admin.firestore.Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  return 0;
}

function readSession(
  snap: admin.firestore.DocumentSnapshot
): SessionDoc | null {
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  return {
    by: typeof d.by === 'string' ? d.by : '',
    targetEmail: typeof d.targetEmail === 'string' ? d.targetEmail : '',
    targetUid: typeof d.targetUid === 'string' ? d.targetUid : '',
    adminTarget: d.adminTarget !== false,
    unlocked: d.unlocked === true,
    expiresAtMs: toMillis(d.expiresAt),
    ended: d.endedAt !== null && d.endedAt !== undefined,
  };
}

export function auditEntry(
  action: ViewAsServerAuditAction,
  sid: string,
  session: Pick<SessionDoc, 'by' | 'targetEmail' | 'targetUid'>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    action,
    sid,
    email: session.by,
    targetEmail: session.targetEmail,
    targetUid: session.targetUid,
    ...extra,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/** Org admin roles that make a target view-only (D3), alongside an `/admins` doc. */
export const ADMIN_TARGET_ROLE_IDS: readonly string[] = [
  'super_admin',
  'domain_admin',
  'building_admin',
];

export async function isAdminAccount(
  db: Firestore,
  emailLower: string
): Promise<boolean> {
  const [adminSnap, memberSnap] = await Promise.all([
    db.doc(`admins/${emailLower}`).get(),
    db.doc(`organizations/${OPERATOR_ORG_ID}/members/${emailLower}`).get(),
  ]);
  if (adminSnap.exists) return true;
  const roleId: unknown = memberSnap.exists ? memberSnap.get('roleId') : '';
  return typeof roleId === 'string' && ADMIN_TARGET_ROLE_IDS.includes(roleId);
}

async function mint(uid: string, claim: ViewAsClaim): Promise<string> {
  try {
    return await admin.auth().createCustomToken(uid, { viewAs: claim });
  } catch (err) {
    console.error('[viewAs] createCustomToken failed', err);
    throw new HttpsError('internal', 'Could not open the account.');
  }
}

export function parseTargetEmail(data: unknown): string {
  const raw =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>).targetEmail
      : undefined;
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!email || !email.includes('@') || email.length > 320) {
    throw new HttpsError('invalid-argument', 'targetEmail is required.');
  }
  return email;
}

export const startViewAsSessionV1 = onCall(
  { cors: ALLOWED_ORIGINS },
  async (request) => {
    const callerEmail = verifiedCallerEmail(request);
    if (readViewAsClaim(request)) {
      throw new HttpsError(
        'permission-denied',
        'Exit View as before starting another session.'
      );
    }
    const targetEmail = parseTargetEmail(request.data);
    const db = admin.firestore();
    await assertEnabled(db);
    await assertStrictSuperAdmin(db, callerEmail);
    if (targetEmail === callerEmail) {
      throw new HttpsError(
        'failed-precondition',
        'You cannot view as yourself.'
      );
    }

    let target: admin.auth.UserRecord;
    try {
      target = await admin.auth().getUserByEmail(targetEmail);
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/user-not-found') {
        throw new HttpsError(
          'not-found',
          `${targetEmail} has not signed in to SpartBoard yet.`
        );
      }
      throw err;
    }
    if (target.uid === request.auth?.uid) {
      throw new HttpsError(
        'failed-precondition',
        'You cannot view as yourself.'
      );
    }
    if (target.disabled) {
      throw new HttpsError('failed-precondition', 'That account is disabled.');
    }
    if (target.customClaims?.studentRole === true) {
      throw new HttpsError(
        'failed-precondition',
        "Open a student from their teacher's account."
      );
    }

    const adminTarget = await isAdminAccount(db, targetEmail);
    const now = Date.now();
    const exp = now + VIEW_AS_SESSION_MS;
    const sessionRef = db.collection(VIEW_AS_SESSIONS).doc();
    const sid = sessionRef.id;
    const session = { by: callerEmail, targetEmail, targetUid: target.uid };

    // Audit lands before any token exists (plan D4 step 3).
    const batch = db.batch();
    batch.set(sessionRef, {
      ...session,
      adminTarget,
      unlocked: false,
      reason: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(exp),
      endedAt: null,
    });
    batch.set(
      db.collection('admin_audit_log').doc(),
      auditEntry('view_as_start', sid, session, { adminTarget })
    );
    await batch.commit();

    let token: string;
    try {
      token = await mint(target.uid, {
        by: callerEmail,
        sid,
        ro: true,
        adminTarget,
        exp,
      });
    } catch (err) {
      await sessionRef
        .update({ endedAt: admin.firestore.FieldValue.serverTimestamp() })
        .catch(() => undefined);
      await db
        .collection('admin_audit_log')
        .add(auditEntry('view_as_end', sid, session, { error: 'mint_failed' }))
        .catch(() => undefined);
      throw err;
    }

    return {
      sid,
      token,
      targetUid: target.uid,
      targetEmail,
      adminTarget,
      expiresAt: exp,
    };
  }
);

export function parseUpdatePayload(data: unknown): {
  action: 'renew' | 'unlock' | 'end';
  reason: string;
  sid: string;
} {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<
    string,
    unknown
  >;
  const action = raw.action;
  if (action !== 'renew' && action !== 'unlock' && action !== 'end') {
    throw new HttpsError('invalid-argument', 'Unknown action.');
  }
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (
    action === 'unlock' &&
    (reason.length < 3 || reason.length > MAX_REASON_LENGTH)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Give a short reason for unlocking edits.'
    );
  }
  const sid = typeof raw.sid === 'string' ? raw.sid.trim() : '';
  return { action, reason, sid };
}

export const updateViewAsSessionV1 = onCall(
  { cors: ALLOWED_ORIGINS },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const { action, reason, sid: bodySid } = parseUpdatePayload(request.data);
    const db = admin.firestore();
    const claim = readViewAsClaim(request);

    // The opener tab (the admin's own session) may end a session it started.
    if (!claim) {
      const callerEmail = verifiedCallerEmail(request);
      if (action !== 'end' || !bodySid) {
        throw new HttpsError(
          'permission-denied',
          'Only the View as tab can do this.'
        );
      }
      const ref = db.collection(VIEW_AS_SESSIONS).doc(bodySid);
      const session = readSession(await ref.get());
      if (!session || session.by !== callerEmail) {
        throw new HttpsError('not-found', 'No such View as session.');
      }
      return endSession(db, ref, bodySid, session);
    }

    if (!claim.sid || !claim.by) {
      throw new HttpsError(
        'permission-denied',
        'This View as session has ended.'
      );
    }
    const ref = db.collection(VIEW_AS_SESSIONS).doc(claim.sid);
    const session = readSession(await ref.get());
    if (
      !session ||
      session.by !== claim.by ||
      session.targetUid !== request.auth.uid
    ) {
      throw new HttpsError(
        'permission-denied',
        'This View as session has ended.'
      );
    }
    if (action === 'end') return endSession(db, ref, claim.sid, session);

    const now = Date.now();
    if (session.ended || now >= session.expiresAtMs || now >= claim.exp) {
      throw new HttpsError(
        'permission-denied',
        'This View as session has ended.'
      );
    }
    await assertEnabled(db);
    await assertStrictSuperAdmin(db, claim.by);

    if (action === 'renew') {
      const exp = now + VIEW_AS_SESSION_MS;
      await ref.update({
        expiresAt: admin.firestore.Timestamp.fromMillis(exp),
      });
      await db
        .collection('admin_audit_log')
        .add(auditEntry('view_as_renew', claim.sid, session));
      const token = await mint(session.targetUid, {
        by: session.by,
        sid: claim.sid,
        ro: !session.unlocked,
        adminTarget: session.adminTarget,
        exp,
      });
      return { token, expiresAt: exp, unlocked: session.unlocked };
    }

    // unlock: admins are view-only (D3), re-checked in case the role changed mid-session.
    const nowAdmin = await isAdminAccount(db, session.targetEmail);
    if (session.adminTarget || nowAdmin) {
      throw new HttpsError(
        'failed-precondition',
        'Admin accounts are view-only.'
      );
    }
    await ref.update({ unlocked: true, reason });
    await db
      .collection('admin_audit_log')
      .add(auditEntry('view_as_unlock', claim.sid, session, { reason }));
    const token = await mint(session.targetUid, {
      by: session.by,
      sid: claim.sid,
      ro: false,
      adminTarget: false,
      exp: session.expiresAtMs,
    });
    return { token, expiresAt: session.expiresAtMs, unlocked: true };
  }
);

async function endSession(
  db: Firestore,
  ref: admin.firestore.DocumentReference,
  sid: string,
  session: SessionDoc
): Promise<{ ended: true }> {
  if (session.ended) return { ended: true };
  await ref.update({ endedAt: admin.firestore.FieldValue.serverTimestamp() });
  await db
    .collection('admin_audit_log')
    .add(auditEntry('view_as_end', sid, session))
    .catch((err) => console.error('[viewAs] end audit failed', err));
  return { ended: true };
}
