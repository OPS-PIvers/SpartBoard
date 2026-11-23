// Web tour authors (docs/plans/WEB_TOUR_AUTHORS.md A1-A5): district staff an admin added to /tour_authors.
import type * as admin from './firebaseAdmin';
import { isDistrictStaffEmail } from './districtStaff';
import { adminPassesMissingDoc } from './featureMissingDoc';
import { isExcludedFrom } from './permissionExclusion';

type Firestore = admin.firestore.Firestore;
type Token = { email?: string; email_verified?: boolean };

export const TOUR_AUTHORS_COLLECTION = 'tour_authors';

/** True when this address is on the author list and is active, non-student district staff; admins are checked apart. */
export async function isListedTourAuthor(
  db: Firestore,
  email: string | null | undefined
): Promise<boolean> {
  const emailLower = (email ?? '').trim().toLowerCase();
  if (!emailLower) return false;
  const listed = await db
    .collection(TOUR_AUTHORS_COLLECTION)
    .doc(emailLower)
    .get();
  // The list is checked first: almost every caller is not on it, and the staff lookup costs more.
  return listed.exists && (await isDistrictStaffEmail(db, emailLower));
}

/** A callable's caller as an author; a self-reported, unverified email never counts. */
export async function resolveCallerIsTourAuthor(
  db: Firestore,
  token: Token
): Promise<boolean> {
  return (
    token.email_verified === true && isListedTourAuthor(db, token.email ?? null)
  );
}

/** A5: an author passes a flag that is on and doesn't exclude them, whatever its access level. */
export async function isFlagOnForAuthor(
  db: Firestore,
  featureId: string,
  email: string | null | undefined
): Promise<boolean> {
  const snap = await db.collection('global_permissions').doc(featureId).get();
  if (!snap.exists) return adminPassesMissingDoc(featureId);
  const data = snap.data();
  return data?.enabled === true && !isExcludedFrom(data, email ?? undefined);
}

/** A listed author for whom this flag is on. */
export async function authorPassesFlag(
  db: Firestore,
  featureId: string,
  email: string | null | undefined
): Promise<boolean> {
  return (
    (await isListedTourAuthor(db, email)) &&
    isFlagOnForAuthor(db, featureId, email)
  );
}
