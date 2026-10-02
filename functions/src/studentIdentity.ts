import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import * as CryptoJS from 'crypto-js';
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
import {
  ALLOWED_ORIGINS,
  ONEROSTER_BASE,
  computeStudentUid,
  getOAuthHeaders,
  isSafeEmailForOneRosterFilter,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
  type ClassLinkClass,
  type ClassLinkStudent,
  type ClassLinkUser,
  pinIndexKey,
} from './classlinkShared';
import { normalizeQuizCode } from './quizCode';
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

interface OneRosterUserWithRole extends ClassLinkUser {
  role?: string;
  roles?: Array<{ role?: string; roleType?: string }>;
}

const STUDENT_LOGIN_CLASS_IDS_MAX = 20;
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

const sameIdSet = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
};

function hmacSha256Hex(secret: string, message: string): string {
  return CryptoJS.HmacSHA256(message, secret).toString(CryptoJS.enc.Hex);
}

function computeAssignmentPseudonym(
  uid: string,
  assignmentId: string,
  hmacSecret: string
): string {
  return hmacSha256Hex(hmacSecret, `asn:${uid}:${assignmentId}`);
}

function isOneRosterStudent(user: OneRosterUserWithRole): boolean {
  if (user.role && user.role.toLowerCase() === 'student') return true;
  if (Array.isArray(user.roles)) {
    return user.roles.some((r) => {
      const v = (r.role ?? r.roleType ?? '').toLowerCase();
      return v === 'student' || v === 'primary';
    });
  }
  return false;
}

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

    // 2. Organization / domain gate. Prefer the `hd` claim (Workspace-issued),
    //    but fall back to the email suffix since `hd` is not guaranteed on
    //    every Workspace configuration.
    const emailDomain = normalizeEmailDomain(email);
    if (!emailDomain) {
      throw new HttpsError('unauthenticated', 'Malformed email.');
    }
    const hdDomain = hd ? '@' + hd.toLowerCase() : null;

    const db = admin.firestore();
    let orgId = hdDomain ? await resolveOrgIdForDomain(db, hdDomain) : null;
    if (!orgId) {
      orgId = await resolveOrgIdForDomain(db, emailDomain);
    }
    if (!orgId) {
      // Counter for monitoring alert on misconfiguration / unregistered schools.
      console.warn('[studentLoginV1] students_rejected_domain');
      throw new HttpsError(
        'permission-denied',
        'This SpartBoard is only available to schools that have signed up.'
      );
    }

    // 2.5 Mock-class bypass. Admin-managed `testClasses` docs let us exercise
    //     the end-to-end student SSO flow without provisioning the student in
    //     ClassLink/OneRoster. If the email matches at least one testClasses
    //     doc under this org, we short-circuit and mint a custom token whose
    //     `classIds` are the testClasses doc ids — no OneRoster call is made.
    //     Test uids are namespaced (`test:email`) so they never collide with
    //     real OneRoster `sourcedId`-derived uids.
    const emailLower = email.toLowerCase();
    const testClassSnap = await db
      .collection(`organizations/${orgId}/testClasses`)
      .where('memberEmails', 'array-contains', emailLower)
      .limit(STUDENT_LOGIN_CLASS_IDS_MAX)
      .get();
    if (!testClassSnap.empty) {
      // Query is already bounded by `.limit(STUDENT_LOGIN_CLASS_IDS_MAX)` —
      // no secondary slice needed.
      const mockClassIds = testClassSnap.docs.map((d) => d.id);
      // Monitoring counter — surface any prod use of the bypass.
      console.warn('[studentLoginV1] test_bypass_used', { orgId });
      const uid = computeStudentUid(`test:${emailLower}`, hmacSecret);
      try {
        const customToken = await admin.auth().createCustomToken(uid, {
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

    // 3. ClassLink OneRoster lookup — fetch the student's sourcedId and
    //    classes. Held in memory only, never written to Firestore.
    const cleanTenantUrl = tenantUrl.replace(/\/$/, '');
    let sourcedId: string;
    let sectionIds: string[];
    try {
      if (!isSafeEmailForOneRosterFilter(email)) {
        console.warn('[studentLoginV1] students_not_in_roster');
        throw new HttpsError(
          'not-found',
          'No student record found in ClassLink roster.'
        );
      }
      const usersBaseUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/users`;
      const userParams = { filter: `email='${email}'` };
      const userHeaders = getOAuthHeaders(
        usersBaseUrl,
        userParams,
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const userResp = await axios.get<{ users: OneRosterUserWithRole[] }>(
        usersBaseUrl,
        { params: userParams, headers: { ...userHeaders } }
      );
      const users = userResp.data.users ?? [];
      const studentUser = users.find(isOneRosterStudent);
      if (!studentUser) {
        console.warn('[studentLoginV1] students_not_in_roster');
        throw new HttpsError(
          'not-found',
          'No student record found in ClassLink roster.'
        );
      }
      sourcedId = studentUser.sourcedId;

      const classesUrl = `${cleanTenantUrl}${ONEROSTER_BASE}/users/${sourcedId}/classes`;
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
      if (err instanceof HttpsError) throw err;
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
    const uid = computeStudentUid(sourcedId, hmacSecret);

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

    // Stored sections widen the candidates; a record from another org is ignored.
    let storedSectionIds: string[] | null = null;
    if (orgId) {
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
      const teacherUser = (teacherResp.data.users ?? [])[0];
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
    secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
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
    const result = await reconcileRosterPinIndex(
      db,
      rosterRef,
      rosterSnap.data() ?? {},
      entries,
      hmacSecret
    );
    return { ...result, skippedMalformed };
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
 *     sessionId?: string,    // required for video-activity
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
        .limit(1)
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
      sessionRef = codeMatch.docs[0].ref;
    } else {
      const sessionId =
        typeof data.sessionId === 'string' ? data.sessionId : '';
      if (!sessionId) {
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

    // Probe each roster's pin_index for the indexKey IN PARALLEL.
    // PIN-bridged join is on the hot path of every PIN-joining student,
    // and a multi-class session (multiple rosters) would otherwise
    // serialize one .get() per roster. Fan-out is bounded by
    // STUDENT_LOGIN_CLASS_IDS_MAX-style sizing on the client side
    // (rosterIds is teacher-authored and small in practice).
    //
    // A multi-class session will typically have only one match because
    // PIN + encoded-period uniquely identifies a student. If multiple
    // rosters happen to match (PIN collision across periods with a
    // missing/default period), prefer the first hit by rosterIds order
    // — same behavior the legacy PIN response-key resolution documents
    // at `quizScoreboard.ts` `resolvePinName`.
    //
    // `orgId` lives directly on the index entry (Phase 3 review fix),
    // so the login path is a single doc read per roster instead of an
    // additional `collectionGroup('rosters').where('classlinkClassId'…)`
    // scan to recover org metadata.
    const indexRefs = rosterIds.map((rosterId) =>
      db
        .collection('users')
        .doc(teacherUid)
        .collection('rosters')
        .doc(rosterId)
        .collection(PIN_INDEX_SUBCOLLECTION)
        .doc(indexKey)
    );
    const indexSnaps = await Promise.all(indexRefs.map((ref) => ref.get()));

    let matched: {
      pseudonym: string;
      classId: string;
      orgId: string;
    } | null = null;
    for (const indexSnap of indexSnaps) {
      if (!indexSnap.exists) continue;
      const entry = indexSnap.data() ?? {};
      const pseudonym =
        typeof entry.pseudonym === 'string' ? entry.pseudonym : '';
      const classId = typeof entry.classId === 'string' ? entry.classId : '';
      const orgId = typeof entry.orgId === 'string' ? entry.orgId : '';
      if (pseudonym && classId) {
        matched = { pseudonym, classId, orgId };
        break;
      }
    }

    if (!matched) {
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

    let customToken: string;
    try {
      customToken = await admin.auth().createCustomToken(matched.pseudonym, {
        studentRole: true,
        orgId: matched.orgId,
        classIds: [matched.classId],
      });
    } catch (err) {
      console.error('[pinLoginV1] createCustomToken failed:', err);
      throw new HttpsError('internal', 'Failed to mint auth token.');
    }

    return { matched: true, customToken };
  }
);
