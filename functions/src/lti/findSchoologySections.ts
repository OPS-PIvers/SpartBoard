// Schoology auto-link: pair each of the caller's ClassLink classes with the
// Schoology section whose SIS id is that class (docs/plans/shipped/SCHOOLOGY_AUTO_LINK.md).
//
//   ltiFindSchoologySectionsV1 — {} lists one row per class; { rosterIds } links
//                                those classes after checking each one again.
//
// The SIS match (`section_school_code === classlinkClassId`) stands in for the
// student-overlap check. The caller must still be an active NRPS Instructor of
// the section. A co-teacher gets their own link; nobody else's link changes.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from '../firebaseAdmin';

import { getLtiPlatformConfig, NRPS_SCOPE } from './config';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { getAgsAccessToken } from './ags';
import { fetchNrpsMembership } from './nrps';
import { schoologySectionUrls } from './lineItems';
import { LTI_COURSE_LINKS_COLLECTION } from './courseLinkEndpoints';
import { linkContextId } from './courseLinkStore';
import {
  isActiveInstructor,
  ownedLinkableRosters,
  saveSectionLink,
  type OwnedRoster,
} from './linkSectionByUrl';
import { isGlobalFeatureGranted } from '../quizMediaArchive';
import { assertViewAsAllowed } from '../viewAsGuard';
import { isDistrictTeacher } from './teacherAuth';
import {
  getGradingPeriod,
  getSectionBySisId,
  type SchoologyApiCredentials,
  type SchoologySection,
} from '../schoology/restClient';

const LTI_TOOL_PRIVATE_KEY = defineSecret('LTI_TOOL_PRIVATE_KEY');
const SCHOOLOGY_API_CONSUMER_KEY = defineSecret('SCHOOLOGY_API_CONSUMER_KEY');
const SCHOOLOGY_API_CONSUMER_SECRET = defineSecret(
  'SCHOOLOGY_API_CONSUMER_SECRET'
);

export const SCHOOLOGY_AUTO_LINK_FEATURE = 'schoology-auto-link';
const MAX_CLASSES = 60;
const CONCURRENCY = 5;
const ROSTER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export type FoundStatus =
  'ready' | 'linked' | 'none' | 'taken' | 'not-teacher' | 'error';

export interface FoundRow {
  rosterId: string;
  status: FoundStatus;
  contextId?: string;
  contextTitle?: string | null;
  periodTitle?: string | null;
  /** The section this class is linked to now, when linking would replace it. */
  replacesTitle?: string | null;
  replaced?: string[];
  replacedIds?: string[];
  error?: string;
}

interface CallerLink {
  contextId: string;
  rosterId: string | null;
  classlinkClassId: string | null;
  contextTitle: string | null;
}

async function inBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    out.push(...(await Promise.all(items.slice(i, i + CONCURRENCY).map(fn))));
  }
  return out;
}

function restCreds(): SchoologyApiCredentials | null {
  const creds = {
    consumerKey: SCHOOLOGY_API_CONSUMER_KEY.value().trim(),
    consumerSecret: SCHOOLOGY_API_CONSUMER_SECRET.value().trim(),
  };
  if (
    !creds.consumerKey ||
    !creds.consumerSecret ||
    /placeholder/i.test(creds.consumerKey)
  ) {
    return null;
  }
  return creds;
}

/** One roster per ClassLink class (the most recently synced), at most MAX_CLASSES. */
export function onePerClass(rosters: OwnedRoster[]): OwnedRoster[] {
  const byClass = new Map<string, OwnedRoster>();
  for (const r of rosters) {
    if (!r.classlinkClassId) continue;
    const prev = byClass.get(r.classlinkClassId);
    if (!prev || r.syncedAt > prev.syncedAt) {
      byClass.set(r.classlinkClassId, r);
    }
  }
  return [...byClass.values()].slice(0, MAX_CLASSES);
}

async function callerLinks(
  db: admin.firestore.Firestore,
  uid: string
): Promise<CallerLink[]> {
  const snap = await db
    .collection(LTI_COURSE_LINKS_COLLECTION)
    .where('teacherUid', '==', uid)
    .get();
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v ? v : null;
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      contextId: linkContextId(d.id, data),
      rosterId: str(data.rosterId),
      classlinkClassId: str(data.classlinkClassId),
      contextTitle: str(data.contextTitle),
    };
  });
}

