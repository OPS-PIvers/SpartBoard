import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { OAuth2Client } from 'google-auth-library';
import './functionsInit';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
  GOOGLE_OAUTH_CLIENT_ID,
} from './secrets';
import { chunk } from './shared';
import { computeAssignmentPseudonym } from './assignmentPseudonym';
import {
  ALLOWED_ORIGINS,
  ONEROSTER_BASE,
  computeStudentUid,
  getOAuthHeaders,
  isSafeEmailForOneRosterFilter,
  type ClassLinkClass,
  type ClassLinkStudent,
  pinIndexKey,
  isBridgeablePin,
} from './classlinkShared';
import { normalizeQuizCode } from './quizCode';
import { quizJoinCodeOwner } from './quizJoinCodeOwner';
import {
  STUDENT_LOGIN_CLASS_IDS_MAX,
  StudentLookupError,
  isOneRosterStaff,
  resolveStudentByEmail,
  type OneRosterUserWithRole,
} from './studentEmailIdentity';
import {
  MAX_TARGET_REFS,
  loadTargetDirectory,
  resolveTargets,
  targetRefsFromAssignment,
} from './studentAssignmentTargets';
import { assertViewAsAllowed } from './viewAsGuard';

// Student identity (ClassLink-via-Google) — PII-free auth flow
// ---------------------------------------------------------------------------
//
// Students launch SpartBoard from their ClassLink LaunchPad tile. Because
// ClassLink is the district IdP and pushes identity into Google Workspace,
// the student is already signed in with Google on the Chromebook. We use
// Google Identity Services (GIS) client-side to obtain an ID token, verify
// it server-side, then look up the student in ClassLink OneRoster and mint
// a Firebase custom token whose UID is an HMAC pseudonym of the OneRoster
// sourcedId. Email / name / sub / sourcedId are never persisted.
//
// Intentional design choices:
//   - GIS + custom token (NOT signInWithPopup + GoogleAuthProvider) so that
//     the Firebase Auth user record never receives email/displayName/photoURL.
//   - Per-organization domain gating via existing
//     /organizations/{orgId}/domains subcollection; a login with a domain
//     not present (and verified) in any organization is rejected.
//   - Per-assignment pseudonym = HMAC(SECRET, uid + assignmentId) so the
//     server never needs the sourcedId after login. Teacher match-back
//     recomputes it from the OneRoster roster at grading time.
//   - NO PII logging. All catch blocks log class-of-failure only.

// Server-only record of a student's full OneRoster section list, re-checked against rosters on each directory call.
const STUDENT_SECTIONS_COLLECTION = 'student_sections';
const STUDENT_SECTIONS_MAX = 100;
// Firestore caps `in` at 30; 10 keeps each collectionGroup query small.
const FIRESTORE_IN_CHUNK_SIZE = 10;

type RosterSnap = FirebaseFirestore.QueryDocumentSnapshot;

/** Every teacher roster whose `classlinkClassId` is in `ids`, grouped by that id. */
async function lookupRostersBySection(
  db: FirebaseFirestore.Firestore,
  ids: readonly string[]
): Promise<Map<string, RosterSnap[]>> {
  const out = new Map<string, RosterSnap[]>();
  if (ids.length === 0) return out;
  const snapshots = await Promise.all(
    chunk([...new Set(ids)], FIRESTORE_IN_CHUNK_SIZE).map((idChunk) =>
      db
        .collectionGroup('rosters')
        .where('classlinkClassId', 'in', idChunk)
        .get()
    )
  );
  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      const value: unknown = doc.get('classlinkClassId');
      if (typeof value !== 'string') continue;
      const list = out.get(value);
      if (list) list.push(doc);
      else out.set(value, [doc]);
    }
  }
  return out;
}

const rosterUpdatedAt = (doc: RosterSnap): number => {
  const updated: unknown = doc.get('updatedAt');
  if (typeof updated === 'number') return updated;
  const created: unknown = doc.get('createdAt');
  return typeof created === 'number' ? created : 0;
};

const readBellPeriod = (
  data: FirebaseFirestore.DocumentData
): { buildingId: string; periodId: string } | undefined => {
  const bell: unknown = data.bellPeriod;
  if (!bell || typeof bell !== 'object') return undefined;
  const { buildingId, periodId } = bell as Record<string, unknown>;
  return typeof buildingId === 'string' &&
    buildingId &&
    typeof periodId === 'string' &&
    periodId
    ? { buildingId, periodId }
    : undefined;
};

const sameIdSet = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
};

/**
 * studentLoginV1
 *
 * Input:  { idToken: string }  — Google ID token from GIS on the client.
 * Output: { customToken, orgId, classCount } — client then calls
 *         signInWithCustomToken(customToken).
 *
 * Failure codes:
 *   - unauthenticated / invalid-argument: ID token missing or invalid.
 *   - permission-denied: email domain not registered with any organization.
 *   - not-found: student email not present in ClassLink OneRoster, or no
 *                classes enrolled, or account role is not 'student'.
 *   - internal: ClassLink API unreachable or server misconfigured.
 */
export const studentLoginV1 = onCall(
  {
    memory: '256MiB',
    cors: ALLOWED_ORIGINS,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
      STUDENT_PSEUDONYM_HMAC_SECRET,
      GOOGLE_OAUTH_CLIENT_ID,
    ],
    invoker: 'public',
  },
  async (request) => {
    assertViewAsAllowed(request);
    const rawIdToken = (request.data as { idToken?: unknown })?.idToken;
    const idToken = typeof rawIdToken === 'string' ? rawIdToken : '';
    if (!idToken) {
      throw new HttpsError('invalid-argument', 'Missing idToken.');
    }

    const googleClientId = GOOGLE_OAUTH_CLIENT_ID.value();
    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    const classlinkClientId = CLASSLINK_CLIENT_ID.value();
    const classlinkClientSecret = CLASSLINK_CLIENT_SECRET.value();
    const tenantUrl = CLASSLINK_TENANT_URL.value();
    if (
      !googleClientId ||
      !hmacSecret ||
      !classlinkClientId ||
      !classlinkClientSecret ||
      !tenantUrl
    ) {
      console.error(
        '[studentLoginV1] Missing required server configuration (secrets).'
      );
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    // 1. Verify the Google ID token signature and audience. The library also
    //    validates `iss`, `exp`, and our expected `aud` in one call.
    const oauthClient = new OAuth2Client();
    let email: string;
    let hd: string | undefined;
    let emailVerified: boolean;
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('no-payload');
      }
      email = typeof payload.email === 'string' ? payload.email : '';
      hd = typeof payload.hd === 'string' ? payload.hd : undefined;
      emailVerified = payload.email_verified === true;
    } catch {
      // Do not log token contents.
      console.warn('[studentLoginV1] ID token verification failed.');
      throw new HttpsError('unauthenticated', 'Invalid identity token.');
    }
    if (!email || !emailVerified) {
      throw new HttpsError('unauthenticated', 'Email not verified by Google.');
    }

    // 2-3. Org gate, the mock-class bypass, then the OneRoster user lookup.
    const db = admin.firestore();
    let student: Awaited<ReturnType<typeof resolveStudentByEmail>>;
    try {
      student = await resolveStudentByEmail(
        db,
        { email, hd },
        {
          hmacSecret,
          classlinkClientId,
          classlinkClientSecret,
          tenantUrl,
        },
        'studentLoginV1'
      );
    } catch (err) {
      if (!(err instanceof StudentLookupError)) throw err;
      switch (err.reason) {
        case 'malformed-email':
          throw new HttpsError('unauthenticated', 'Malformed email.');
        case 'rejected-domain':
          throw new HttpsError(
            'permission-denied',
            'This SpartBoard is only available to schools that have signed up.'
          );
        case 'not-in-roster':
          throw new HttpsError(
            'not-found',
            'No student record found in ClassLink roster.'
          );
        case 'roster-unavailable':
          throw new HttpsError('internal', 'Roster service unavailable.');
      }
    }
    const { orgId } = student;
    if (student.kind === 'test') {
      const mockClassIds = student.mockClassIds;
      try {
        const customToken = await admin.auth().createCustomToken(student.uid, {
          studentRole: true,
          orgId,
          classIds: mockClassIds,
        });
        return { customToken, orgId, classCount: mockClassIds.length };
      } catch (err) {
        console.error(
          '[studentLoginV1] createCustomToken failed (test bypass):',
          err
        );
        throw new HttpsError('internal', 'Failed to mint auth token.');
      }
    }

    // 3b. The student's classes from OneRoster, held in memory only.
    const sourcedId = student.sourcedId;
    let sectionIds: string[];
    try {
      const classesUrl = `${tenantUrl.replace(/\/$/, '')}${ONEROSTER_BASE}/users/${sourcedId}/classes`;
      const classesHeaders = getOAuthHeaders(
        classesUrl,
        {},
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const classesResp = await axios.get<{ classes: ClassLinkClass[] }>(
        classesUrl,
        { headers: { ...classesHeaders } }
      );
      sectionIds = [
        ...new Set(
          (classesResp.data.classes ?? [])
            .map((c) => c.sourcedId)
            .filter(
              (id): id is string => typeof id === 'string' && id.length > 0
            )
        ),
      ].slice(0, STUDENT_SECTIONS_MAX);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error(
          '[studentLoginV1] ClassLink request failed:',
          err.response?.status
        );
      } else {
        console.error('[studentLoginV1] ClassLink request failed.');
      }
      throw new HttpsError('internal', 'Roster service unavailable.');
    }

    // 4. Keep only sections a teacher has imported as a roster, so homeroom,
    //    lunch and unimported sections never take a slot under the cap.
    let rosterMatches: Map<string, RosterSnap[]>;
    try {
      rosterMatches = await lookupRostersBySection(db, sectionIds);
    } catch (err) {
      console.error('[studentLoginV1] roster lookup failed:', err);
      throw new HttpsError('internal', 'Roster service unavailable.');
    }
    const classIds = sectionIds
      .filter((id) => rosterMatches.has(id))
      .slice(0, STUDENT_LOGIN_CLASS_IDS_MAX);

    // 5. Compute the stable opaque UID and mint the custom token with
    //    the classIds claim that gates Firestore reads.
    const uid = student.uid;

    // Best effort: without this record the directory call can't pick up a
    // section a teacher imports later, but sign-in still works.
    try {
      await db.doc(`${STUDENT_SECTIONS_COLLECTION}/${uid}`).set({
        orgId,
        sectionIds,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('[studentLoginV1] student_sections write failed:', err);
    }

    let customToken: string;
    try {
      customToken = await admin.auth().createCustomToken(uid, {
        studentRole: true,
        orgId,
        classIds,
        sso: true,
      });
    } catch (err) {
      console.error('[studentLoginV1] createCustomToken failed:', err);
      throw new HttpsError('internal', 'Failed to mint auth token.');
    }

    return { customToken, orgId, classCount: classIds.length };
  }
);

