// Dev-only: replaces the caller's own materials in spartboard-dev with a fresh copy from prod. Read-only on prod.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import './functionsInit';

export const DEV_PROJECT_ID = 'spartboard-dev';
const PROD_PROJECT_ID = 'spartboard';
const PROD_READER_SA = 'prod-reader@spartboard-dev.iam.gserviceaccount.com';
const PROD_DOCS = `https://firestore.googleapis.com/v1/projects/${PROD_PROJECT_ID}/databases/(default)/documents`;

// Teacher-authored content only. Rosters (student names), OAuth tokens, assignments and PLC state stay out.
export const SYNCED_USER_COLLECTIONS = [
  'activity_wall_activities',
  'collections',
  'dashboards',
  'flashcard_folders',
  'flashcard_sets',
  'guided_learning',
  'guided_learning_folders',
  'miniapp_folders',
  'miniapps',
  'notebooks',
  'pdfs',
  'projects',
  'projects_folders',
  'question_bank_folders',
  'question_banks',
  'quiz_folders',
  'quizzes',
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

export const syncMyMaterialsFromProdV1 = onCall(
  { memory: '512MiB', timeoutSeconds: 300, maxInstances: 2 },
  async (request): Promise<{ copied: Record<string, number> }> => {
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

    const devUid = request.auth.uid;
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
