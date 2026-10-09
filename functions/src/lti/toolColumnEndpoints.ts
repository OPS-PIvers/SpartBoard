// Schoology LTI 1.3 — callables for SpartBoard-created gradebook columns
// (docs/plans/SCHOOLOGY_TOOL_COLUMNS.md D4–D8, D12–D14).
//
//   ltiToolColumnCategoriesV1       — each target section's categories, column state and default pick
//   ltiCreateToolColumnCategoriesV1 — create categories in a section that has none
//   ltiPushToolColumnV1             — create/update the column and write changed cells
//   ltiDeleteToolColumnsV1          — remove an assignment's columns from Schoology
//
// Target sections are always derived server-side from the caller's own
// lti_course_links, never taken from the client.

import {
  onCall,
  HttpsError,
  type CallableRequest,
} from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

import {
  getLtiPlatformConfig,
  AGS_SCOPE_LINEITEM,
  AGS_SCOPE_SCORE,
  NRPS_SCOPE,
} from './config';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { getAgsAccessToken, postScore } from './ags';
import { fetchNrpsMembers } from './nrps';
import { ltiStudentUid } from './identity';
import {
  LTI_IDENTITY_BRIDGE_COLLECTION,
  oneRosterUidsByEmail,
} from './classlinkBridge';
import { LTI_COURSE_LINKS_COLLECTION } from './courseLinkEndpoints';
import {
  QUIZ_SESSIONS_COLLECTION,
  VIDEO_ACTIVITY_SESSIONS_COLLECTION,
  type LtiSessionKind,
} from './nrpsStore';
import {
  createLineItem,
  deleteLineItem,
  isSchoologySectionId,
  isSchoologyServiceUrl,
  listLineItems,
  updateLineItemMaximum,
} from './lineItems';
import * as rest from '../schoology/restClient';
import {
  CREATE_LEASE_MS,
  mergeSectionResults,
  pushSection,
  toolColumnResourceId,
  validateCategoryProposal,
  type CategoryProposal,
  type ColumnStore,
  type GradeEntry,
  type RestOps,
  type TargetSection,
  type ToolColumnDeps,
  type ToolColumnRecord,
} from './toolColumns';
import { SCHOOLOGY_TOOL_COLUMNS_FEATURE } from './linkSectionByUrl';
import { isGlobalFeatureGranted } from '../quizMediaArchive';
import { assertViewAsAllowed } from '../viewAsGuard';

const LTI_TOOL_PRIVATE_KEY = defineSecret('LTI_TOOL_PRIVATE_KEY');
const STUDENT_PSEUDONYM_HMAC_SECRET = defineSecret(
  'STUDENT_PSEUDONYM_HMAC_SECRET'
);
const CLASSLINK_CLIENT_ID = defineSecret('CLASSLINK_CLIENT_ID');
const CLASSLINK_CLIENT_SECRET = defineSecret('CLASSLINK_CLIENT_SECRET');
const CLASSLINK_TENANT_URL = defineSecret('CLASSLINK_TENANT_URL');
const SCHOOLOGY_API_CONSUMER_KEY = defineSecret('SCHOOLOGY_API_CONSUMER_KEY');
const SCHOOLOGY_API_CONSUMER_SECRET = defineSecret(
  'SCHOOLOGY_API_CONSUMER_SECRET'
);

export const LTI_TOOL_COLUMNS_COLLECTION = 'lti_tool_columns';
export const LTI_TOOL_COLUMNS_PREFS_COLLECTION = 'lti_tool_columns_prefs';
export const SCHOOLOGY_CATEGORIES_DOC = 'admin_settings/schoology_categories';
export const DEFAULT_RECOMMENDED_CATEGORIES: CategoryProposal[] = [
  { title: 'Academic Practice', weight: 20 },
  { title: 'Academic Achievement', weight: 80 },
];

const MAX_GRADES = 1000;
const MAX_POINTS = 100_000;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const CALL_OPTS = {
  region: 'us-central1' as const,
  invoker: 'public' as const,
  cors: ALLOWED_ORIGINS,
};

