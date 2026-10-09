// Schoology LTI 1.3 — link a section to a class by pasting its course URL
// (docs/plans/SCHOOLOGY_TOOL_COLUMNS.md D1–D2).
//
//   ltiLinkSectionByUrlV1 — { url } returns the section title and the caller's
//                           classes ranked by student overlap; { url, rosterId }
//                           links the section to that roster's ClassLink class.
//
// Ownership needs no launch: the caller's email must be an active Instructor in
// the section's NRPS roster, and the section's learners must overlap the chosen
// class. NRPS and OneRoster emails are read transiently, never returned or stored.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

import { getLtiPlatformConfig, NRPS_SCOPE } from './config';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { getAgsAccessToken } from './ags';
import { fetchNrpsMembership, type NrpsMember } from './nrps';
import { deriveRole } from './jwt';
import { schoologySectionUrls } from './lineItems';
import { LTI_COURSE_LINKS_COLLECTION } from './courseLinkEndpoints';
import { USERS_COLLECTION } from './nrpsStore';
import { classroomAddonNet } from '../classroomAddonAuth';
import { isGlobalFeatureGranted } from '../quizMediaArchive';
import { loadTestClassMembership } from '../studentAssignmentTargets';
import { assertViewAsAllowed } from '../viewAsGuard';

export const SCHOOLOGY_TOOL_COLUMNS_FEATURE = 'schoology-tool-columns';

const LTI_TOOL_PRIVATE_KEY = defineSecret('LTI_TOOL_PRIVATE_KEY');
const CLASSLINK_CLIENT_ID = defineSecret('CLASSLINK_CLIENT_ID');
const CLASSLINK_CLIENT_SECRET = defineSecret('CLASSLINK_CLIENT_SECRET');
const CLASSLINK_TENANT_URL = defineSecret('CLASSLINK_TENANT_URL');

/** Cap on distinct ClassLink classes one preview call OneRoster-fetches. */
const MAX_CANDIDATE_CLASSES = 60;
const FETCH_CONCURRENCY = 5;
const ROSTER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** The section id in a pasted Schoology course link, or null for anything else. */
export function parseSchoologyCourseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return null;
  let url: URL;
  try {
    url = new URL(
      /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username !== '' ||
    (host !== 'schoology.com' && !host.endsWith('.schoology.com'))
  ) {
    return null;
  }
  const m = /^\/course\/(\d{1,20})(?:\/|$)/.exec(url.pathname);
  return m ? m[1] : null;
}

const isActive = (m: NrpsMember): boolean =>
  !m.status || m.status.toLowerCase() === 'active';

/** True when `email` is an active Instructor of the section. */
export function isActiveInstructor(
  members: NrpsMember[],
  email: string
): boolean {
  const lower = email.toLowerCase();
  return members.some(
    (m) => isActive(m) && m.email === lower && deriveRole(m.roles) === 'teacher'
  );
}

/** Lowercased emails of the section's active learners. */
export function activeLearnerEmails(members: NrpsMember[]): Set<string> {
  return new Set(
    members
      .filter(
        (m) => isActive(m) && !!m.email && deriveRole(m.roles) === 'student'
      )
      .map((m) => m.email)
  );
}

interface OwnedRoster {
  rosterId: string;
  /** Exactly one of these is set: a real ClassLink class or an admin test class. */
  classlinkClassId: string | null;
  testClassId: string | null;
  classlinkOrgId: string | null;
}

async function ownedLinkableRosters(
  db: admin.firestore.Firestore,
  uid: string
): Promise<OwnedRoster[]> {
  const snap = await db
    .collection(USERS_COLLECTION)
    .doc(uid)
    .collection('rosters')
    .get();
  const out: OwnedRoster[] = [];
  for (const d of snap.docs) {
    const data = d.data() as {
      classlinkClassId?: unknown;
      testClassId?: unknown;
      classlinkOrgId?: unknown;
    };
    const str = (v: unknown): string | null =>
      typeof v === 'string' && v ? v : null;
    const classlinkClassId = str(data.classlinkClassId);
    const testClassId = classlinkClassId ? null : str(data.testClassId);
    if (classlinkClassId || testClassId) {
      out.push({
        rosterId: d.id,
        classlinkClassId,
        testClassId,
        classlinkOrgId: str(data.classlinkOrgId),
      });
    }
  }
  return out;
}

