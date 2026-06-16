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
} from './classlinkShared';
import { normalizeQuizCode } from './quizCode';

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
    let classIds: string[];
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
      classIds = (classesResp.data.classes ?? [])
        .map((c) => c.sourcedId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .slice(0, STUDENT_LOGIN_CLASS_IDS_MAX);
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

    // 4. Compute the stable opaque UID and mint the custom token with
    //    the classIds claim that gates Firestore reads.
    const uid = computeStudentUid(sourcedId, hmacSecret);

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
 * Returns class metadata (name, teacher display name, subject, code) for the
 * authenticated student's claim-bound `classIds`. Powers the sidebar on
 * `/my-assignments` so a student sees "English 9 / Ms. Halverson" instead of
 * an opaque sourcedId.
 *
 * Lookup order per classId:
 *   1. `collectionGroup('rosters').where('classlinkClassId', '==', classId)` —
 *      real ClassLink imports. Parent path gives teacher uid. Safe across
 *      orgs because ClassLink-issued sourcedIds are not admin-controlled.
 *   2. `organizations/{orgId}/testClasses/{classId}` — admin-managed test
 *      classes. Always read via the org-scoped doc path (never via a
 *      collectionGroup lookup on `testClassId`) because test class IDs are
 *      admin-chosen slugs that can collide across orgs; a collectionGroup
 *      query would risk returning another org's roster.
 *
 * PII: this function never returns student names, emails, or any field from
 * the per-roster Drive file. Only Firestore-side roster meta (which is
 * itself PII-free) plus the teacher's own `displayName` from Firebase Auth.
 * Teacher names are organizational data, not student PII.
 *
 * Failure: classIds that match nothing are silently dropped from the
 * response so the sidebar simply omits them. The page renders a fallback
 * label client-side rather than treating a missing entry as an error.
 */
export const getStudentClassDirectoryV1 = onCall(
  {
    memory: '256MiB',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
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
    const classIds = rawClassIds
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
      .slice(0, STUDENT_LOGIN_CLASS_IDS_MAX);
    if (classIds.length === 0) {
      return { classes: [] };
    }

    const orgId =
      typeof request.auth.token.orgId === 'string'
        ? request.auth.token.orgId
        : '';

    const db = admin.firestore();

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
      teacherDisplayName: string;
      subject?: string;
      code?: string;
    }

    // Batch the per-classId collectionGroup queries instead of fanning out
    // a separate equality query per id. Firestore caps `in`-array size at
    // 30; we chunk at 10 to stay safely under the limit and to fit the
    // typical `STUDENT_LOGIN_CLASS_IDS_MAX = 20` payload in 2 chunks.
    const FIRESTORE_IN_CHUNK_SIZE = 10;

    /**
     * Run `collectionGroup('rosters').where(field, 'in', chunk)` for every
     * chunk of `ids`, then index the matching roster docs by their
     * `field`-value. First match wins on duplicates so the teacher whose
     * roster Firestore returns first deterministically owns the directory
     * entry for that class.
     */
    const batchLookupByField = async (
      field: 'classlinkClassId',
      ids: readonly string[]
    ): Promise<Map<string, FirebaseFirestore.QueryDocumentSnapshot>> => {
      const out = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      if (ids.length === 0) return out;
      const snapshots = await Promise.all(
        chunk(ids, FIRESTORE_IN_CHUNK_SIZE).map((idChunk) =>
          db.collectionGroup('rosters').where(field, 'in', idChunk).get()
        )
      );
      for (const snap of snapshots) {
        for (const doc of snap.docs) {
          const value: unknown = doc.get(field);
          if (typeof value === 'string' && !out.has(value)) {
            out.set(value, doc);
          }
        }
      }
      return out;
    };

    const buildEntryFromRoster = async (
      classId: string,
      rosterDoc: FirebaseFirestore.QueryDocumentSnapshot,
      includeCode: boolean
    ): Promise<DirectoryEntry> => {
      const data = rosterDoc.data();
      const teacherUid = rosterDoc.ref.parent.parent?.id ?? '';
      const teacherDisplayName = teacherUid
        ? await resolveTeacherName(teacherUid)
        : '';
      return {
        classId,
        name: typeof data.name === 'string' ? data.name : classId,
        teacherDisplayName,
        subject:
          typeof data.classlinkSubject === 'string'
            ? data.classlinkSubject
            : undefined,
        code:
          includeCode && typeof data.classlinkClassCode === 'string'
            ? data.classlinkClassCode
            : undefined,
      };
    };

    // 1. Batched collectionGroup lookup for ClassLink classes. Two `in`
    // queries per field chunk replace what was up to 20 separate equality
    // queries. Real ClassLink sourcedIds are issued globally by ClassLink
    // and are not admin-controlled, so collisions across orgs are not a
    // realistic risk on this branch.
    const classlinkMatches = await batchLookupByField(
      'classlinkClassId',
      classIds
    );
    const unresolvedAfterClasslink = classIds.filter(
      (id) => !classlinkMatches.has(id)
    );

    // 2. Direct testClasses doc reads — for every classId not resolved as
    // ClassLink. We deliberately do NOT use a `collectionGroup('rosters')
    // .where('testClassId', 'in', …)` lookup here: testClassIds are
    // admin-chosen slugs (default `testclass`, or a slugified title) and
    // can collide across orgs, so a collectionGroup query would risk
    // returning another org's roster doc and leaking that teacher's name
    // and class metadata to the student. The org-scoped document path is
    // gated by the student's verified `orgId` claim, so it cannot cross
    // org boundaries. The trade-off is that we no longer surface the
    // importing teacher's display name on test-class directory entries —
    // these are admin-managed mocks where teacher attribution is
    // cosmetic.
    const testClassDocs = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    if (orgId && unresolvedAfterClasslink.length > 0) {
      const docs = await Promise.all(
        unresolvedAfterClasslink.map((id) =>
          db
            .doc(`organizations/${orgId}/testClasses/${id}`)
            .get()
            .catch(() => null)
        )
      );
      for (let i = 0; i < unresolvedAfterClasslink.length; i++) {
        const d = docs[i];
        if (d && d.exists) testClassDocs.set(unresolvedAfterClasslink[i], d);
      }
    }

    const entries = await Promise.all(
      classIds.map(async (classId): Promise<DirectoryEntry | null> => {
        const fromClasslink = classlinkMatches.get(classId);
        if (fromClasslink) {
          return buildEntryFromRoster(classId, fromClasslink, true);
        }
        const fromTestClassDoc = testClassDocs.get(classId);
        if (fromTestClassDoc) {
          const data = fromTestClassDoc.data() ?? {};
          return {
            classId,
            name:
              typeof data.title === 'string' && data.title.length > 0
                ? data.title
                : classId,
            teacherDisplayName: '',
            subject:
              typeof data.subject === 'string' ? data.subject : undefined,
          };
        }
        return null;
      })
    );

    const classes = entries.filter((e): e is DirectoryEntry => e !== null);
    return { classes };
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
    minInstances: 1,
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

    const data = request.data as {
      assignmentId?: unknown;
      classId?: unknown;
      orgId?: unknown;
    };
    const assignmentId =
      typeof data?.assignmentId === 'string' ? data.assignmentId : '';
    const classId = typeof data?.classId === 'string' ? data.classId : '';
    // orgId is optional for backwards compatibility (older clients). The
    // test-class branch only activates when it's provided AND the requested
    // classId resolves to a `testClasses` doc under that org.
    const orgId = typeof data?.orgId === 'string' ? data.orgId : '';
    if (!assignmentId || !classId) {
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
          pseudonyms[emailLower] = {
            studentUid,
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
        }
      > = {};
      for (const s of students) {
        if (!s.sourcedId) continue;
        const studentUid = computeStudentUid(s.sourcedId, hmacSecret);
        pseudonyms[s.sourcedId] = {
          studentUid,
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
const PIN_INDEX_MAX_ENTRIES = 200;

/**
 * Mirror of `encodeResponseKeySegment` in `useQuizSession.ts`. Duplicated
 * server-side rather than imported because the functions package has its own
 * tsconfig + emit and the client hook lives outside it. The client + server
 * encoders MUST stay in lockstep — a divergence would produce mismatched
 * `indexKey`s and silently break the PIN→SSO lookup.
 */
function encodeResponseKeySegment(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'default';
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const stripped = normalized.replace(/^_+|_+$/g, '');
  return stripped || 'default';
}

function pinIndexKey(period: string, pin: string): string {
  return `${encodeResponseKeySegment(period)}__${encodeResponseKeySegment(pin)}`;
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
    secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
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
    const rosterData = rosterSnap.data() ?? {};
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
        skippedMalformed,
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
    return { wrote, deleted, skippedMalformed };
  }
);

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
      const codeMatch = await db
        .collection('quiz_sessions')
        .where('code', '==', code)
        .limit(5)
        .get();
      const joinable = codeMatch.docs.find((d) => {
        const s = (d.data() as { status?: unknown }).status;
        return s === 'waiting' || s === 'active' || s === 'paused';
      });
      if (!joinable) {
        console.warn('[pinLoginV1] fallback', {
          kind,
          reason: 'no-joinable-session',
          codeMatchCount: codeMatch.size,
          period,
        });
        return { matched: false, reason: 'no-joinable-session' };
      }
      sessionRef = joinable.ref;
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