function sessionCollection(kind: LtiSessionKind): string {
  return kind === 'va'
    ? VIDEO_ACTIVITY_SESSIONS_COLLECTION
    : QUIZ_SESSIONS_COLLECTION;
}

function parseKind(kind: unknown): LtiSessionKind {
  if (kind === undefined || kind === 'quiz') return 'quiz';
  if (kind === 'va') return 'va';
  throw new HttpsError('invalid-argument', "kind must be 'quiz' or 'va'.");
}

function requireTeacher(request: CallableRequest): {
  uid: string;
  email: string;
} {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const email = request.auth.token.email;
  if (!email || request.auth.token.studentRole === true) {
    throw new HttpsError('permission-denied', 'Teacher account required.');
  }
  return { uid: request.auth.uid, email };
}

async function requireFeature(
  db: admin.firestore.Firestore,
  uid: string,
  email: string
): Promise<void> {
  if (
    !(await isGlobalFeatureGranted(
      db,
      SCHOOLOGY_TOOL_COLUMNS_FEATURE,
      email,
      uid
    ))
  ) {
    throw new HttpsError(
      'permission-denied',
      'Schoology gradebook columns are not available for your account.'
    );
  }
}

interface OwnedSession {
  sessionId: string;
  kind: LtiSessionKind;
  title: string;
  classIds: string[];
  rosterIds: string[];
}

async function loadOwnedSession(
  db: admin.firestore.Firestore,
  uid: string,
  data: { sessionId?: unknown; kind?: unknown }
): Promise<OwnedSession> {
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new HttpsError('invalid-argument', 'sessionId is required.');
  }
  const kind = parseKind(data.kind);
  const snap = await db
    .collection(sessionCollection(kind))
    .doc(sessionId)
    .get();
  const s = snap.data() as Record<string, unknown> | undefined;
  if (!snap.exists || !s || s.teacherUid !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Not the teacher of this session.'
    );
  }
  const rawTitle: unknown = kind === 'va' ? s.activityTitle : s.quizTitle;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    sessionId,
    kind,
    title:
      typeof rawTitle === 'string' && rawTitle.trim()
        ? rawTitle.trim().slice(0, 200)
        : 'SpartBoard assignment',
    classIds: strings(s.classIds),
    rosterIds: strings(s.rosterIds),
  };
}

/** D4: the caller's linked sections whose class or roster this session targets. */
export async function targetSections(
  db: admin.firestore.Firestore,
  uid: string,
  session: Pick<OwnedSession, 'classIds' | 'rosterIds'>
): Promise<TargetSection[]> {
  const snap = await db
    .collection(LTI_COURSE_LINKS_COLLECTION)
    .where('teacherUid', '==', uid)
    .get();
  const classIds = new Set(session.classIds);
  const rosterIds = new Set(session.rosterIds);
  const out: TargetSection[] = [];
  for (const d of snap.docs) {
    const l = d.data() as Record<string, unknown>;
    const str = (v: unknown): string | null =>
      typeof v === 'string' && v ? v : null;
    const classlinkClassId = str(l.classlinkClassId);
    const testClassId = str(l.testClassId);
    const rosterId = str(l.rosterId);
    const targeted =
      (classlinkClassId && classIds.has(classlinkClassId)) ||
      (testClassId && classIds.has(testClassId)) ||
      (rosterId && rosterIds.has(rosterId));
    if (!targeted || !isSchoologySectionId(d.id)) continue;
    out.push({ contextId: d.id, title: str(l.contextTitle), classlinkClassId });
  }
  return out;
}

async function requireTargets(
  db: admin.firestore.Firestore,
  uid: string,
  session: OwnedSession
): Promise<TargetSection[]> {
  const targets = await targetSections(db, uid, session);
  if (targets.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'Link this class to Schoology first.'
    );
  }
  return targets;
}