interface ClasslinkCreds {
  tenantUrl: string;
  clientId: string;
  clientSecret: string;
}

/** How many section learners are in each class, fetched a few at a time. */
async function overlapByClass(
  creds: ClasslinkCreds,
  classIds: string[],
  learnerEmails: Set<string>
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < classIds.length; i += FETCH_CONCURRENCY) {
    const batch = classIds.slice(i, i + FETCH_CONCURRENCY);
    await Promise.all(
      batch.map(async (classId) => {
        try {
          const students = await classroomAddonNet.fetchClassStudents(
            creds.tenantUrl,
            creds.clientId,
            creds.clientSecret,
            classId
          );
          const emails = new Set(
            students
              .map((s) => (s.email ?? '').toLowerCase())
              .filter((e) => e.length > 0)
          );
          let overlap = 0;
          for (const e of emails) if (learnerEmails.has(e)) overlap += 1;
          out.set(classId, overlap);
        } catch (err) {
          console.warn(
            `[ltiLinkByUrl] OneRoster fetch failed for class ${classId}:`,
            err
          );
        }
      })
    );
  }
  return out;
}

/**
 * Section learners in each roster's class: ClassLink classes through OneRoster
 * (when configured), admin test classes through their `memberEmails` (org admins only).
 */
async function overlapByRoster(
  db: admin.firestore.Firestore,
  callerEmail: string,
  creds: ClasslinkCreds | null,
  rosters: OwnedRoster[],
  learnerEmails: Set<string>
): Promise<Map<string, number>> {
  const classIds = [
    ...new Set(
      rosters.map((r) => r.classlinkClassId).filter((c): c is string => !!c)
    ),
  ].slice(0, MAX_CANDIDATE_CLASSES);
  const testIds = [
    ...new Set(
      rosters.map((r) => r.testClassId).filter((c): c is string => !!c)
    ),
  ].slice(0, MAX_CANDIDATE_CLASSES);
  const [classlink, test] = await Promise.all([
    creds && classIds.length > 0
      ? overlapByClass(creds, classIds, learnerEmails)
      : Promise.resolve(new Map<string, number>()),
    testIds.length > 0
      ? loadTestClassMembership(db, callerEmail, testIds).then(
          ({ membership }) => {
            const counts = new Map<string, number>();
            for (const [mail, classId] of membership) {
              if (learnerEmails.has(mail)) {
                counts.set(classId, (counts.get(classId) ?? 0) + 1);
              }
            }
            return counts;
          }
        )
      : Promise.resolve(new Map<string, number>()),
  ]);
  const out = new Map<string, number>();
  for (const r of rosters) {
    const n = r.classlinkClassId
      ? classlink.get(r.classlinkClassId)
      : r.testClassId
        ? test.get(r.testClassId)
        : undefined;
    out.set(r.rosterId, n ?? 0);
  }
  return out;
}

export interface LinkByUrlSuggestion {
  rosterId: string;
  overlap: number;
}