/** Rows for `rosters`: each class's section and whether the caller may link it. */
async function findRows(
  db: admin.firestore.Firestore,
  callerUid: string,
  email: string,
  creds: SchoologyApiCredentials,
  rosters: OwnedRoster[]
): Promise<FoundRow[]> {
  const sections = await inBatches(rosters, async (r) => {
    try {
      const s = await getSectionBySisId(creds, r.classlinkClassId as string);
      const matches =
        !!s &&
        s.sisId.toLowerCase() === (r.classlinkClassId as string).toLowerCase();
      return { section: matches ? s : null, failed: false };
    } catch (err) {
      console.warn(
        `[ltiFindSections] REST lookup failed for ${r.rosterId}:`,
        err
      );
      return { section: null, failed: true };
    }
  });

  const sectionIds = [
    ...new Set(
      sections.map((x) => x.section?.id).filter((id): id is string => !!id)
    ),
  ];

  const cfg = await getLtiPlatformConfig(db);
  let token: string | null = null;
  try {
    token = await getAgsAccessToken({
      clientId: cfg.clientId,
      tokenUrl: cfg.tokenUrl,
      privatePem: LTI_TOOL_PRIVATE_KEY.value(),
      scopes: [NRPS_SCOPE],
    });
  } catch (err) {
    console.warn('[ltiFindSections] NRPS token failed:', err);
  }
  const instructorOf = new Map<
    string,
    { ok: boolean; title: string | null } | null
  >();
  // Co-teachers each link their own class, so every section is checked against NRPS.
  await inBatches(sectionIds, async (id) => {
    if (!token) {
      instructorOf.set(id, null);
      return;
    }
    try {
      const { members, contextTitle } = await fetchNrpsMembership(
        schoologySectionUrls(id).membershipUrl,
        token
      );
      instructorOf.set(id, {
        ok: isActiveInstructor(members, email),
        title: contextTitle,
      });
    } catch (err) {
      console.warn(`[ltiFindSections] NRPS read failed for ${id}:`, err);
      instructorOf.set(id, null);
    }
  });

  const periodIds = [
    ...new Set(
      sections.flatMap((x) => x.section?.gradingPeriodIds.slice(0, 1) ?? [])
    ),
  ];
  const periodTitle = new Map<string, string>();
  await inBatches(periodIds, async (id) => {
    try {
      const p = await getGradingPeriod(creds, id);
      if (p?.title) periodTitle.set(id, p.title);
    } catch {
      // A missing period title only hides the semester label.
    }
  });

  const links = await callerLinks(db, callerUid);
  const linkFor = (r: OwnedRoster): CallerLink | undefined =>
    links.find(
      (l) =>
        l.rosterId === r.rosterId ||
        (!!r.classlinkClassId && l.classlinkClassId === r.classlinkClassId)
    );

  return rosters.map((r, i): FoundRow => {
    const { section, failed } = sections[i];
    if (!section) {
      return { rosterId: r.rosterId, status: failed ? 'error' : 'none' };
    }
    const s: SchoologySection = section;
    const nrps = instructorOf.get(s.id);
    const current = linkFor(r);
    const base = {
      rosterId: r.rosterId,
      contextId: s.id,
      contextTitle: nrps?.title ?? (s.title || null),
      periodTitle: s.gradingPeriodIds[0]
        ? (periodTitle.get(s.gradingPeriodIds[0]) ?? null)
        : null,
    };
    if (current?.contextId === s.id) return { ...base, status: 'linked' };
    if (nrps === undefined || nrps === null)
      return { ...base, status: 'error' };
    if (!nrps.ok) return { ...base, status: 'not-teacher' };
    return {
      ...base,
      status: 'ready',
      replacesTitle: current
        ? (current.contextTitle ?? 'another section')
        : null,
    };
  });
}

export const ltiFindSchoologySectionsV1 = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    secrets: [
      LTI_TOOL_PRIVATE_KEY,
      SCHOOLOGY_API_CONSUMER_KEY,
      SCHOOLOGY_API_CONSUMER_SECRET,
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
    const data = (request.data ?? {}) as { rosterIds?: unknown };
    let rosterIds: string[] | null = null;
    if (data.rosterIds !== undefined) {
      if (
        !Array.isArray(data.rosterIds) ||
        data.rosterIds.length === 0 ||
        data.rosterIds.length > MAX_CLASSES ||
        !data.rosterIds.every(
          (id): id is string => typeof id === 'string' && ROSTER_ID_RE.test(id)
        )
      ) {
        throw new HttpsError('invalid-argument', 'Invalid classes.');
      }
      rosterIds = [...new Set(data.rosterIds)];
    }

    const db = admin.firestore();
    if (
      !(await isGlobalFeatureGranted(
        db,
        SCHOOLOGY_AUTO_LINK_FEATURE,
        email,
        callerUid
      ))
    ) {
      throw new HttpsError(
        'permission-denied',
        'Finding Schoology courses is not available for your account.'
      );
    }
    const creds = restCreds();
    if (!creds) {
      throw new HttpsError(
        'failed-precondition',
        'Schoology isn’t connected yet. Ask an admin.'
      );
    }

    const owned = await ownedLinkableRosters(db, callerUid);
    if (rosterIds === null) {
      const rows = await findRows(
        db,
        callerUid,
        email,
        creds,
        onePerClass(owned)
      );
      return { rows };
    }

    const wanted = onePerClass(
      owned.filter((r) => rosterIds.includes(r.rosterId))
    );
    const rows = await findRows(db, callerUid, email, creds, wanted);
    const results: FoundRow[] = [];
    for (const [i, row] of rows.entries()) {
      if (row.status !== 'ready' || !row.contextId) {
        results.push(row);
        continue;
      }
      try {
        const replaced = await saveSectionLink(
          db,
          callerUid,
          row.contextId,
          wanted[i],
          row.contextTitle ?? null,
          'sis'
        );
        results.push({ ...row, status: 'linked', ...replaced });
      } catch (err) {
        results.push({
          ...row,
          status:
            err instanceof HttpsError && err.code === 'already-exists'
              ? 'taken'
              : 'error',
        });
      }
    }
    for (const id of rosterIds) {
      if (!wanted.some((r) => r.rosterId === id)) {
        results.push({
          rosterId: id,
          status: 'error',
          error: 'You can only link one of your own classes.',
        });
      }
    }
    return { rows: results };
  }
);