/** Firestore-backed column records for one session (server-only collections). */
export function firestoreColumnStore(
  db: admin.firestore.Firestore,
  sessionId: string,
  teacherUid: string,
  kind: LtiSessionKind
): ColumnStore {
  const parent = db.collection(LTI_TOOL_COLUMNS_COLLECTION).doc(sessionId);
  const ref = (contextId: string) =>
    parent.collection('sections').doc(contextId);
  const prefRef = (contextId: string) =>
    db
      .collection(LTI_TOOL_COLUMNS_PREFS_COLLECTION)
      .doc(`${teacherUid}_${contextId}`);
  const toRecord = (d: Record<string, unknown> | undefined) => {
    if (!d || typeof d.lineitemUrl !== 'string') return null;
    const record: ToolColumnRecord = {
      lineitemUrl: d.lineitemUrl,
      columnId: typeof d.columnId === 'string' ? d.columnId : null,
      scoreMaximum: typeof d.scoreMaximum === 'number' ? d.scoreMaximum : 0,
      categoryId: typeof d.categoryId === 'string' ? d.categoryId : null,
      lastPushed:
        d.lastPushed && typeof d.lastPushed === 'object'
          ? (d.lastPushed as Record<string, string>)
          : {},
    };
    return record;
  };
  return {
    async get(contextId) {
      return toRecord((await ref(contextId).get()).data());
    },
    async claimCreate(contextId, now) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref(contextId));
        const d = snap.data();
        const record = toRecord(d);
        if (record) return { state: 'exists' as const, record };
        if (
          d?.status === 'creating' &&
          typeof d.leaseUntil === 'number' &&
          d.leaseUntil > now
        ) {
          return { state: 'busy' as const };
        }
        tx.set(parent, { teacherUid, kind, updatedAt: now }, { merge: true });
        tx.set(ref(contextId), {
          status: 'creating',
          leaseUntil: now + CREATE_LEASE_MS,
        });
        return { state: 'claimed' as const };
      });
    },
    async releaseClaim(contextId) {
      const snap = await ref(contextId).get();
      if (snap.exists && !toRecord(snap.data())) await ref(contextId).delete();
    },
    async save(contextId, record) {
      await ref(contextId).set({
        ...record,
        status: 'ready',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    },
    async clear(contextId) {
      await ref(contextId).delete();
    },
    async recordPush(contextId, lastPushed, scoreMaximum) {
      await ref(contextId).set(
        { lastPushed, scoreMaximum, updatedAt: Date.now() },
        { merge: true }
      );
    },
    async setCategoryId(contextId, categoryId) {
      await ref(contextId).set(
        { categoryId, updatedAt: Date.now() },
        { merge: true }
      );
    },
    async getPref(contextId) {
      const v = (await prefRef(contextId).get()).data()?.categoryId as unknown;
      return typeof v === 'string' ? v : null;
    },
    async setPref(contextId, categoryId) {
      await prefRef(contextId).set({ categoryId, updatedAt: Date.now() });
    },
  };
}

/** REST ops bound to the SIS Connect key, or null when the key isn't configured (dev). */
function restOps(): RestOps | null {
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
  return {
    listGradingCategories: (s) => rest.listGradingCategories(creds, s),
    createGradingCategories: (s, c) =>
      rest.createGradingCategories(creds, s, c),
    setColumnCategory: (s, col, cat) =>
      rest.setColumnCategory(creds, s, col, cat),
    getColumnCategory: (s, col) => rest.getColumnCategory(creds, s, col),
    listColumnGrades: (s, col) => rest.listColumnGrades(creds, s, col),
    setExceptions: (s, rows) => rest.setExceptions(creds, s, rows),
    listEnrollments: (s) => rest.listEnrollments(creds, s),
  };
}