export const ltiLinkSectionByUrlV1 = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    secrets: [
      LTI_TOOL_PRIVATE_KEY,
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
    ],
  },
  async (request) => {
    assertViewAsAllowed(request);
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const email = request.auth.token.email;
    if (!email || request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }
    const callerUid = request.auth.uid;
    const data = (request.data ?? {}) as { url?: unknown; rosterId?: unknown };
    const contextId =
      typeof data.url === 'string' ? parseSchoologyCourseUrl(data.url) : null;
    if (!contextId) {
      throw new HttpsError(
        'invalid-argument',
        'Paste the link to a Schoology course, like https://orono.schoology.com/course/1234567890/materials.'
      );
    }
    const rosterId =
      typeof data.rosterId === 'string' && data.rosterId ? data.rosterId : null;
    if (rosterId !== null && !ROSTER_ID_RE.test(rosterId)) {
      throw new HttpsError('invalid-argument', 'Invalid class.');
    }

    const db = admin.firestore();
    if (
      !(await isGlobalFeatureGranted(
        db,
        SCHOOLOGY_TOOL_COLUMNS_FEATURE,
        email,
        callerUid
      ))
    ) {
      throw new HttpsError(
        'permission-denied',
        'Linking by course link is not available for your account.'
      );
    }

    const existing = await db
      .collection(LTI_COURSE_LINKS_COLLECTION)
      .doc(contextId)
      .get();
    const existingTeacher = existing.data()?.teacherUid as unknown;
    if (
      typeof existingTeacher === 'string' &&
      existingTeacher &&
      existingTeacher !== callerUid
    ) {
      throw new HttpsError(
        'already-exists',
        'This Schoology section is already linked by another teacher.'
      );
    }

    const cfg = await getLtiPlatformConfig(db);
    let members: NrpsMember[];
    let contextTitle: string | null;
    try {
      const token = await getAgsAccessToken({
        clientId: cfg.clientId,
        tokenUrl: cfg.tokenUrl,
        privatePem: LTI_TOOL_PRIVATE_KEY.value(),
        scopes: [NRPS_SCOPE],
      });
      ({ members, contextTitle } = await fetchNrpsMembership(
        schoologySectionUrls(contextId).membershipUrl,
        token
      ));
    } catch (err) {
      console.warn('[ltiLinkByUrl] NRPS read failed:', err);
      throw new HttpsError(
        'failed-precondition',
        'Couldn’t read that Schoology course. Check the link and try again.'
      );
    }

    if (!isActiveInstructor(members, email)) {
      throw new HttpsError(
        'permission-denied',
        'Your Schoology account isn’t listed as a teacher of this course. Ask an admin to link it.'
      );
    }
    const learnerEmails = activeLearnerEmails(members);
    if (learnerEmails.size === 0) {
      throw new HttpsError(
        'failed-precondition',
        'This Schoology course has no students yet, so it can’t be matched to a class.'
      );
    }

    const rawCreds: ClasslinkCreds = {
      tenantUrl: CLASSLINK_TENANT_URL.value(),
      clientId: CLASSLINK_CLIENT_ID.value(),
      clientSecret: CLASSLINK_CLIENT_SECRET.value(),
    };
    // Without ClassLink (dev), only admin test classes can be matched.
    const creds =
      rawCreds.tenantUrl && rawCreds.clientId && rawCreds.clientSecret
        ? rawCreds
        : null;

    const owned = await ownedLinkableRosters(db, callerUid);
    const storedTitle =
      typeof existing.data()?.contextTitle === 'string'
        ? (existing.data()?.contextTitle as string)
        : null;
    const title = contextTitle ?? storedTitle;

    if (rosterId === null) {
      const overlaps = await overlapByRoster(
        db,
        email,
        creds,
        owned,
        learnerEmails
      );
      const suggestions: LinkByUrlSuggestion[] = owned
        .map((r) => ({
          rosterId: r.rosterId,
          overlap: overlaps.get(r.rosterId) ?? 0,
        }))
        .filter((s) => s.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap);
      const linkedRosterId = existing.data()?.rosterId as unknown;
      return {
        contextId,
        contextTitle: title,
        learnerCount: learnerEmails.size,
        suggestions,
        linkedRosterId:
          typeof linkedRosterId === 'string' && existing.exists
            ? linkedRosterId
            : null,
      };
    }

    const roster = owned.find((r) => r.rosterId === rosterId);
    if (!roster) {
      throw new HttpsError(
        'permission-denied',
        'You can only link one of your own classes.'
      );
    }
    const overlap =
      (await overlapByRoster(db, email, creds, [roster], learnerEmails)).get(
        roster.rosterId
      ) ?? 0;
    if (overlap === 0) {
      throw new HttpsError(
        'failed-precondition',
        'None of this Schoology course’s students are in that class. Pick the class that matches the course.'
      );
    }

    await db.runTransaction(async (tx) => {
      const ref = db.collection(LTI_COURSE_LINKS_COLLECTION).doc(contextId);
      const snap = await tx.get(ref);
      const prior = snap.data()?.teacherUid as unknown;
      if (typeof prior === 'string' && prior && prior !== callerUid) {
        throw new HttpsError(
          'already-exists',
          'This Schoology section is already linked by another teacher.'
        );
      }
      const payload: Record<string, unknown> = {
        teacherUid: callerUid,
        contextId,
        classlinkClassId: roster.classlinkClassId,
        testClassId: roster.testClassId,
        classlinkOrgId: roster.classlinkOrgId,
        contextTitle: title,
        rosterId: roster.rosterId,
        linkedBy: 'url',
        updatedAt: Date.now(),
      };
      if (!snap.exists) payload.createdAt = Date.now();
      tx.set(ref, payload, { merge: true });
    });

    return { ok: true, contextId, contextTitle: title, overlap };
  }
);
