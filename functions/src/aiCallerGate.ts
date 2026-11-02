// Teacher-only gate for callables that spend on AI, OCR or speech: staff or admin, never anonymous, student or unverified.
import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import { isDistrictStaffToken } from './districtStaff';
import { BoundedLruMap } from './utils/boundedLruMap';

export interface AiCallerToken {
  email?: string;
  email_verified?: boolean;
  studentRole?: unknown;
  pinLogin?: unknown;
  firebase?: { sign_in_provider?: string };
}

const TEACHER_CACHE_TTL_MS = 5 * 60 * 1000;
const teacherCache = new BoundedLruMap<string, number>(1000);

/** Test-only: forget cached teacher lookups. */
export function __resetAiCallerGateCache(): void {
  teacherCache.clear();
}

/** The claims alone rule the caller out: anonymous, unverified, student or PIN. */
export function isTeacherShapedToken(token: AiCallerToken): boolean {
  return (
    token.firebase?.sign_in_provider !== 'anonymous' &&
    token.email_verified === true &&
    typeof token.email === 'string' &&
    token.email.length > 0 &&
    token.studentRole !== true &&
    token.pinLogin !== true
  );
}

/** True for a verified staff member of the caller's org, or an admin. */
export async function isAiTeacherCaller(
  db: admin.firestore.Firestore,
  token: AiCallerToken
): Promise<boolean> {
  if (!isTeacherShapedToken(token)) return false;
  const email = (token.email as string).trim().toLowerCase();
  const cachedAt = teacherCache.get(email);
  if (cachedAt !== undefined && Date.now() - cachedAt < TEACHER_CACHE_TTL_MS)
    return true;
  const ok =
    (await isDistrictStaffToken(db, token)) ||
    (await db.collection('admins').doc(email).get()).exists;
  if (ok) teacherCache.set(email, Date.now());
  return ok;
}

/** Throws permission-denied unless {@link isAiTeacherCaller}; call before any flag read, charge or model call. */
export async function assertAiTeacherCaller(
  db: admin.firestore.Firestore,
  token: AiCallerToken
): Promise<void> {
  if (!(await isAiTeacherCaller(db, token)))
    throw new HttpsError('permission-denied', 'Teacher account required.');
}