async function buildDeps(
  db: admin.firestore.Firestore,
  store: ColumnStore
): Promise<ToolColumnDeps> {
  const cfg = await getLtiPlatformConfig(db);
  const hmac = STUDENT_PSEUDONYM_HMAC_SECRET.value();
  if (!hmac) throw new HttpsError('internal', 'Server not configured.');
  let tokenPromise: Promise<string> | null = null;
  return {
    now: () => Date.now(),
    token: () => {
      tokenPromise ??= getAgsAccessToken({
        clientId: cfg.clientId,
        tokenUrl: cfg.tokenUrl,
        privatePem: LTI_TOOL_PRIVATE_KEY.value(),
        scopes: [AGS_SCOPE_LINEITEM, AGS_SCOPE_SCORE, NRPS_SCOPE],
      }).catch((err: unknown) => {
        console.error('[ltiToolColumn] AGS token mint failed:', err);
        throw new HttpsError(
          'internal',
          'Could not authorize the Schoology gradebook service.'
        );
      });
      return tokenPromise;
    },
    listLineItems,
    createLineItem,
    updateLineItemMaximum,
    postScore,
    nrpsMembers: fetchNrpsMembers,
    subUid: (sub) => ltiStudentUid(sub, hmac),
    bridgeUids: async (subUids) => {
      const out = new Map<string, string>();
      if (subUids.length === 0) return out;
      const snaps = await db.getAll(
        ...subUids.map((u) => db.doc(`${LTI_IDENTITY_BRIDGE_COLLECTION}/${u}`))
      );
      snaps.forEach((snap, i) => {
        const uid = snap.data()?.classlinkUid as unknown;
        if (typeof uid === 'string' && uid) out.set(subUids[i], uid);
      });
      return out;
    },
    oneRosterUids: (classId) =>
      oneRosterUidsByEmail(
        {
          tenantUrl: CLASSLINK_TENANT_URL.value(),
          clientId: CLASSLINK_CLIENT_ID.value(),
          clientSecret: CLASSLINK_CLIENT_SECRET.value(),
        },
        classId,
        hmac
      ),
    rest: restOps(),
    store,
  };
}

async function recommendedCategories(
  db: admin.firestore.Firestore
): Promise<CategoryProposal[]> {
  try {
    const raw = (await db.doc(SCHOOLOGY_CATEGORIES_DOC).get()).data()
      ?.categories as unknown;
    return validateCategoryProposal(raw) ?? DEFAULT_RECOMMENDED_CATEGORIES;
  } catch {
    return DEFAULT_RECOMMENDED_CATEGORIES;
  }
}

// ── ltiToolColumnCategoriesV1 ──────────────────────────────────────────────
export const ltiToolColumnCategoriesV1 = onCall(
  {
    ...CALL_OPTS,
    secrets: [SCHOOLOGY_API_CONSUMER_KEY, SCHOOLOGY_API_CONSUMER_SECRET],
  },
  async (request) => {
    assertViewAsAllowed(request, { read: true });
    const { uid, email } = requireTeacher(request);
    const db = admin.firestore();
    await requireFeature(db, uid, email);
    const session = await loadOwnedSession(
      db,
      uid,
      (request.data ?? {}) as Record<string, unknown>
    );
    const targets = await requireTargets(db, uid, session);
    const store = firestoreColumnStore(
      db,
      session.sessionId,
      uid,
      session.kind
    );
    const ops = restOps();

    const sections = await Promise.all(
      targets.map(async (t) => {
        const record = await store.get(t.contextId);
        let categories: rest.GradingCategory[] | null = null;
        let columnCategoryId: string | null = null;
        if (ops) {
          try {
            categories = await ops.listGradingCategories(t.contextId);
            if (record?.columnId) {
              columnCategoryId = await ops.getColumnCategory(
                t.contextId,
                record.columnId
              );
            }
          } catch (err) {
            console.warn('[ltiToolColumnCategories] REST read failed:', err);
            categories = null;
          }
        }
        const pref = await store.getPref(t.contextId);
        return {
          contextId: t.contextId,
          title: t.title,
          hasColumn: !!record,
          // A new column needs a pick; an existing one only when it sits in no category.
          needsCategory: !!categories && (!record || columnCategoryId === '0'),
          // null: categories couldn't be read, so the push goes ahead without one.
          categories,
          defaultCategoryId:
            pref && categories?.some((c) => c.id === pref) ? pref : null,
        };
      })
    );
    return {
      sections,
      recommended: await recommendedCategories(db),
    };
  }
);

