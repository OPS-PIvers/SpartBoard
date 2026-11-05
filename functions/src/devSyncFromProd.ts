// Dev-only: replaces the caller's own materials and the shared admin config in spartboard-dev with a fresh copy from prod. Read-only on prod.
import {
  onCall,
  HttpsError,
  type CallableRequest,
} from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import './functionsInit';
import { assertViewAsAllowed } from './viewAsGuard';

export const DEV_PROJECT_ID = 'spartboard-dev';
const PROD_PROJECT_ID = 'spartboard';
const PROD_READER_SA = 'prod-reader@spartboard-dev.iam.gserviceaccount.com';
const PROD_DOCS = `https://firestore.googleapis.com/v1/projects/${PROD_PROJECT_ID}/databases/(default)/documents`;

// The teacher's own materials and settings. OAuth tokens, assignments, PLC state and alert schedules (dev would email twice) stay out.
export const SYNCED_USER_COLLECTIONS = [
  'activity_wall_activities',
  'collections',
  'dashboards',
  'flashcard_folders',
  'flashcard_sets',
  'gradebook_classes',
  'gradebook_settings',
  'guided_learning',
  'guided_learning_folders',
  'mini_app_keys',
  'miniapp_folders',
  'miniapps',
  'music_stations',
  'notebooks',
  'pdfs',
  'plc_layouts',
  'projects',
  'projects_folders',
  'question_bank_folders',
  'question_banks',
  'quiz_folders',
  'quizzes',
  'rosters',
  'rubrics',
  'saved_widgets',
  'starterPacks',
  'userProfile',
  'video_activities',
  'video_activity_folders',
] as const;

// Nested subcollections copied under a synced doc: Drawing widget canvases live at dashboards/{id}/drawings/{widgetId}/pages/{pageId}/objects/{objectId}.
export const NESTED_COLLECTIONS: Record<string, string[]> = {
  dashboards: ['drawings'],
  drawings: ['pages'],
  pages: ['objects'],
};

export interface RestValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude?: number; longitude?: number };
  arrayValue?: { values?: RestValue[] };
  mapValue?: { fields?: Record<string, RestValue> };
}

interface RestDocument {
  name: string;
  fields?: Record<string, RestValue>;
  createTime?: string;
}

interface ProdEntry {
  path: string;
  fields: Record<string, RestValue> | null;
}

function toTimestamp(iso: string): admin.firestore.Timestamp {
  const match = /\.(\d+)Z$/.exec(iso);
  const nanos = match ? Number(match[1].padEnd(9, '0').slice(0, 9)) : 0;
  const seconds = Math.floor(Date.parse(iso.replace(/\.\d+Z$/, 'Z')) / 1000);
  return new admin.firestore.Timestamp(seconds, nanos);
}

// Converts a Firestore REST value to an Admin SDK value, swapping the prod uid for the dev uid in every string.
export function fromRestValue(
  value: RestValue,
  swapUid: (s: string) => string
): unknown {
  if ('nullValue' in value) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined)
    return toTimestamp(value.timestampValue);
  if (value.stringValue !== undefined) return swapUid(value.stringValue);
  if (value.bytesValue !== undefined)
    return Buffer.from(value.bytesValue, 'base64');
  if (value.referenceValue !== undefined) {
    const path = value.referenceValue.split('/documents/')[1] ?? '';
    return admin.firestore().doc(swapUid(path));
  }
  if (value.geoPointValue !== undefined) {
    return new admin.firestore.GeoPoint(
      value.geoPointValue.latitude ?? 0,
      value.geoPointValue.longitude ?? 0
    );
  }
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values ?? []).map((v) =>
      fromRestValue(v, swapUid)
    );
  }
  if (value.mapValue !== undefined) {
    return fromRestFields(value.mapValue.fields ?? {}, swapUid);
  }
  return null;
}

export function fromRestFields(
  fields: Record<string, RestValue>,
  swapUid: (s: string) => string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(fields)) {
    out[swapUid(key)] = fromRestValue(v, swapUid);
  }
  return out;
}

async function prodToken(): Promise<string> {
  const sourceClient = await new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  }).getClient();
  const impersonated = new Impersonated({
    sourceClient,
    targetPrincipal: PROD_READER_SA,
    lifetime: 600,
    delegates: [],
    targetScopes: ['https://www.googleapis.com/auth/datastore'],
  });
  const { token } = await impersonated.getAccessToken();
  if (!token) throw new HttpsError('internal', 'Could not get a prod token.');
  return token;
}

async function prodFetch<T>(
  token: string,
  url: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new HttpsError(
      'internal',
      `Prod read failed (${res.status}): ${(await res.text()).slice(0, 200)}`
    );
  }
  return (await res.json()) as T;
}