/**
 * getAssignmentPseudonymV1
 *
 * Called by the authenticated student client when opening a specific
 * assignment. Returns the opaque pseudonym to write into the response doc:
 *
 *   pseudonym = HMAC_SHA256(HMAC_SECRET, "asn:" + uid + ":" + assignmentId)
 *
 * Stable within (uid, assignmentId), unlinkable across assignments, and
 * unlinkable to a student without both the HMAC secret AND the OneRoster
 * roster.
 */
export const getAssignmentPseudonymV1 = onCall(
  {
    memory: '256MiB',
    secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  (request) => {
    assertViewAsAllowed(request, { read: true });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    if (request.auth.token.studentRole !== true) {
      throw new HttpsError('permission-denied', 'Student role required.');
    }
    const rawAssignmentId = (request.data as { assignmentId?: unknown })
      ?.assignmentId;
    const assignmentId =
      typeof rawAssignmentId === 'string' ? rawAssignmentId : '';
    if (!assignmentId || assignmentId.length > 200) {
      throw new HttpsError('invalid-argument', 'Invalid assignmentId.');
    }

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    if (!hmacSecret) {
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    const pseudonym = computeAssignmentPseudonym(
      request.auth.uid,
      assignmentId,
      hmacSecret
    );
    return { pseudonym };
  }
);

/**
 * getStudentClassDirectoryV1
 *
 * Returns the authenticated student's classes (name, teachers, subject, code)
 * so the `/my-assignments` sidebar shows "English 9 / Ms. Halverson" instead
 * of an opaque sourcedId. Classes are sorted by name.
 *
 * A class is listed only when it resolves:
 *   1. `collectionGroup('rosters').where('classlinkClassId', 'in', …)` —
 *      real ClassLink imports. Safe across orgs because ClassLink-issued
 *      sourcedIds are not admin-controlled. A co-taught section is one entry:
 *      its name, subject and code come from the most recently updated
 *      matching roster, and every matching teacher is listed.
 *   2. `organizations/{orgId}/testClasses/{classId}` — admin-managed test
 *      classes. Always read via the org-scoped doc path (never via a
 *      collectionGroup lookup on `testClassId`) because test class IDs are
 *      admin-chosen slugs that can collide across orgs.
 * Anything else is dropped; the client never renders a placeholder for it.
 *
 * Re-check: when `student_sections/{uid}` holds the student's OneRoster
 * sections from sign-in, they are re-matched against rosters on every call.
 * If the matched set differs from the token's `classIds` claim, the response
 * carries a fresh `customToken` (same uid, new claim) that the client signs
 * in with, so a class imported mid-day appears without signing out.
 *
 * PII: this function never returns student names, emails, or any field from
 * the per-roster Drive file. Only Firestore-side roster meta (which is
 * itself PII-free) plus the teacher's own `displayName` from Firebase Auth.
 * Teacher names are organizational data, not student PII.
 */
export const getStudentClassDirectoryV1 = onCall(
  {
    memory: '256MiB',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    assertViewAsAllowed(request, { read: true });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    if (request.auth.token.studentRole !== true) {
      throw new HttpsError('permission-denied', 'Student role required.');
    }

    const rawClassIds: unknown = request.auth.token.classIds;
    if (!Array.isArray(rawClassIds)) {
      throw new HttpsError('failed-precondition', 'No classes on token.');
    }
    const tokenClassIds = rawClassIds
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
      .slice(0, STUDENT_LOGIN_CLASS_IDS_MAX);

    const orgId =
      typeof request.auth.token.orgId === 'string'
        ? request.auth.token.orgId
        : '';
    const uid = request.auth.uid;

    const db = admin.firestore();

    // Stored sections widen the candidates, only for SSO tokens; a PIN token shares the uid but proves one class.
    let storedSectionIds: string[] | null = null;
    if (orgId && request.auth.token.sso === true) {
      const sectionsSnap = await db
        .doc(`${STUDENT_SECTIONS_COLLECTION}/${uid}`)
        .get()
        .catch(() => null);
      const data = sectionsSnap?.exists ? sectionsSnap.data() : undefined;
      if (data && data.orgId === orgId && Array.isArray(data.sectionIds)) {
        storedSectionIds = (data.sectionIds as unknown[])
          .filter((c): c is string => typeof c === 'string' && c.length > 0)
          .slice(0, STUDENT_SECTIONS_MAX);
      }
    }
    const candidateIds = [
      ...new Set([...tokenClassIds, ...(storedSectionIds ?? [])]),
    ];
    if (candidateIds.length === 0) {
      return { classes: [] };
    }

    // Per-call cache: many classes may share a teacher; one Auth lookup
    // suffices.
    const teacherNameCache = new Map<string, string>();
    const resolveTeacherName = async (teacherUid: string): Promise<string> => {
      const cached = teacherNameCache.get(teacherUid);
      if (cached !== undefined) return cached;
      try {
        const user = await admin.auth().getUser(teacherUid);
        const displayName =
          (typeof user.displayName === 'string' && user.displayName) ||
          (typeof user.email === 'string' ? user.email.split('@')[0] : '') ||
          '';
        teacherNameCache.set(teacherUid, displayName);
        return displayName;
      } catch {
        // Auth lookup can fail for legacy / deleted teacher accounts. Caller
        // falls back to an empty teacher name; the row still renders.
        teacherNameCache.set(teacherUid, '');
        return '';
      }
    };

    interface DirectoryEntry {
      classId: string;
      name: string;
      /** All teacher names joined with " & ", kept for older clients. */
      teacherDisplayName: string;
      teacherDisplayNames: string[];
      subject?: string;
      code?: string;
      bellPeriod?: { buildingId: string; periodId: string };
    }

    const buildEntryFromRosters = async (
      classId: string,
      rosterDocs: readonly RosterSnap[]
    ): Promise<DirectoryEntry> => {
      const ordered = [...rosterDocs].sort(
        (a, b) => rosterUpdatedAt(b) - rosterUpdatedAt(a)
      );
      const newest = ordered[0].data();
      const teacherUids = [
        ...new Set(
          ordered
            .map((d) => d.ref.parent.parent?.id ?? '')
            .filter((id) => id.length > 0)
        ),
      ];
      const teacherDisplayNames = (
        await Promise.all(teacherUids.map(resolveTeacherName))
      ).filter((n) => n.length > 0);
      const bellPeriod = ordered
        .map((d) => readBellPeriod(d.data()))
        .find(Boolean);
      return {
        classId,
        name:
          typeof newest.name === 'string' && newest.name.length > 0
            ? newest.name
            : classId,
        teacherDisplayName: teacherDisplayNames.join(' & '),
        teacherDisplayNames,
        subject:
          typeof newest.classlinkSubject === 'string'
            ? newest.classlinkSubject
            : undefined,
        code:
          typeof newest.classlinkClassCode === 'string'
            ? newest.classlinkClassCode
            : undefined,
        ...(bellPeriod ? { bellPeriod } : {}),
      };
    };

    const rosterMatches = await lookupRostersBySection(db, candidateIds);

    // Test classes only ever arrive on the token (stored sections are real
    // OneRoster ids). The org-scoped doc path is gated by the student's
    // verified `orgId` claim, so it cannot cross org boundaries.
    const unresolvedTokenIds = tokenClassIds.filter(
      (id) => !rosterMatches.has(id)
    );
    const testClassDocs = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    if (orgId && unresolvedTokenIds.length > 0) {
      const docs = await Promise.all(
        unresolvedTokenIds.map((id) =>
          db
            .doc(`organizations/${orgId}/testClasses/${id}`)
            .get()
            .catch(() => null)
        )
      );
      for (let i = 0; i < unresolvedTokenIds.length; i++) {
        const d = docs[i];
        if (d && d.exists) testClassDocs.set(unresolvedTokenIds[i], d);
      }
    }
    const resolves = (id: string) =>
      rosterMatches.has(id) || testClassDocs.has(id);

    // Token ids that still resolve keep their slots ahead of newly matched sections.
    let listedIds = tokenClassIds.filter(resolves);
    let customToken: string | undefined;
    if (storedSectionIds) {
      const nextClaim = [
        ...listedIds,
        ...storedSectionIds.filter(
          (id) => !listedIds.includes(id) && resolves(id)
        ),
      ].slice(0, STUDENT_LOGIN_CLASS_IDS_MAX);
      if (!sameIdSet(nextClaim, tokenClassIds)) {
        try {
          customToken = await admin.auth().createCustomToken(uid, {
            studentRole: true,
            orgId,
            classIds: nextClaim,
            sso: true,
          });
          listedIds = nextClaim;
        } catch (err) {
          // The current claim still works; the new class shows on next sign-in.
          console.error(
            '[getStudentClassDirectoryV1] createCustomToken failed:',
            err
          );
        }
      }
    }

    const entries = await Promise.all(
      listedIds.map(async (classId): Promise<DirectoryEntry> => {
        const fromRosters = rosterMatches.get(classId);
        if (fromRosters) return buildEntryFromRosters(classId, fromRosters);
        const data = testClassDocs.get(classId)?.data() ?? {};
        return {
          classId,
          name:
            typeof data.title === 'string' && data.title.length > 0
              ? data.title
              : classId,
          teacherDisplayName: '',
          teacherDisplayNames: [],
          subject: typeof data.subject === 'string' ? data.subject : undefined,
        };
      })
    );

    const classes = entries.sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        }) || a.classId.localeCompare(b.classId)
    );
    return customToken
      ? { classes, customToken, classIds: listedIds }
      : { classes };
  }
);

