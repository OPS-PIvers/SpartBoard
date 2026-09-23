// The access checks both substitute-share callables run before touching a
// teacher's data: who the caller is, that the org switch is on, and that the
// share is a live substitute share naming them. One copy, because a check that
// drifts between starting a run and controlling one is a hole.

import { HttpsError } from 'firebase-functions/v2/https';
import type * as admin from 'firebase-admin';

export const MAX_ID_LENGTH = 128;

const DISTRICT_EMAIL = /^[^@]+@orono\.k12\.mn\.us$/;

export interface SubShareCaller {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  anonymous: boolean;
  studentRole: boolean;
}

export function bad(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

export function denied(message: string): never {
  throw new HttpsError('permission-denied', message);
}

export function shortId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value || value.length > MAX_ID_LENGTH) {
    bad(`${field} must be a non-empty id`);
  }
  if (value.includes('/')) bad(`${field} must not be a path`);
  return value;
}

/**
 * The caller and their own email, once they are a verified district staff
 * account. Returns the caller rather than asserting, so the compiler carries
 * the non-null through the rest of a handler.
 */
export function verifySubCaller(caller: SubShareCaller | null): {
  caller: SubShareCaller;
  email: string;
} {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (caller.anonymous || caller.studentRole) {
    denied('This is for staff accounts.');
  }
  const email = (caller.email ?? '').toLowerCase();
  if (!caller.emailVerified || !DISTRICT_EMAIL.test(email)) {
    denied('A verified district account is required.');
  }
  return { caller, email };
}

/** The org-wide switch both callables sit behind, off in both projects. */
export async function requireSubLaunchEnabled(
  db: admin.firestore.Firestore,
  offMessage: string
): Promise<void> {
  const settings = await db.doc('admin_settings/sub_launch_as_teacher').get();
  if (settings.data()?.enabled !== true) denied(offMessage);
}

export interface VerifiedSubShare {
  share: admin.firestore.DocumentData;
  hostUid: string;
  /** The share's own expiry, which is also the monitor window's end. */
  expiresAt: number;
}

/** A live substitute share that names this caller, and its teacher. */
export async function verifySubShare(
  db: admin.firestore.Firestore,
  shareId: string,
  email: string,
  now: number
): Promise<VerifiedSubShare> {
  const shareSnap = await db.doc(`shared_collections/${shareId}`).get();
  const share = shareSnap.data();
  if (!shareSnap.exists || !share) denied('That share no longer exists.');
  if (share.intendedMode !== 'substitute') {
    denied('That share is not a substitute share.');
  }
  const expiresAt =
    typeof share.expiresAt === 'number' ? share.expiresAt : null;
  if (expiresAt === null || expiresAt <= now) denied('That share has expired.');
  const subEmails = Array.isArray(share.subEmails) ? share.subEmails : [];
  if (!subEmails.some((e: unknown) => String(e).toLowerCase() === email)) {
    denied('This share does not name you as a substitute.');
  }
  const hostUid = typeof share.hostUid === 'string' ? share.hostUid : '';
  if (!hostUid) denied('That share has no teacher.');
  return { share, hostUid, expiresAt };
}
