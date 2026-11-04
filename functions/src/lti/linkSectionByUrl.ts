// Schoology LTI 1.3 — link a section to a class by pasting its course URL
// (docs/plans/shipped/SCHOOLOGY_TOOL_COLUMNS.md D1–D2).
//
//   ltiLinkSectionByUrlV1 — { url } returns the section title and the caller's
//                           classes ranked by student overlap; { url, rosterId }
//                           links the section to that roster's ClassLink class.
//
// Ownership needs no launch: the caller's email must be an active Instructor in
// the section's NRPS roster, and the section's learners must overlap the chosen
// class. NRPS and OneRoster emails are read transiently, never returned or stored.
// Co-teachers each keep their own link (courseLinkStore.ts).

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from '../firebaseAdmin';

import { getLtiPlatformConfig, NRPS_SCOPE } from './config';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { getAgsAccessToken } from './ags';
import { fetchNrpsMembership, type NrpsMember } from './nrps';
import { deriveRole } from './jwt';
import { schoologySectionUrls } from './lineItems';
import {
  LTI_COURSE_LINKS_COLLECTION,
  dropOtherLinksForClass,
  type ReplacedLinks,
} from './courseLinkEndpoints';
import { USERS_COLLECTION } from './nrpsStore';
import {
  isActiveInstructor,
  readTeacherLink,
  writeTeacherLink,
} from './courseLinkStore';

export { isActiveInstructor };
import { classroomAddonNet } from '../classroomAddonAuth';
import { loadTestClassMembership } from '../studentAssignmentTargets';
import { assertViewAsAllowed } from '../viewAsGuard';
import { isDistrictTeacher } from './teacherAuth';

const LTI_TOOL_PRIVATE_KEY = defineSecret('LTI_TOOL_PRIVATE_KEY');
const CLASSLINK_CLIENT_ID = defineSecret('CLASSLINK_CLIENT_ID');
const CLASSLINK_CLIENT_SECRET = defineSecret('CLASSLINK_CLIENT_SECRET');
const CLASSLINK_TENANT_URL = defineSecret('CLASSLINK_TENANT_URL');

/** Cap on distinct ClassLink classes one preview call OneRoster-fetches. */
const MAX_CANDIDATE_CLASSES = 60;
const FETCH_CONCURRENCY = 5;
const ROSTER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** The section id in a pasted Schoology course link (a linked section's `csm_section_nid` wins), or null. */
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
  if (!m) return null;
  const section =
    /(?:^|[#&])csm_section_nid=(\d{1,20})(?:&|$)/.exec(url.hash) ??
    /(?:^|[?&])csm_section_nid=(\d{1,20})(?:&|$)/.exec(url.search);
  return section ? section[1] : m[1];
}

const isActive = (m: NrpsMember): boolean =>
  !m.status || m.status.toLowerCase() === 'active';

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

export interface OwnedRoster {
  rosterId: string;
  /** Exactly one of these is set: a real ClassLink class or an admin test class. */
  classlinkClassId: string | null;
  testClassId: string | null;
  classlinkOrgId: string | null;
  /** When ClassLink last synced the roster, else when it was created. */
  syncedAt: number;
}

export async function ownedLinkableRosters(
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
      classlinkSyncedAt?: unknown;
      createdAt?: unknown;
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
        syncedAt:
          typeof data.classlinkSyncedAt === 'number'
            ? data.classlinkSyncedAt
            : typeof data.createdAt === 'number'
              ? data.createdAt
              : 0,
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

/** Write the caller's own link of `contextId` to `roster`, then drop the class's other links. */
export async function saveSectionLink(
  db: admin.firestore.Firestore,
  callerUid: string,
  contextId: string,
  roster: OwnedRoster,
  title: string | null,
  linkedBy: 'url' | 'sis'
): Promise<ReplacedLinks> {
  // Callers have just checked NRPS lists the caller as an active Instructor, so a co-teacher may link too.
  await writeTeacherLink(
    db,
    callerUid,
    contextId,
    {
      classlinkClassId: roster.classlinkClassId,
      testClassId: roster.testClassId,
      classlinkOrgId: roster.classlinkOrgId,
      rosterId: roster.rosterId,
      contextTitle: title,
      linkedBy,
    },
    true
  );
  return dropOtherLinksForClass(db, callerUid, contextId, {
    rosterId: roster.rosterId,
    classlinkClassId: roster.classlinkClassId,
    testClassId: roster.testClassId,
  });
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
    if (!email || !(await isDistrictTeacher(request.auth.token))) {
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
    const [sectionDoc, ownLink] = await Promise.all([
      db.collection(LTI_COURSE_LINKS_COLLECTION).doc(contextId).get(),
      readTeacherLink(db, contextId, callerUid),
    ]);

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
      typeof ownLink?.contextTitle === 'string'
        ? ownLink.contextTitle
        : typeof sectionDoc.data()?.contextTitle === 'string'
          ? (sectionDoc.data()?.contextTitle as string)
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
      const linkedRosterId = ownLink?.rosterId;
      return {
        contextId,
        contextTitle: title,
        learnerCount: learnerEmails.size,
        suggestions,
        linkedRosterId:
          typeof linkedRosterId === 'string' ? linkedRosterId : null,
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

    const replaced = await saveSectionLink(
      db,
      callerUid,
      contextId,
      roster,
      title,
      'url'
    );

    return { ok: true, contextId, contextTitle: title, overlap, ...replaced };
  }
);
