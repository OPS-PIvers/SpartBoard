// Server-only list of the class ids each teacher may target (verified_classes/{uid}); firestore.rules reads `ids`.
import * as admin from './firebaseAdmin';

export const VERIFIED_CLASSES_COLLECTION = 'verified_classes';

/** Far above any real teacher; keeps the doc and the rules' list compare small. */
export const MAX_VERIFIED_CLASS_IDS = 400;
/** Per-source caps that add up to the list cap, so no source crowds out another. */
export const MAX_CLASSLINK_IDS = 300;
export const MAX_TEST_IDS = 50;
export const MAX_LMS_IDS = 50;
const MAX_ID_LENGTH = 300;

const LMS_PREFIXES = ['schoology:', 'classroom:'] as const;

export interface VerifiedClassesDoc {
  ids: string[];
  classlink: string[];
  test: string[];
  lms: string[];
  updatedAt: number;
  /** When ClassLink last answered for this teacher; absent until it has. */
  classlinkAt?: number;
}

export interface VerifiedClassesSources {
  /** null keeps the stored list (ClassLink could not answer). */
  classlink: readonly string[] | null;
  /** Added to the stored ClassLink part without marking it freshly read. */
  addClasslink?: readonly string[];
  /** null keeps the stored list. */
  test: readonly string[] | null;
  /** Added to the stored list. */
  addLms?: readonly string[];
}

const cleanIds = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? [
        ...new Set(
          raw.filter(
            (id): id is string =>
              typeof id === 'string' &&
              id.length > 0 &&
              id.length <= MAX_ID_LENGTH
          )
        ),
      ]
    : [];

export function isLmsClassId(id: string): boolean {
  return LMS_PREFIXES.some((p) => id.startsWith(p) && id.length > p.length);
}

/** The merged doc for `stored` plus `sources`; the newest LMS ids are kept. */
export function mergeVerifiedClasses(
  stored: Partial<Record<keyof VerifiedClassesDoc, unknown>> | undefined,
  sources: VerifiedClassesSources,
  now: number
): VerifiedClassesDoc {
  // Classes just imported go first, so a cap never drops them.
  const allClasslink = cleanIds([
    ...cleanIds(sources.addClasslink),
    ...(sources.classlink === null
      ? cleanIds(stored?.classlink)
      : cleanIds(sources.classlink)),
  ]);
  const allTest =
    sources.test === null ? cleanIds(stored?.test) : cleanIds(sources.test);
  const added = cleanIds(sources.addLms).filter(isLmsClassId);
  const allLms = [
    ...cleanIds(stored?.lms).filter((id) => !added.includes(id)),
    ...added,
  ];
  if (
    allClasslink.length > MAX_CLASSLINK_IDS ||
    allTest.length > MAX_TEST_IDS ||
    allLms.length > MAX_LMS_IDS
  ) {
    console.warn('[verifiedClasses] a source was cut at its cap', {
      classlink: allClasslink.length,
      test: allTest.length,
      lms: allLms.length,
    });
  }
  const classlink = allClasslink.slice(0, MAX_CLASSLINK_IDS);
  const test = allTest.slice(0, MAX_TEST_IDS);
  const lms = allLms.slice(-MAX_LMS_IDS);
  const ids = [...new Set([...classlink, ...test, ...lms])];
  const storedAt = stored?.classlinkAt;
  const classlinkAt =
    sources.classlink !== null
      ? now
      : typeof storedAt === 'number'
        ? storedAt
        : undefined;
  return {
    ids,
    classlink,
    test,
    lms,
    updatedAt: now,
    ...(classlinkAt !== undefined ? { classlinkAt } : {}),
  };
}

export async function writeVerifiedClasses(
  db: admin.firestore.Firestore,
  uid: string,
  sources: VerifiedClassesSources,
  now: number = Date.now()
): Promise<VerifiedClassesDoc> {
  const ref = db.doc(`${VERIFIED_CLASSES_COLLECTION}/${uid}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = mergeVerifiedClasses(
      snap.exists ? snap.data() : undefined,
      sources,
      now
    );
    tx.set(ref, next);
    return next;
  });
}

/** Records LMS sections or courses the server just verified the caller teaches. */
export async function addVerifiedLmsClasses(
  db: admin.firestore.Firestore,
  uid: string,
  ids: readonly string[]
): Promise<void> {
  const lms = ids.filter(isLmsClassId);
  if (!uid || lms.length === 0) return;
  await writeVerifiedClasses(db, uid, {
    classlink: null,
    test: null,
    addLms: lms,
  });
}

/** Until the rules release, only a list ClassLink has answered for counts; a teacher without one is not narrowed. */
export const MISSING_LIST_ALLOWS = true;

/** The ids on `uid`'s list, or null when the teacher has no list that counts yet. */
export async function loadVerifiedClassIds(
  db: admin.firestore.Firestore,
  uid: string
): Promise<Set<string> | null> {
  const snap = await db.doc(`${VERIFIED_CLASSES_COLLECTION}/${uid}`).get();
  const data = snap.exists ? snap.data() : undefined;
  if (!data) return null;
  if (MISSING_LIST_ALLOWS && typeof data.classlinkAt !== 'number') return null;
  return new Set(cleanIds(data.ids));
}

/** Shown when a class is not on the teacher's list. */
export const CLASS_NOT_TAUGHT_MESSAGE =
  'You can only assign to classes you teach in ClassLink.';

/** The ids in `ids` that are not on `uid`'s verified list. */
export async function unverifiedClassIds(
  db: admin.firestore.Firestore,
  uid: string,
  ids: readonly string[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const verified = await loadVerifiedClassIds(db, uid);
  if (!verified) return MISSING_LIST_ALLOWS ? [] : [...ids];
  return ids.filter((id) => !verified.has(id));
}

/** A verified, non-student, non-PIN address from a callable token, or null. */
export function staffEmailFromToken(token: unknown): string | null {
  if (!token || typeof token !== 'object') return null;
  const t = token as Record<string, unknown>;
  if (t.studentRole === true || t.pinLogin === true) return null;
  if (t.email_verified !== true) return null;
  const email = typeof t.email === 'string' ? t.email.trim().toLowerCase() : '';
  return email || null;
}