async function findProdUid(token: string, email: string): Promise<string> {
  const rows = await prodFetch<{ document?: RestDocument }[]>(
    token,
    `${PROD_DOCS}:runQuery`,
    {
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'email' },
            op: 'EQUAL',
            value: { stringValue: email },
          },
        },
        limit: 1,
      },
    }
  );
  const name = rows.find((r) => r.document)?.document?.name;
  if (!name) {
    throw new HttpsError('not-found', `No prod account found for ${email}.`);
  }
  return name.split('/').pop() ?? '';
}

async function listProdDocs(
  token: string,
  path: string,
  showMissing = false
): Promise<RestDocument[]> {
  const docs: RestDocument[] = [];
  let pageToken = '';
  do {
    const page = await prodFetch<{
      documents?: RestDocument[];
      nextPageToken?: string;
    }>(
      token,
      `${PROD_DOCS}/${path}?pageSize=300${showMissing ? '&showMissing=true' : ''}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    );
    docs.push(...(page.documents ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return docs;
}

// GCLOUD_PROJECT isn't guaranteed on gen2 functions; FIREBASE_CONFIG.projectId is (same chain as aiGeneration.ts).
export function currentProjectId(): string | undefined {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  try {
    const cfg = JSON.parse(process.env.FIREBASE_CONFIG ?? '{}') as {
      projectId?: string;
    };
    return cfg.projectId;
  } catch {
    return undefined;
  }
}

// Lists a prod collection and its allowlisted nested subcollections; drawings/{widgetId} parents may be missing docs.
export async function readProdTree(
  token: string,
  path: string,
  name: string
): Promise<ProdEntry[]> {
  const docs = await listProdDocs(token, path, name === 'drawings');
  const entries: ProdEntry[] = [];
  for (const doc of docs) {
    const docPath = doc.name.split('/documents/')[1] ?? '';
    entries.push({
      path: docPath,
      fields: doc.createTime ? (doc.fields ?? {}) : null,
    });
    for (const child of NESTED_COLLECTIONS[name] ?? []) {
      entries.push(
        ...(await readProdTree(token, `${docPath}/${child}`, child))
      );
    }
  }
  return entries;
}

async function assertDevAdmin(request: CallableRequest): Promise<{
  email: string;
  devUid: string;
  db: admin.firestore.Firestore;
}> {
  if (currentProjectId() !== DEV_PROJECT_ID) {
    throw new HttpsError(
      'failed-precondition',
      'This only runs in the dev project.'
    );
  }
  const email = request.auth?.token.email?.toLowerCase();
  if (!request.auth || !email || !request.auth.token.email_verified) {
    throw new HttpsError('unauthenticated', 'Sign in with Google first.');
  }
  const db = admin.firestore();
  if (!(await db.doc(`admins/${email}`).get()).exists) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  return { email, devUid: request.auth.uid, db };
}

export const syncMyMaterialsFromProdV1 = onCall(
  { memory: '512MiB', timeoutSeconds: 300, maxInstances: 2 },
  async (request): Promise<{ copied: Record<string, number> }> => {
    assertViewAsAllowed(request);
    const { email, devUid, db } = await assertDevAdmin(request);
    const token = await prodToken();
    const prodUid = await findProdUid(token, email);
    const swapUid = (s: string) => s.split(prodUid).join(devUid);

    // Read everything from prod first so a failed read never leaves a dev collection emptied.
    const prodByCollection = new Map<string, ProdEntry[]>();
    for (const name of SYNCED_USER_COLLECTIONS) {
      prodByCollection.set(
        name,
        await readProdTree(token, `users/${prodUid}/${name}`, name)
      );
    }

    const copied: Record<string, number> = {};
    for (const [name, entries] of prodByCollection) {
      const devCol = db.collection(`users/${devUid}/${name}`);
      const topPrefix = `users/${devUid}/${name}/`;
      const devEntries = entries.map((e) => ({ ...e, path: swapUid(e.path) }));
      const keep = new Set(
        devEntries
          .filter((e) => e.path.startsWith(topPrefix))
          .map((e) => e.path.slice(topPrefix.length))
          .filter((rest) => !rest.includes('/'))
      );
      // Clear stale dev docs and every nested subtree under the synced ones before rewriting.
      for (const ref of await devCol.listDocuments()) {
        if (!keep.has(ref.id)) {
          await db.recursiveDelete(ref);
        } else {
          for (const child of NESTED_COLLECTIONS[name] ?? []) {
            await db.recursiveDelete(ref.collection(child));
          }
        }
      }
      const writer = db.bulkWriter();
      try {
        for (const e of devEntries) {
          if (e.fields)
            void writer.set(db.doc(e.path), fromRestFields(e.fields, swapUid));
        }
      } finally {
        await writer.close();
      }
      copied[name] = keep.size;
    }
    return { copied };
  }
);

// Shared admin config mirrored whole (top-level docs only, so student-writable subcollections like announcements/*/pollVotes never come over).
export const CONFIG_COLLECTIONS = [
  'admins',
  'admin_settings',
  'feature_permissions',
  'global_permissions',
  'admin_backgrounds',
  'global_mini_apps',
  'global_music_stations',
  'global_pdfs',
  'global_weather',
  'global_video_activities',
  'instructional_routines',
  'help_center',
  'help_resources',
  'dashboard_templates',
  'announcements',
  'standards_catalog',
  'building_guided_learning',
  'building_guided_learning_index',
  'building_guided_learning_tours',
  'building_web_tours',
  'custom_widgets',
  'gradebook_district_configs',
  'grading_period_sets',
  'lunch_menus',
] as const;

// Organization subcollections mirrored whole; `members` copies admins only and never prunes.
export const ORG_SUBCOLLECTIONS = [
  'buildings',
  'domains',
  'roles',
  'studentPageConfig',
  'testClasses',
] as const;

// Never removed from dev even when prod lacks them, so a dev-only admin can't be locked out.
const NO_PRUNE = new Set(['admins']);

// Kill switches forced off in dev regardless of prod's value.
export const DEV_OVERRIDES: Record<string, Record<string, unknown>> = {
  'admin_settings/classlink_sync': { enabled: false },
};

const keepString = (s: string) => s;
const relPath = (doc: RestDocument) => doc.name.split('/documents/')[1] ?? '';
const docId = (doc: RestDocument) => doc.name.split('/').pop() ?? '';

export function isAdminMember(
  doc: RestDocument,
  adminEmails: Set<string>
): boolean {
  const email = (doc.fields?.email?.stringValue ?? docId(doc)).toLowerCase();
  return (
    adminEmails.has(email) && doc.fields?.roleId?.stringValue !== 'student'
  );
}

interface ConfigPlan {
  path: string;
  docs: RestDocument[];
  prune: boolean;
}

export async function readProdConfig(token: string): Promise<{
  orgs: RestDocument[];
  plan: ConfigPlan[];
}> {
  const plan: ConfigPlan[] = [];
  for (const name of CONFIG_COLLECTIONS) {
    plan.push({
      path: name,
      docs: await listProdDocs(token, name),
      prune: !NO_PRUNE.has(name),
    });
  }
  const adminEmails = new Set(
    (plan.find((p) => p.path === 'admins')?.docs ?? []).map((d) =>
      docId(d).toLowerCase()
    )
  );
  const orgs = await listProdDocs(token, 'organizations');
  for (const org of orgs) {
    const orgPath = relPath(org);
    for (const sub of ORG_SUBCOLLECTIONS) {
      plan.push({
        path: `${orgPath}/${sub}`,
        docs: await listProdDocs(token, `${orgPath}/${sub}`),
        prune: true,
      });
    }
    plan.push({
      path: `${orgPath}/members`,
      docs: (await listProdDocs(token, `${orgPath}/members`)).filter((m) =>
        isAdminMember(m, adminEmails)
      ),
      prune: false,
    });
  }
  return { orgs, plan };
}

export const syncConfigFromProdV1 = onCall(
  { memory: '1GiB', timeoutSeconds: 540, maxInstances: 1 },
  async (request): Promise<{ copied: Record<string, number> }> => {
    assertViewAsAllowed(request);
    const { db } = await assertDevAdmin(request);
    const token = await prodToken();

    // Read everything from prod first so a failed read never leaves dev config half-pruned.
    const { orgs, plan } = await readProdConfig(token);

    const copied: Record<string, number> = {};
    const writer = db.bulkWriter();
    try {
      for (const org of orgs) {
        void writer.set(
          db.doc(relPath(org)),
          fromRestFields(org.fields ?? {}, keepString)
        );
      }
      for (const { path, docs, prune } of plan) {
        if (prune) {
          const keep = new Set(docs.map(docId));
          for (const ref of await db.collection(path).listDocuments()) {
            if (!keep.has(ref.id)) void writer.delete(ref);
          }
        }
        for (const d of docs) {
          if (!d.createTime) continue;
          void writer.set(
            db.doc(relPath(d)),
            fromRestFields(d.fields ?? {}, keepString)
          );
        }
        copied[path] = docs.length;
      }
    } finally {
      await writer.close();
    }
    for (const [path, data] of Object.entries(DEV_OVERRIDES)) {
      await db.doc(path).set(data, { merge: true });
    }
    return { copied };
  }
);