// ── ltiCreateToolColumnCategoriesV1 ────────────────────────────────────────
export const ltiCreateToolColumnCategoriesV1 = onCall(
  {
    ...CALL_OPTS,
    secrets: [SCHOOLOGY_API_CONSUMER_KEY, SCHOOLOGY_API_CONSUMER_SECRET],
  },
  async (request) => {
    assertViewAsAllowed(request, { outward: true });
    const { uid, email } = requireTeacher(request);
    const db = admin.firestore();
    await requireFeature(db, uid, email);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const session = await loadOwnedSession(db, uid, data);
    const contextId = typeof data.contextId === 'string' ? data.contextId : '';
    const proposal = validateCategoryProposal(data.categories);
    if (!proposal) {
      throw new HttpsError(
        'invalid-argument',
        'Give each category a different name and make the weights add up to 100.'
      );
    }
    const targets = await requireTargets(db, uid, session);
    if (!targets.some((t) => t.contextId === contextId)) {
      throw new HttpsError(
        'permission-denied',
        'That Schoology section isn’t linked to this assignment’s classes.'
      );
    }
    const ops = restOps();
    if (!ops) {
      throw new HttpsError(
        'failed-precondition',
        'Schoology categories can’t be created right now.'
      );
    }
    try {
      const existing = await ops.listGradingCategories(contextId);
      if (existing.length > 0) {
        throw new HttpsError(
          'failed-precondition',
          'This Schoology course already has grading categories.'
        );
      }
      const categories = await ops.createGradingCategories(contextId, proposal);
      return {
        categories,
        // Weights are stored but read 0 until the teacher turns weighting on.
        weightingOff:
          proposal.some((c) => c.weight > 0) &&
          categories.every((c) => c.weight === 0),
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.warn('[ltiCreateToolColumnCategories] REST failed:', err);
      throw new HttpsError(
        'unavailable',
        'Schoology didn’t create the categories. Try again.'
      );
    }
  }
);

// ── ltiPushToolColumnV1 ─────────────────────────────────────────────────────
export const ltiPushToolColumnV1 = onCall(
  {
    ...CALL_OPTS,
    timeoutSeconds: 300,
    secrets: [
      LTI_TOOL_PRIVATE_KEY,
      STUDENT_PSEUDONYM_HMAC_SECRET,
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
      SCHOOLOGY_API_CONSUMER_KEY,
      SCHOOLOGY_API_CONSUMER_SECRET,
    ],
  },
  async (request) => {
    assertViewAsAllowed(request, { outward: true });
    const { uid, email } = requireTeacher(request);
    const db = admin.firestore();
    await requireFeature(db, uid, email);
    const data = (request.data ?? {}) as Record<string, unknown>;
    const maxPoints =
      typeof data.maxPoints === 'number' &&
      Number.isFinite(data.maxPoints) &&
      data.maxPoints > 0 &&
      data.maxPoints <= MAX_POINTS
        ? data.maxPoints
        : 0;
    const rawGrades = Array.isArray(data.grades) ? data.grades : [];
    if (!maxPoints || rawGrades.length === 0 || rawGrades.length > MAX_GRADES) {
      throw new HttpsError(
        'invalid-argument',
        'A positive maxPoints and a non-empty grades array are required.'
      );
    }
    const grades: GradeEntry[] = rawGrades.map((g) => {
      const o = (g ?? {}) as Record<string, unknown>;
      return {
        pseudonymUid: typeof o.pseudonymUid === 'string' ? o.pseudonymUid : '',
        ...(o.missing === true
          ? { missing: true }
          : typeof o.pointsEarned === 'number'
            ? { pointsEarned: o.pointsEarned }
            : {}),
      };
    });
    const pickedCategories = new Map<string, string>();
    if (data.categories && typeof data.categories === 'object') {
      for (const [ctx, cat] of Object.entries(
        data.categories as Record<string, unknown>
      )) {
        if (typeof cat === 'string' && /^\d{1,20}$/.test(cat)) {
          pickedCategories.set(ctx, cat);
        }
      }
    }
    const create = data.create === true;

    const session = await loadOwnedSession(db, uid, data);
    const targets = await requireTargets(db, uid, session);
    const store = firestoreColumnStore(
      db,
      session.sessionId,
      uid,
      session.kind
    );
    const deps = await buildDeps(db, store);
    const resourceId = toolColumnResourceId(session.kind, session.sessionId);

    const outcomes = [];
    for (const section of targets) {
      try {
        outcomes.push(
          await pushSection(deps, {
            section,
            resourceId,
            label: session.title,
            maxPoints,
            grades,
            create,
            categoryId: pickedCategories.get(section.contextId) ?? null,
          })
        );
      } catch (err) {
        if (err instanceof HttpsError) throw err;
        console.warn(
          `[ltiPushToolColumn] section ${section.contextId} failed:`,
          err
        );
        outcomes.push({
          contextId: section.contextId,
          title: section.title,
          status: 'failed' as const,
          columnCreated: false,
          needsCategory: false,
          results: grades.map((g) => ({
            pseudonymUid: g.pseudonymUid,
            ok: false,
            reason: 'section failed',
          })),
        });
      }
    }

    if (outcomes.some((o) => o.status === 'pushed')) {
      await db
        .collection(sessionCollection(session.kind))
        .doc(session.sessionId)
        .set({ ltiToolColumn: true }, { merge: true })
        .catch((err: unknown) =>
          console.warn('[ltiPushToolColumn] session flag write failed:', err)
        );
    }

    const results = mergeSectionResults(grades, outcomes);
    // PII-free diagnostics: counts only.
    console.log(
      `[ltiPushToolColumn] session=${session.sessionId} sections=${targets.length} ` +
        `pushed=${results.filter((r) => r.ok).length} total=${grades.length}`
    );
    return {
      results,
      pushed: results.filter((r) => r.ok).length,
      total: grades.length,
      sections: outcomes.map(
        ({ contextId, title, status, columnCreated, needsCategory }) => ({
          contextId,
          title,
          status,
          columnCreated,
          needsCategory,
        })
      ),
    };
  }
);

// ── ltiDeleteToolColumnsV1 ──────────────────────────────────────────────────
export const ltiDeleteToolColumnsV1 = onCall(
  { ...CALL_OPTS, secrets: [LTI_TOOL_PRIVATE_KEY] },
  async (request) => {
    assertViewAsAllowed(request, { outward: true });
    const { uid } = requireTeacher(request);
    const data = (request.data ?? {}) as { sessionId?: unknown };
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    if (!SESSION_ID_RE.test(sessionId)) {
      throw new HttpsError('invalid-argument', 'sessionId is required.');
    }
    const db = admin.firestore();
    // The session may already be deleted, so ownership is the column parent's teacherUid.
    const parent = db.collection(LTI_TOOL_COLUMNS_COLLECTION).doc(sessionId);
    const parentSnap = await parent.get();
    if (!parentSnap.exists) return { deleted: 0, notFound: 0, failed: 0 };
    if (parentSnap.data()?.teacherUid !== uid) {
      throw new HttpsError(
        'permission-denied',
        'Not the teacher of this session.'
      );
    }
    const sections = await parent.collection('sections').get();
    const cfg = await getLtiPlatformConfig(db);
    let token: string;
    try {
      token = await getAgsAccessToken({
        clientId: cfg.clientId,
        tokenUrl: cfg.tokenUrl,
        privatePem: LTI_TOOL_PRIVATE_KEY.value(),
        scopes: [AGS_SCOPE_LINEITEM],
      });
    } catch (err) {
      console.error('[ltiDeleteToolColumns] AGS token mint failed:', err);
      throw new HttpsError(
        'internal',
        'Could not authorize the Schoology gradebook service.'
      );
    }
    let deleted = 0;
    let notFound = 0;
    let failed = 0;
    for (const doc of sections.docs) {
      const url = doc.data().lineitemUrl as unknown;
      try {
        if (typeof url === 'string' && isSchoologyServiceUrl(url)) {
          const r = await deleteLineItem(url, token);
          if (r === 'deleted') deleted += 1;
          else notFound += 1;
        }
        await doc.ref.delete();
      } catch (err) {
        failed += 1;
        console.warn(`[ltiDeleteToolColumns] ${doc.id} failed:`, err);
      }
    }
    if (failed === 0) await parent.delete();
    return { deleted, notFound, failed };
  }
);