/**
 * getPseudonymsForAssignmentV1
 *
 * Called by a teacher's client when rendering the grading view for an
 * assignment. Returns both pseudonyms plus names for every student in the
 * targeted ClassLink class:
 *   { sourcedId -> { studentUid, assignmentPseudonym, givenName, familyName } }
 * so the teacher's client can join Firestore responses (keyed by either the
 * session-scoped studentUid for quiz/video/guided-learning or the
 * assignment-scoped pseudonym for mini-app submissions) back to roster
 * identity and display names. Names never touch Firestore — they stay in
 * teacher-browser memory for the session. The HMAC secret never leaves the
 * server.
 *
 * Only callable by a teacher who actually teaches the requested class
 * (ClassLink membership is re-verified on every call).
 */
export const getPseudonymsForAssignmentV1 = onCall(
  {
    memory: '256MiB',
    // Warm in prod only; the CLI sets GCLOUD_PROJECT during deploy discovery, unset falls back to warm.
    minInstances: process.env.GCLOUD_PROJECT === 'spartboard-dev' ? 0 : 1,
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
    // Teachers authenticate with standard Firebase Auth (email present on
    // token). Students never have email on their token, so this also keeps
    // students out of the teacher-only endpoint.
    const teacherEmail = request.auth.token.email;
    if (!teacherEmail || request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }
    // teacherEmail drives ClassLink/org authorization below, so it must be verified (same rail as isAdmin()).
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError(
        'permission-denied',
        'Caller email must be verified.'
      );
    }

    const data = request.data as {
      assignmentId?: unknown;
      classId?: unknown;
      orgId?: unknown;
      targetStudents?: unknown;
    };
    const assignmentId =
      typeof data?.assignmentId === 'string' ? data.assignmentId : '';
    const classId = typeof data?.classId === 'string' ? data.classId : '';
    // M17 D2: `targetMode:'students'` assignments span partial rosters, so the
    // caller may send the assignment's target refs instead of a classId. Absent
    // ⇒ the legacy whole-class path below, unchanged.
    const targetStudents = Array.isArray(data?.targetStudents)
      ? targetRefsFromAssignment({
          targetStudents: data.targetStudents.slice(0, MAX_TARGET_REFS),
        })
      : [];
    // orgId is optional for backwards compatibility (older clients). The
    // test-class branch only activates when it's provided AND the requested
    // classId resolves to a `testClasses` doc under that org.
    const orgId = typeof data?.orgId === 'string' ? data.orgId : '';
    if (!assignmentId || (!classId && targetStudents.length === 0)) {
      throw new HttpsError(
        'invalid-argument',
        'assignmentId and classId are required.'
      );
    }

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    const classlinkClientId = CLASSLINK_CLIENT_ID.value();
    const classlinkClientSecret = CLASSLINK_CLIENT_SECRET.value();
    const tenantUrl = CLASSLINK_TENANT_URL.value();
    if (
      !hmacSecret ||
      !classlinkClientId ||
      !classlinkClientSecret ||
      !tenantUrl
    ) {
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    // ── Target-refs branch (M17 D2) ──────────────────────────────────────
    // Resolves exactly the refs the caller asked for, through the SAME
    // authorization used by `setAssignmentTargetsV1`: a ref that maps to no
    // class the caller teaches (and a `test` ref from a non-test-class
    // authority) is reported in `skipped`, never name-resolved.
    if (targetStudents.length > 0) {
      const db = admin.firestore();
      const { ctx, namesByRefKey } = await loadTargetDirectory(
        db,
        request.auth.uid,
        teacherEmail,
        { classlinkClientId, classlinkClientSecret, tenantUrl },
        (err) => {
          if (axios.isAxiosError(err)) {
            console.error(
              '[getPseudonymsForAssignmentV1] ClassLink request failed:',
              err.response?.status
            );
          } else {
            console.error('[getPseudonymsForAssignmentV1] Unexpected failure.');
          }
          throw new HttpsError('internal', 'Roster service unavailable.');
        }
      );
      const { resolved, skipped } = resolveTargets(
        targetStudents,
        ctx,
        hmacSecret
      );
      const pseudonyms: Record<
        string,
        {
          studentUid: string;
          assignmentPseudonym: string;
          givenName: string;
          familyName: string;
          targetRefKey: string;
        }
      > = {};
      for (const target of resolved) {
        const name = namesByRefKey.get(target.key);
        pseudonyms[
          target.ref.kind === 'classlink'
            ? target.ref.sourcedId
            : target.ref.email
        ] = {
          studentUid: target.uid,
          targetRefKey: target.key,
          assignmentPseudonym: computeAssignmentPseudonym(
            target.uid,
            assignmentId,
            hmacSecret
          ),
          givenName: name?.givenName ?? '',
          familyName: name?.familyName ?? '',
        };
      }
      return { pseudonyms, skipped };
    }

    // ── Test-class branch ────────────────────────────────────────────────
    // Test classes (admin-managed mocks under `organizations/{orgId}/testClasses`)
    // bypass ClassLink entirely. Their students log in via the `studentLoginV1`
    // test bypass, which mints UIDs as `HMAC("sid:test:{emailLower}", secret)`.
    // ClassLink OneRoster has no record of them, so the standard branch returns
    // an empty pseudonym map and the teacher monitor falls back to "Student".
    // This branch resolves names from the `memberEmails` array on the test-class
    // doc, using the email local-part as the display name (matching what
    // `materializeTestClassStudents` shows in the import dialog).
    if (orgId) {
      const db = admin.firestore();
      const teacherEmailLower = teacherEmail.toLowerCase();
      const memberRef = db.doc(
        `organizations/${orgId}/members/${teacherEmailLower}`
      );
      const memberSnap = await memberRef.get();
      if (!memberSnap.exists) {
        throw new HttpsError(
          'permission-denied',
          'Not a member of this organization.'
        );
      }

      const testClassRef = db.doc(
        `organizations/${orgId}/testClasses/${classId}`
      );
      const testClassSnap = await testClassRef.get();
      if (testClassSnap.exists) {
        // Authorize: teacher must own a roster whose `testClassId` matches.
        // Roster metadata lives in Firestore (no Drive read needed for this
        // gate). Same trust model as the ClassLink branch's "teaches this
        // class" check, but anchored to the teacher's own roster ownership.
        const ownedRosters = await db
          .collection(`users/${request.auth.uid}/rosters`)
          .where('testClassId', '==', classId)
          .limit(1)
          .get();
        if (ownedRosters.empty) {
          throw new HttpsError(
            'permission-denied',
            'Not a teacher of this test class.'
          );
        }

        const testClassData = (testClassSnap.data() ?? {}) as {
          memberEmails?: unknown;
        };
        const memberEmails = Array.isArray(testClassData.memberEmails)
          ? testClassData.memberEmails.filter(
              (e): e is string => typeof e === 'string' && e.length > 0
            )
          : [];

        const pseudonyms: Record<
          string,
          {
            studentUid: string;
            assignmentPseudonym: string;
            givenName: string;
            familyName: string;
            targetRefKey: string;
          }
        > = {};
        for (const rawEmail of memberEmails) {
          const emailLower = rawEmail.toLowerCase();
          // Mirrors `studentLoginV1` test-bypass UID minting at
          // functions/src/index.ts ~2868: HMAC over "sid:test:{emailLower}".
          const studentUid = computeStudentUid(
            `test:${emailLower}`,
            hmacSecret
          );
          // Display name = email local-part. This matches what the import
          // dialog already shows (`materializeTestClassStudents` line 66:
          // `firstName: email.split('@')[0]`), so the monitor view stays
          // consistent with the roster.
          const localPart = emailLower.split('@')[0] || emailLower;
          // Key by the lowercased email (no `sourcedId` exists for test
          // students). The client-side hook only iterates `Object.values`
          // and re-keys by `studentUid`, so the key choice is internal.
          // `targetRefKey` mirrors `studentTargetRefKey()` (utils/studentTargetRef.ts)
          // so the grader (C4) can resolve `overridesBySourcedId` without
          // duplicating the namespacing rule client-side.
          pseudonyms[emailLower] = {
            studentUid,
            targetRefKey: `test:${emailLower}`,
            assignmentPseudonym: computeAssignmentPseudonym(
              studentUid,
              assignmentId,
              hmacSecret
            ),
            givenName: localPart,
            familyName: '',
          };
        }
        return { pseudonyms };
      }
    }

    const cleanTenantUrl = tenantUrl.replace(/\/$/, '');

    // Verify the teacher actually teaches this class before disclosing the
    // roster pseudonyms. A teacher can only retrieve pseudonyms for their
    // own classes.
    try {
      if (!isSafeEmailForOneRosterFilter(teacherEmail)) {
        throw new HttpsError(
          'not-found',
          'Teacher not found in ClassLink roster.'
        );
      }
      const teacherUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/users`;
      const teacherParams = { filter: `email='${teacherEmail}'` };
      const teacherHeaders = getOAuthHeaders(
        teacherUrl,
        teacherParams,
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const teacherResp = await axios.get<{ users: OneRosterUserWithRole[] }>(
        teacherUrl,
        { params: teacherParams, headers: { ...teacherHeaders } }
      );
      const teacherUser = (teacherResp.data.users ?? []).find(isOneRosterStaff);
      if (!teacherUser) {
        throw new HttpsError(
          'not-found',
          'Teacher not found in ClassLink roster.'
        );
      }
      const classesUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/users/${teacherUser.sourcedId}/classes`;
      const classesHeaders = getOAuthHeaders(
        classesUrl,
        {},
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const classesResp = await axios.get<{ classes: ClassLinkClass[] }>(
        classesUrl,
        { headers: { ...classesHeaders } }
      );
      const teaches = (classesResp.data.classes ?? []).some(
        (c) => c.sourcedId === classId
      );
      if (!teaches) {
        throw new HttpsError(
          'permission-denied',
          'Not a teacher of this class.'
        );
      }

      // Now fetch the class's students and compute the pseudonym map.
      const studentsUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/classes/${classId}/students`;
      const studentsHeaders = getOAuthHeaders(
        studentsUrl,
        {},
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const studentsResp = await axios.get<{ users: ClassLinkStudent[] }>(
        studentsUrl,
        { headers: { ...studentsHeaders } }
      );
      const students = studentsResp.data.users ?? [];

      // Return both pseudonyms so teacher viewers can match whichever one
      // the response doc is keyed by:
      //  - studentUid            — HMAC(sourcedId, secret); equals the
      //                            ClassLink student's Firebase Auth UID.
      //                            Used by quiz/video-activity/guided-learning
      //                            response docs that key on auth.currentUser.uid.
      //  - assignmentPseudonym   — HMAC(studentUid + assignmentId, secret).
      //                            Used by mini-app submission docs that key
      //                            on a per-assignment opaque id.
      const pseudonyms: Record<
        string,
        {
          studentUid: string;
          assignmentPseudonym: string;
          givenName: string;
          familyName: string;
          targetRefKey: string;
        }
      > = {};
      for (const s of students) {
        if (!s.sourcedId) continue;
        const studentUid = computeStudentUid(s.sourcedId, hmacSecret);
        pseudonyms[s.sourcedId] = {
          studentUid,
          // Mirrors `studentTargetRefKey()` (utils/studentTargetRef.ts) so
          // the grader (C4) can resolve `overridesBySourcedId` without
          // duplicating the namespacing rule client-side.
          targetRefKey: `classlink:${s.sourcedId}`,
          assignmentPseudonym: computeAssignmentPseudonym(
            studentUid,
            assignmentId,
            hmacSecret
          ),
          givenName: s.givenName ?? '',
          familyName: s.familyName ?? '',
        };
      }
      return { pseudonyms };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (axios.isAxiosError(err)) {
        console.error(
          '[getPseudonymsForAssignmentV1] ClassLink request failed:',
          err.response?.status
        );
      } else {
        console.error('[getPseudonymsForAssignmentV1] Unexpected failure.');
      }
      throw new HttpsError('internal', 'Roster service unavailable.');
    }
  }
);

// ─── PIN → SSO identity unification (Phase 3) ────────────────────────────────
//
// `pinLoginV1` lets a PIN-joining student authenticate with a custom token
// whose uid is the same HMAC pseudonym `studentLoginV1` would mint for them
// if they came in via SSO. Once they sign in with that token, the per-session
// response doc keys by their `auth.uid` (= the SSO uid), so a student who
// joins one launch via SSO and another via PIN converges on the same response
// doc and the per-session attempt cap holds across both auth paths.
//
// `commitRosterPinIndexV1` is the teacher-side companion: when a teacher saves
// a ClassLink-origin roster, the client posts the (period, pin, sourcedId)
// tuples and this function writes the non-PII pin_index sidecar that
// pinLoginV1 reads. PII (names, emails) never leaves Drive — the index holds
// only opaque hashes and ids.

const PIN_INDEX_SUBCOLLECTION = 'pin_index';
/** Exported so the nightly sync caps its entries at the same value rather
 *  than mirroring the literal and silently drifting from it. */
export const PIN_INDEX_MAX_ENTRIES = 200;

const ONEROSTER_PAGE_LIMIT = 200;
const ONEROSTER_MAX_PAGES = 10;
const CLASSLINK_TIMEOUT_MS = 20000;

/** Every page of a OneRoster list endpoint, or null if it ran past the page cap. */
async function fetchOneRosterPages<T>(
  url: string,
  key: string,
  creds: { classlinkClientId: string; classlinkClientSecret: string }
): Promise<T[] | null> {
  const out: T[] = [];
  for (let page = 0; page < ONEROSTER_MAX_PAGES; page += 1) {
    // OneRoster signs the query string, so the same params go to both.
    const params = {
      limit: String(ONEROSTER_PAGE_LIMIT),
      offset: String(page * ONEROSTER_PAGE_LIMIT),
    };
    const headers = getOAuthHeaders(
      url,
      params,
      'GET',
      creds.classlinkClientId,
      creds.classlinkClientSecret
    );
    const res = await axios.get<Record<string, T[] | undefined>>(url, {
      params,
      headers: { ...headers },
      timeout: CLASSLINK_TIMEOUT_MS,
    });
    const batch = res.data[key] ?? [];
    out.push(...batch);
    if (batch.length < ONEROSTER_PAGE_LIMIT) return out;
  }
  return null;
}

/**
 * Sourced ids of the students ClassLink enrolls in `classId`, or null when the
 * caller is not a non-student ClassLink user who teaches it. Throws
 * `unavailable` when ClassLink can't answer, so a caller never prunes on an outage.
 */
export async function loadTaughtClassEnrollment(
  teacherEmail: string,
  classId: string,
  creds: {
    classlinkClientId: string;
    classlinkClientSecret: string;
    tenantUrl: string;
  }
): Promise<Set<string> | null> {
  if (
    !creds.classlinkClientId ||
    !creds.classlinkClientSecret ||
    !creds.tenantUrl
  ) {
    throw new HttpsError('internal', 'Server configuration missing.');
  }
  if (!isSafeEmailForOneRosterFilter(teacherEmail)) return null;
  const base = `${creds.tenantUrl.replace(/\/$/, '')}${ONEROSTER_BASE}`;
  try {
    const usersUrl = `${base}/users`;
    const userParams = { filter: `email='${teacherEmail}'` };
    const userHeaders = getOAuthHeaders(
      usersUrl,
      userParams,
      'GET',
      creds.classlinkClientId,
      creds.classlinkClientSecret
    );
    const userResp = await axios.get<{ users?: OneRosterUserWithRole[] }>(
      usersUrl,
      {
        params: userParams,
        headers: { ...userHeaders },
        timeout: CLASSLINK_TIMEOUT_MS,
      }
    );
    const teacher = (userResp.data.users ?? []).find(isOneRosterStaff);
    if (!teacher?.sourcedId) return null;

    // Unpaged, like getClassLinkRosterV1, so any class the import dialog listed is found here.
    const classesUrl = `${base}/users/${encodeURIComponent(teacher.sourcedId)}/classes`;
    const classesHeaders = getOAuthHeaders(
      classesUrl,
      {},
      'GET',
      creds.classlinkClientId,
      creds.classlinkClientSecret
    );
    const classesResp = await axios.get<{ classes?: ClassLinkClass[] }>(
      classesUrl,
      { headers: { ...classesHeaders }, timeout: CLASSLINK_TIMEOUT_MS }
    );
    if (
      !(classesResp.data.classes ?? []).some((c) => c.sourcedId === classId)
    ) {
      return null;
    }

    const students = await fetchOneRosterPages<ClassLinkStudent>(
      `${base}/classes/${encodeURIComponent(classId)}/students`,
      'users',
      creds
    );
    if (!students) throw new Error('student list truncated');
    return new Set(
      students
        .map((s) => s.sourcedId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error(
      '[loadTaughtClassEnrollment] ClassLink request failed:',
      axios.isAxiosError(err) ? err.response?.status : 'unexpected'
    );
    throw new HttpsError('unavailable', 'Roster service unavailable.');
  }
}

interface CommitRosterPinIndexEntry {
  period: string;
  pin: string;
  classlinkSourcedId: string;
}

/**
 * commitRosterPinIndexV1
 *
 * Input:
 *   {
 *     rosterId: string,
 *     entries: Array<{ period, pin, classlinkSourcedId }>
 *   }
 *
 * The caller MUST be the teacher who owns the roster (the function checks
 * `users/{auth.uid}/rosters/{rosterId}` exists). The full set of entries
 * replaces the existing pin_index for the roster — entries dropped from the
 * input list have their corresponding index docs deleted in the same batch,
 * so a student removed from the roster automatically loses their
 * pin_index entry.
 *
 * The function reads the roster doc to recover `classlinkClassId` (used as
 * the index entry's `classId`) and `classlinkOrgId` (used for telemetry —
 * not written into the index). Only ClassLink-origin rosters with a
 * `classlinkClassId` produce an index; legacy local rosters skip silently
 * (no error) so the client's "build the index after every save" hook is
 * idempotent across both kinds.
 */
export const commitRosterPinIndexV1 = onCall(
  {
    memory: '256MiB',
    // Several sequential ClassLink lookups can outrun the 60 s default.
    timeoutSeconds: 120,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
      STUDENT_PSEUDONYM_HMAC_SECRET,
    ],
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    assertViewAsAllowed(request);
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    // Students cannot rebuild a teacher's index. The client-side caller is
    // always the teacher who saved the roster.
    if (request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher role required.');
    }
    // The verified email is what ClassLink checks below; anonymous callers have none.
    const teacherEmail =
      typeof request.auth.token.email === 'string'
        ? request.auth.token.email
        : '';
    if (!teacherEmail || request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }

    const rawData = (request.data ?? {}) as {
      rosterId?: unknown;
      entries?: unknown;
    };
    const rosterId =
      typeof rawData.rosterId === 'string' ? rawData.rosterId : '';
    if (!rosterId) {
      throw new HttpsError('invalid-argument', 'rosterId is required.');
    }
    if (!Array.isArray(rawData.entries)) {
      throw new HttpsError('invalid-argument', 'entries must be an array.');
    }
    if (rawData.entries.length > PIN_INDEX_MAX_ENTRIES) {
      throw new HttpsError(
        'invalid-argument',
        `entries exceeds the max of ${PIN_INDEX_MAX_ENTRIES}.`
      );
    }

    const entries: CommitRosterPinIndexEntry[] = [];
    let skippedMalformed = 0;
    for (const e of rawData.entries) {
      if (typeof e !== 'object' || e === null) {
        skippedMalformed++;
        continue;
      }
      const period = (e as { period?: unknown }).period;
      const pin = (e as { pin?: unknown }).pin;
      const sourcedId = (e as { classlinkSourcedId?: unknown })
        .classlinkSourcedId;
      if (
        typeof period !== 'string' ||
        typeof pin !== 'string' ||
        typeof sourcedId !== 'string' ||
        period.length === 0 ||
        pin.length === 0 ||
        sourcedId.length === 0
      ) {
        // Skip malformed entries; don't fail the whole rebuild. Counted
        // and surfaced in the response so the client can warn the
        // teacher when one student's row is silently dropped (a typo'd
        // ClassLink id otherwise produces an unindexed student who
        // bypasses the cross-launch cap on legacy PIN).
        skippedMalformed++;
        continue;
      }
      entries.push({ period, pin, classlinkSourcedId: sourcedId });
    }
    if (skippedMalformed > 0) {
      console.warn(
        `[commitRosterPinIndexV1] Skipped ${skippedMalformed} malformed entries in roster ${rosterId}`
      );
    }

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    if (!hmacSecret) {
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    const db = admin.firestore();
    const rosterRef = db
      .collection('users')
      .doc(request.auth.uid)
      .collection('rosters')
      .doc(rosterId);
    const rosterSnap = await rosterRef.get();
    if (!rosterSnap.exists) {
      throw new HttpsError('not-found', 'Roster not found.');
    }
    const rosterData = rosterSnap.data() ?? {};
    const classlinkClassId: unknown = rosterData.classlinkClassId;
    let verifiedEntries = entries;
    let skippedNotEnrolled = 0;
    if (typeof classlinkClassId === 'string' && classlinkClassId.length > 0) {
      // The roster doc is client-written, so ClassLink itself must confirm the
      // caller teaches this class and each student is enrolled in it.
      const enrolled = await loadTaughtClassEnrollment(
        teacherEmail,
        classlinkClassId,
        {
          classlinkClientId: CLASSLINK_CLIENT_ID.value(),
          classlinkClientSecret: CLASSLINK_CLIENT_SECRET.value(),
          tenantUrl: CLASSLINK_TENANT_URL.value(),
        }
      );
      if (!enrolled) {
        console.warn('[commitRosterPinIndexV1] rejected', {
          reason: 'class-not-taught',
          rosterId,
        });
        throw new HttpsError(
          'permission-denied',
          'Not a teacher of this class.'
        );
      }
      verifiedEntries = entries.filter((e) =>
        enrolled.has(e.classlinkSourcedId)
      );
      skippedNotEnrolled = entries.length - verifiedEntries.length;
      if (skippedNotEnrolled > 0) {
        console.warn(
          `[commitRosterPinIndexV1] Skipped ${skippedNotEnrolled} entries not enrolled in roster ${rosterId}`
        );
      }
    }
    const result = await reconcileRosterPinIndex(
      db,
      rosterRef,
      rosterData,
      verifiedEntries,
      hmacSecret
    );
    return { ...result, skippedMalformed, skippedNotEnrolled };
  }
);

/**
 * Write the `pin_index` sidecar for a roster and delete entries no longer
 * desired. Extracted from `commitRosterPinIndexV1` so the nightly ClassLink
 * sync can reconcile the same sidecar with no teacher in the request — a
 * removed student whose entry survived would still pass the PIN→SSO gate.
 */
export async function reconcileRosterPinIndex(
  db: admin.firestore.Firestore,
  rosterRef: admin.firestore.DocumentReference,
  rosterData: admin.firestore.DocumentData,
  entries: readonly CommitRosterPinIndexEntry[],
  hmacSecret: string
): Promise<{
  wrote: number;
  deleted: number;
  skippedReason?: 'no-classlink-class-id';
}> {
  {
    const classlinkClassId =
      typeof rosterData.classlinkClassId === 'string' &&
      rosterData.classlinkClassId.length > 0
        ? rosterData.classlinkClassId
        : null;
    // Optional on the roster doc; empty-string default keeps the
    // pin_index entry shape stable so `pinLoginV1` can read a string
    // field unconditionally. Stored alongside `classId` so the login
    // path doesn't need a `collectionGroup` lookup to recover orgId.
    const classlinkOrgId =
      typeof rosterData.classlinkOrgId === 'string'
        ? rosterData.classlinkOrgId
        : '';
    if (!classlinkClassId) {
      // Local rosters have no ClassLink class id and so can't bridge into
      // the SSO uid space. Returning success (with `wrote: 0`) keeps the
      // client's "save then commit index" hook idempotent across roster
      // types — it doesn't have to special-case origin.
      return {
        wrote: 0,
        deleted: 0,
        skippedReason: 'no-classlink-class-id' as const,
      };
    }

    // Compute the desired set of (indexKey -> doc payload) tuples.
    const desired = new Map<
      string,
      {
        pseudonym: string;
        classId: string;
        orgId: string;
        period: string;
        updatedAt: number;
      }
    >();
    const now = Date.now();
    for (const entry of entries) {
      const key = pinIndexKey(entry.period, entry.pin);
      // Last-write-wins on intra-batch dupes (same encoded period+pin).
      desired.set(key, {
        pseudonym: computeStudentUid(entry.classlinkSourcedId, hmacSecret),
        classId: classlinkClassId,
        orgId: classlinkOrgId,
        period: entry.period,
        updatedAt: now,
      });
    }

    // Read the current index so we know which docs to delete (entries that
    // existed before but are not in `desired`). Bounded by
    // PIN_INDEX_MAX_ENTRIES via `.limit()` — a roster with more entries
    // would have been rejected on the input side already.
    const pinIndexCollection = rosterRef.collection(PIN_INDEX_SUBCOLLECTION);
    const existingSnap = await pinIndexCollection
      .limit(PIN_INDEX_MAX_ENTRIES + 1)
      .get();

    const batch = db.batch();
    let deleted = 0;
    for (const docSnap of existingSnap.docs) {
      if (!desired.has(docSnap.id)) {
        batch.delete(docSnap.ref);
        deleted++;
      }
    }

    let wrote = 0;
    for (const [key, payload] of desired) {
      batch.set(pinIndexCollection.doc(key), payload);
      wrote++;
    }

    await batch.commit();
    return { wrote, deleted };
  }
}

// Per (session, caller uid) limits. Seat PINs are short, so a caller that keeps
// missing, or keeps landing on different students, stops bridging and falls back
// to the plain PIN join.
const PIN_LOGIN_ATTEMPTS_COLLECTION = 'pin_login_attempts';
const PIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const PIN_LOGIN_MAX_FAILURES = 10;
export const PIN_LOGIN_MAX_IDENTITIES = 3;
// Shared limits that fresh anonymous uids can't reset: misses from every caller of
// the session, and of every session on the same roster, share one budget each, and
// each student can be bridged from only a few uids.
export const PIN_LOGIN_SESSION_MAX_FAILURES = 30;
// A day-long budget too, so a roster can't be walked 15 minutes at a time or across old sessions.
export const PIN_LOGIN_SESSION_MAX_DAILY_FAILURES = 150;
const PIN_LOGIN_SESSION_DAY_MS = 24 * 60 * 60 * 1000;
export const PIN_LOGIN_MAX_CALLERS_PER_STUDENT = 3;
const PIN_LOGIN_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

interface PinLoginAttempts {
  windowStart: number;
  failures: number;
  indexKeys: string[];
}

interface PinLoginSessionBudget {
  windowStart: number;
  failures: number;
  dayStart: number;
  dayFailures: number;
}

function readPinLoginAttempts(
  data: admin.firestore.DocumentData | undefined,
  now: number
): PinLoginAttempts {
  const windowStart =
    typeof data?.windowStart === 'number' ? data.windowStart : 0;
  if (!data || now - windowStart >= PIN_LOGIN_WINDOW_MS) {
    return { windowStart: now, failures: 0, indexKeys: [] };
  }
  return {
    windowStart,
    failures: typeof data.failures === 'number' ? data.failures : 0,
    indexKeys: Array.isArray(data.indexKeys)
      ? data.indexKeys.filter(
          (k: unknown): k is string => typeof k === 'string'
        )
      : [],
  };
}

function readPinLoginSession(
  data: admin.firestore.DocumentData | undefined,
  now: number
): PinLoginSessionBudget {
  const { windowStart, failures } = readPinLoginAttempts(data, now);
  const dayStart = typeof data?.dayStart === 'number' ? data.dayStart : 0;
  if (!data || now - dayStart >= PIN_LOGIN_SESSION_DAY_MS) {
    return { windowStart, failures, dayStart: now, dayFailures: 0 };
  }
  return {
    windowStart,
    failures,
    dayStart,
    dayFailures: typeof data.dayFailures === 'number' ? data.dayFailures : 0,
  };
}

function readPinLoginCallers(
  data: admin.firestore.DocumentData | undefined
): string[] {
  return Array.isArray(data?.callerUids)
    ? data.callerUids.filter((u: unknown): u is string => typeof u === 'string')
    : [];
}

function pinLoginBlocked(a: PinLoginAttempts, indexKey: string): boolean {
  if (a.failures >= PIN_LOGIN_MAX_FAILURES) return true;
  return (
    a.indexKeys.length >= PIN_LOGIN_MAX_IDENTITIES &&
    !a.indexKeys.includes(indexKey)
  );
}

function pinLoginSessionBlocked(s: PinLoginSessionBudget): boolean {
  return (
    s.failures >= PIN_LOGIN_SESSION_MAX_FAILURES ||
    s.dayFailures >= PIN_LOGIN_SESSION_MAX_DAILY_FAILURES
  );
}

function pinLoginExpireAt(windowStart: number): admin.firestore.Timestamp {
  // TTL field (firestore.indexes.json) so stale counters delete themselves.
  return admin.firestore.Timestamp.fromMillis(
    windowStart + 2 * PIN_LOGIN_WINDOW_MS
  );
}

export interface PinLoginRefs {
  caller: admin.firestore.DocumentReference;
  claim: admin.firestore.DocumentReference;
  /** The session's budget first, then one per roster on the session. */
  shared: admin.firestore.DocumentReference[];
}

export function pinLoginRefs(
  db: admin.firestore.Firestore,
  sessionId: string,
  callerUid: string,
  indexKey: string,
  teacherUid: string,
  rosterIds: readonly string[]
): PinLoginRefs {
  const col = db.collection(PIN_LOGIN_ATTEMPTS_COLLECTION);
  return {
    caller: col.doc(`${sessionId}__${callerUid}`),
    claim: col.doc(`claim__${sessionId}__${indexKey}`),
    shared: [
      col.doc(`session__${sessionId}`),
      ...rosterIds.map((rosterId) =>
        col.doc(`roster__${teacherUid}__${rosterId.replace(/\//g, '_')}`)
      ),
    ],
  };
}

/** Blocked by a caller limit, or by a shared budget unless this caller is rejoining as a student it already holds. */
function pinLoginLimited(
  a: PinLoginAttempts,
  shared: readonly PinLoginSessionBudget[],
  callers: readonly string[],
  callerUid: string,
  indexKey: string
): boolean {
  if (pinLoginBlocked(a, indexKey)) return true;
  if (callers.includes(callerUid)) return false;
  return shared.some(pinLoginSessionBlocked);
}

export interface PinLoginMatch {
  pseudonym: string;
  classId: string;
  orgId: string;
}

export type PinLoginDecision =
  | { outcome: 'minted'; match: PinLoginMatch }
  | { outcome: 'miss' }
  | { outcome: 'rate-limited' };

/**
 * Probes the roster index and records the attempt in ONE transaction, so every
 * hit and miss is decided against the shared budgets it is counted in.
 */
export async function decidePinLogin(
  db: admin.firestore.Firestore,
  refs: PinLoginRefs,
  indexRefs: readonly admin.firestore.DocumentReference[],
  callerUid: string,
  indexKey: string,
  rejoinOnly = false
): Promise<PinLoginDecision> {
  return db.runTransaction(async (tx) => {
    const n = refs.shared.length;
    const snaps = await Promise.all(
      [refs.caller, refs.claim, ...refs.shared, ...indexRefs].map((r) =>
        tx.get(r)
      )
    );
    const [callerSnap, claimSnap] = snaps;
    const sharedSnaps = snaps.slice(2, 2 + n);
    const indexSnaps = snaps.slice(2 + n);
    const now = Date.now();
    const a = readPinLoginAttempts(callerSnap.data(), now);
    const shared = sharedSnaps.map((snap) =>
      readPinLoginSession(snap.data(), now)
    );
    const callers = readPinLoginCallers(claimSnap.data());
    const blocked =
      (rejoinOnly && !callers.includes(callerUid)) ||
      pinLoginLimited(a, shared, callers, callerUid, indexKey);

    // A multi-roster session prefers the first hit in rosterIds order (see `resolvePinName`).
    let match: PinLoginMatch | null = null;
    for (const indexSnap of indexSnaps) {
      if (!indexSnap.exists) continue;
      const entry = indexSnap.data() ?? {};
      const pseudonym =
        typeof entry.pseudonym === 'string' ? entry.pseudonym : '';
      const classId = typeof entry.classId === 'string' ? entry.classId : '';
      const orgId = typeof entry.orgId === 'string' ? entry.orgId : '';
      if (pseudonym && classId) {
        match = { pseudonym, classId, orgId };
        break;
      }
    }

    if (!match) {
      // Every miss is counted, even once blocked, so the stored total matches the probes made.
      a.failures += 1;
      shared.forEach((s, i) => {
        s.failures += 1;
        s.dayFailures += 1;
        tx.set(refs.shared[i], {
          ...s,
          expireAt: admin.firestore.Timestamp.fromMillis(
            Math.max(
              s.windowStart + 2 * PIN_LOGIN_WINDOW_MS,
              s.dayStart + PIN_LOGIN_SESSION_DAY_MS
            )
          ),
        });
      });
      tx.set(refs.caller, { ...a, expireAt: pinLoginExpireAt(a.windowStart) });
      return { outcome: blocked ? 'rate-limited' : 'miss' };
    }

    if (
      blocked ||
      (!callers.includes(callerUid) &&
        callers.length >= PIN_LOGIN_MAX_CALLERS_PER_STUDENT)
    ) {
      return { outcome: 'rate-limited' };
    }
    if (!a.indexKeys.includes(indexKey)) a.indexKeys.push(indexKey);
    // Rewritten on every mint so a student who keeps rejoining keeps the claim that lets a short PIN rejoin.
    tx.set(refs.claim, {
      callerUids: callers.includes(callerUid)
        ? callers
        : [...callers, callerUid],
      expireAt: admin.firestore.Timestamp.fromMillis(
        now + PIN_LOGIN_CLAIM_TTL_MS
      ),
    });
    tx.set(refs.caller, { ...a, expireAt: pinLoginExpireAt(a.windowStart) });
    return { outcome: 'minted', match };
  });
}

interface PinLoginRequestData {
  kind?: unknown;
  sessionId?: unknown;
  code?: unknown;
  pin?: unknown;
  period?: unknown;
}

/**
 * pinLoginV1
 *
 * Input:
 *   {
 *     kind: 'quiz' | 'video-activity',
 *     sessionId?: string,    // required for video-activity; for quiz, which code match
 *     code?: string,         // required for quiz
 *     pin: string,
 *     period?: string,       // optional, picks one when the session has
 *                            // multiple rosters and the pin is ambiguous
 *   }
 *
 * Resolves the (session, period, pin) tuple to a roster-bound student
 * identity by reading the teacher's pin_index sidecar (built by
 * `commitRosterPinIndexV1`). On success returns a custom token whose uid
 * matches the same HMAC pseudonym `studentLoginV1` would mint for that
 * student over SSO, plus `studentRole: true` and `classIds: [classId]`
 * so the student passes the response-rule class gate.
 *
 * On no-match returns `{ matched: false }` so the client can fall back
 * to the existing anonymous PIN flow (legacy non-rostered sessions, or
 * rosters whose index hasn't been built yet).
 *
 * No PII logging — only class-of-failure counters.
 */
export const pinLoginV1 = onCall(
  {
    memory: '256MiB',
    secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    assertViewAsAllowed(request);
    // Both join flows sign in anonymously first; the uid keys the attempt limit.
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const callerUid = request.auth.uid;
    const data = (request.data ?? {}) as PinLoginRequestData;
    const kind =
      data.kind === 'quiz' || data.kind === 'video-activity' ? data.kind : null;
    const pin = typeof data.pin === 'string' ? data.pin.trim() : '';
    const period = typeof data.period === 'string' ? data.period : '';
    if (!kind) {
      throw new HttpsError('invalid-argument', 'kind is required.');
    }
    if (!pin) {
      throw new HttpsError('invalid-argument', 'pin is required.');
    }

    const db = admin.firestore();

    // Resolve the session.
    let sessionRef: admin.firestore.DocumentReference;
    if (kind === 'quiz') {
      const code =
        typeof data.code === 'string' ? normalizeQuizCode(data.code) : '';
      if (!code) {
        throw new HttpsError('invalid-argument', 'code is required for quiz.');
      }
      // Filter status in the query itself — old non-joinable sessions sharing a reused code must never crowd the live one out of a capped page.
      const codeMatch = await db
        .collection('quiz_sessions')
        .where('code', '==', code)
        .where('status', 'in', ['waiting', 'active', 'paused'])
        .limit(10)
        .get();
      if (codeMatch.empty) {
        // Cheap existence check purely for log clarity: was this code never
        // used, or did every session sharing it end?
        const anyMatch = await db
          .collection('quiz_sessions')
          .where('code', '==', code)
          .limit(1)
          .get();
        console.warn('[pinLoginV1] fallback', {
          kind,
          reason: 'no-joinable-session',
          codeExisted: !anyMatch.empty,
          period,
        });
        return { matched: false, reason: 'no-joinable-session' };
      }
      // Only the code's owner's sessions count, so a colliding session can't take the bridge.
      const owner = await quizJoinCodeOwner(db, code);
      const owned = owner
        ? codeMatch.docs.filter((d) => d.data().teacherUid === owner)
        : codeMatch.docs;
      // The token is scoped to one session, so bridge only the one the client resolved from this code.
      const wanted =
        typeof data.sessionId === 'string' && data.sessionId
          ? data.sessionId
          : null;
      const picked = wanted ? owned.find((d) => d.id === wanted) : owned[0];
      if (!picked) {
        console.warn('[pinLoginV1] fallback', {
          kind,
          reason: 'no-joinable-session',
          sessionId: wanted,
          period,
        });
        return { matched: false, reason: 'no-joinable-session' };
      }
      sessionRef = picked.ref;
    } else {
      const sessionId =
        typeof data.sessionId === 'string' ? data.sessionId : '';
      // A single id segment only: a slash path would load a nested doc as the session.
      if (!sessionId || sessionId.includes('/')) {
        throw new HttpsError(
          'invalid-argument',
          'sessionId is required for video-activity.'
        );
      }
      sessionRef = db.collection('video_activity_sessions').doc(sessionId);
    }

    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      console.warn('[pinLoginV1] fallback', {
        kind,
        reason: 'session-not-found',
        sessionId: sessionRef.id,
        period,
      });
      return { matched: false, reason: 'session-not-found' };
    }
    const sessionData = sessionSnap.data() ?? {};
    // Quiz codes only match joinable sessions; an ended self-paced video session must not be a PIN oracle either.
    // A teacher-paced one stays bridgeable so its students can reopen their read-only results.
    if (
      kind === 'video-activity' &&
      sessionData.status === 'ended' &&
      sessionData.sessionMode !== 'teacher'
    ) {
      console.warn('[pinLoginV1] fallback', {
        kind,
        reason: 'no-joinable-session',
        sessionId: sessionRef.id,
        period,
      });
      return { matched: false, reason: 'no-joinable-session' };
    }
    // Stamped at create time from the teacher's `anonymous-join` access; absent = allowed.
    if (
      sessionData.allowAnonymousJoin === false &&
      sessionData.mode !== 'view-only'
    ) {
      console.warn('[pinLoginV1] rejected', {
        kind,
        reason: 'anonymous-join-disabled',
        sessionId: sessionRef.id,
      });
      throw new HttpsError(
        'permission-denied',
        'Sign in to join this activity.'
      );
    }
    const teacherUid =
      typeof sessionData.teacherUid === 'string' ? sessionData.teacherUid : '';
    if (!teacherUid) {
      console.warn('[pinLoginV1] fallback', {
        kind,
        reason: 'session-missing-teacher',
        sessionId: sessionRef.id,
        period,
      });
      return { matched: false, reason: 'session-missing-teacher' };
    }
    const rosterIds = Array.isArray(sessionData.rosterIds)
      ? sessionData.rosterIds.filter(
          (r: unknown): r is string => typeof r === 'string' && r.length > 0
        )
      : [];
    if (rosterIds.length === 0) {
      // No roster on the session — can't bridge. Fall through to the
      // legacy anonymous PIN flow on the client. Common for legacy
      // PIN-only sessions; surface so we can spot a rostered session
      // that lost its rosterIds via a bad write.
      console.warn('[pinLoginV1] fallback', {
        kind,
        reason: 'no-rosters-on-session',
        sessionId: sessionRef.id,
        teacherUid,
        period,
      });
      return { matched: false, reason: 'no-rosters-on-session' };
    }

    const indexKey = pinIndexKey(period, pin);
    // A short PIN only re-proves a student this caller already bridged as, so a pre-upgrade join keeps its response doc.
    const rejoinOnly = !isBridgeablePin(pin);

    const attemptRefs = pinLoginRefs(
      db,
      sessionRef.id,
      callerUid,
      indexKey,
      teacherUid,
      rosterIds
    );
    // Cheap early exit only; decidePinLogin re-checks every limit inside its transaction.
    const counters = await Promise.all(
      [attemptRefs.caller, attemptRefs.claim, ...attemptRefs.shared].map((r) =>
        r.get()
      )
    ).catch((err: unknown) => {
      console.error('[pinLoginV1] attempt check failed:', err);
      return null;
    });
    if (
      rejoinOnly &&
      !readPinLoginCallers(counters?.[1].data()).includes(callerUid)
    ) {
      console.warn('[pinLoginV1] fallback', {
        kind,
        reason: 'short-pin',
        sessionId: sessionRef.id,
      });
      return { matched: false, reason: 'short-pin' };
    }
    const now = Date.now();
    if (
      !counters ||
      pinLoginLimited(
        readPinLoginAttempts(counters[0].data(), now),
        counters.slice(2).map((snap) => readPinLoginSession(snap.data(), now)),
        readPinLoginCallers(counters[1].data()),
        callerUid,
        indexKey
      )
    ) {
      console.warn('[pinLoginV1] fallback', {
        kind,
        reason: 'rate-limited',
        sessionId: sessionRef.id,
      });
      return { matched: false, reason: 'rate-limited' };
    }

    // One index doc per roster; PIN + encoded period normally matches at most one.
    const indexRefs = rosterIds.map((rosterId) =>
      db
        .collection('users')
        .doc(teacherUid)
        .collection('rosters')
        .doc(rosterId)
        .collection(PIN_INDEX_SUBCOLLECTION)
        .doc(indexKey)
    );

    // Fail closed: a probe whose attempt couldn't be recorded never reveals or mints anything.
    const decision = await decidePinLogin(
      db,
      attemptRefs,
      indexRefs,
      callerUid,
      indexKey,
      rejoinOnly
    ).catch((err: unknown): PinLoginDecision => {
      console.error('[pinLoginV1] attempt record failed:', err);
      return { outcome: 'rate-limited' };
    });
    if (decision.outcome === 'rate-limited') {
      console.warn('[pinLoginV1] fallback', {
        kind,
        reason: 'rate-limited',
        sessionId: sessionRef.id,
      });
      return { matched: false, reason: 'rate-limited' };
    }

    if (decision.outcome === 'miss') {
      // The PIN+period tuple didn't resolve to any roster entry across
      // the session's rosters. This is the most diagnostically valuable
      // fallback — it usually means either (a) the teacher hasn't run
      // commitRosterPinIndexV1 since the roster was last edited, or
      // (b) the period the student entered doesn't match the roster's
      // encoded period. Period is logged (not the PIN itself) so we can
      // diff against the roster's period encoding.
      console.warn('[pinLoginV1] fallback', {
        kind,
        reason: 'no-index-entry',
        sessionId: sessionRef.id,
        teacherUid,
        rosterCount: rosterIds.length,
        period,
      });
      return { matched: false, reason: 'no-index-entry' };
    }
    const matched = decision.match;

    let customToken: string;
    try {
      customToken = await admin.auth().createCustomToken(matched.pseudonym, {
        studentRole: true,
        orgId: matched.orgId,
        classIds: [matched.classId],
        // Rules keep a PIN-proven token to this one session (see pinSessionOk).
        pinLogin: true,
        pinSessionId: sessionRef.id,
      });
    } catch (err) {
      console.error('[pinLoginV1] createCustomToken failed:', err);
      throw new HttpsError('internal', 'Failed to mint auth token.');
    }

    return { matched: true, customToken };
  }
);
