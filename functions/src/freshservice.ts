// FreshService help articles from web tours: admins save the site and folder, the API key lives in Secret Manager.
import './functionsInit';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GoogleAuth } from 'google-auth-library';
import * as admin from './firebaseAdmin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { resolveCallerIsAdmin } from './aiGeneration';
import { assertViewAsAllowed } from './viewAsGuard';
import { GL_TOURS_COLLECTION } from './glTours';
import { safeErr } from './safeLog';

type Firestore = admin.firestore.Firestore;
type Token = { email?: string; [k: string]: unknown };

export const FRESHSERVICE_FEATURE_ID = 'freshservice-sync';
/** Server-only docs (no rules match them): the site and folder, and each tour's article id. */
export const FRESHSERVICE_CONFIG_DOC = 'freshservice/config';
export const FRESHSERVICE_ARTICLES = 'freshservice_articles';
/** Read when a call runs, not bound with defineSecret, so a project without it still deploys and the feature stays off. */
export const FRESHSERVICE_SECRET = 'FRESHSERVICE_API_KEY';
/** Callables take up to 10 MB; leave room for the rest of the request. */
export const MAX_ARTICLE_CHARS = 9_000_000;

export const DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.freshservice\.com$/;
const FOLDER_RE = /^[1-9]\d{0,17}$/;
const SET_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface FreshserviceSite {
  domain: string;
  folderId: string;
}

export interface FreshserviceConfig extends FreshserviceSite {
  apiKey: string;
}

/** What the page sees: never the key itself. */
export interface FreshserviceStatus {
  domain: string;
  folderId: string;
  hasKey: boolean;
}

export type FreshserviceRequest =
  | { action: 'status' }
  | { action: 'save'; domain: string; folderId: string }
  | { action: 'send'; setId: string; html: string };

const bad = (msg: string) => new HttpsError('invalid-argument', msg);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** The request, checked; throws invalid-argument on anything else. */
export function parseFreshserviceRequest(data: unknown): FreshserviceRequest {
  const d = (data && typeof data === 'object' ? data : {}) as Record<
    string,
    unknown
  >;
  if (d.action === 'status') return { action: 'status' };
  if (d.action === 'save') {
    const domain = str(d.domain)
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    const folderId = str(d.folderId);
    if (!DOMAIN_RE.test(domain)) throw bad('Enter a freshservice.com address.');
    if (!FOLDER_RE.test(folderId)) throw bad('Enter the folder number.');
    return { action: 'save', domain, folderId };
  }
  if (d.action === 'send') {
    const setId = str(d.setId);
    if (!SET_ID_RE.test(setId)) throw bad('That tour id is not valid.');
    if (typeof d.html !== 'string' || !d.html.trim())
      throw bad('The article is empty.');
    if (d.html.length > MAX_ARTICLE_CHARS)
      throw bad('The article is too large to send.');
    return { action: 'send', setId, html: d.html };
  }
  throw bad('Unknown action.');
}

export interface FreshserviceDeps {
  isAdmin: (token: Token) => Promise<boolean>;
  allowed: (token: Token, uid: string) => Promise<boolean>;
  loadSite: () => Promise<FreshserviceSite | null>;
  saveSite: (site: FreshserviceSite, by: string) => Promise<void>;
  /** The key from Secret Manager; null when the secret or its access grant isn't set up. */
  loadApiKey: () => Promise<string | null>;
  /** The published copy's title when it is a published web tour; null otherwise. */
  publishedTitle: (setId: string) => Promise<string | null>;
  articleId: (setId: string) => Promise<number | null>;
  saveArticleId: (setId: string, id: number, by: string) => Promise<void>;
  fetch: typeof fetch;
}

const statusOf = (
  site: FreshserviceSite | null,
  key: string | null
): FreshserviceStatus => ({
  domain: site?.domain ?? '',
  folderId: site?.folderId ?? '',
  hasKey: !!key,
});

/** The site, folder and key together, or null while any is missing. */
async function loadConfig(
  deps: FreshserviceDeps
): Promise<FreshserviceConfig | null> {
  const site = await deps.loadSite();
  if (!site || !DOMAIN_RE.test(site.domain) || !FOLDER_RE.test(site.folderId))
    return null;
  const apiKey = await deps.loadApiKey();
  return apiKey ? { ...site, apiKey } : null;
}

/** One call to the FreshService v2 API with basic auth; returns the status and parsed body. */
async function callApi(
  deps: FreshserviceDeps,
  config: FreshserviceConfig,
  method: 'POST' | 'PUT',
  path: string,
  body: Record<string, unknown>
): Promise<{ status: number; json: unknown }> {
  const res = await deps.fetch(`https://${config.domain}/api/v2${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.apiKey}:X`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json };
}

const articleIdOf = (json: unknown): number | null => {
  const id = (json as { article?: { id?: unknown } } | null)?.article?.id;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
    ? id
    : null;
};

/** Creates the tour's article as a draft the first time, then updates it in place; a deleted article is made again. */
export async function sendArticle(
  setId: string,
  html: string,
  by: string,
  deps: FreshserviceDeps
): Promise<{ sent: true; articleId: number } | { sent: false }> {
  const config = await loadConfig(deps);
  if (!config) return { sent: false };
  const title = await deps.publishedTitle(setId);
  if (title === null)
    throw new HttpsError(
      'failed-precondition',
      'Publish the tour before sending it.'
    );
  const existing = await deps.articleId(setId);
  const fields = {
    title: title.slice(0, 250) || 'Web tour',
    description: html,
  };
  let result: { status: number; json: unknown } | null = null;
  if (existing) {
    result = await callApi(
      deps,
      config,
      'PUT',
      `/solutions/articles/${existing}`,
      fields
    );
    if (result.status === 404) result = null;
  }
  result ??= await callApi(deps, config, 'POST', '/solutions/articles', {
    ...fields,
    folder_id: Number(config.folderId),
    article_type: 1,
    status: 1,
  });
  const id = articleIdOf(result.json);
  if (result.status === 401 || result.status === 403)
    throw new HttpsError(
      'permission-denied',
      'FreshService turned down the API key.'
    );
  if (result.status < 200 || result.status >= 300 || !id) {
    console.error('[freshserviceV1] send failed', {
      status: result.status,
      setId,
    });
    throw new HttpsError(
      'unavailable',
      `FreshService answered ${result.status}.`
    );
  }
  if (id !== existing) await deps.saveArticleId(setId, id, by);
  return { sent: true, articleId: id };
}

/** Admin and flag checks, then the action. */
export async function runFreshservice(
  req: FreshserviceRequest,
  uid: string,
  token: Token,
  deps: FreshserviceDeps
): Promise<FreshserviceStatus | { sent: boolean; articleId?: number }> {
  if (!(await deps.isAdmin(token)) || !(await deps.allowed(token, uid)))
    throw new HttpsError(
      'permission-denied',
      'FreshService sync is not turned on for this account.'
    );
  const by = token.email ?? uid;
  if (req.action === 'status')
    return statusOf(await deps.loadSite(), await deps.loadApiKey());
  if (req.action === 'save') {
    const site = { domain: req.domain, folderId: req.folderId };
    await deps.saveSite(site, by);
    return statusOf(site, await deps.loadApiKey());
  }
  try {
    return await sendArticle(req.setId, req.html, by, deps);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('[freshserviceV1] failed:', safeErr(error));
    throw new HttpsError('unavailable', "FreshService couldn't be reached.");
  }
}

const KEY_CACHE_MS = 5 * 60_000;
let keyCache: { key: string | null; at: number } | null = null;
let auth: GoogleAuth | null = null;

/** The latest secret version, cached for five minutes; 403 or 404 means not set up yet. */
async function loadApiKeyFromSecretManager(
  now: number
): Promise<string | null> {
  if (keyCache && now - keyCache.at < KEY_CACHE_MS) return keyCache.key;
  const project = process.env.GCLOUD_PROJECT;
  if (!project) return null;
  auth ??= new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  let key: string | null = null;
  try {
    const client = await auth.getClient();
    const res = await client.request<{ payload?: { data?: string } }>({
      url: `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${FRESHSERVICE_SECRET}/versions/latest:access`,
      timeout: 10_000,
    });
    const data = res.data.payload?.data;
    key = data
      ? Buffer.from(data, 'base64').toString('utf8').trim() || null
      : null;
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status !== 403 && status !== 404) {
      console.error('[freshserviceV1] secret read failed', status ?? '');
      return keyCache?.key ?? null;
    }
  }
  keyCache = { key, at: now };
  return key;
}

function defaultDeps(db: Firestore): FreshserviceDeps {
  return {
    isAdmin: (token) => resolveCallerIsAdmin(db, token),
    allowed: async (token, uid) => {
      const { isGlobalFeatureGranted } = await import('./featureGrant');
      return isGlobalFeatureGranted(
        db,
        FRESHSERVICE_FEATURE_ID,
        token.email ?? null,
        uid
      );
    },
    loadSite: async () => {
      const d = (await db.doc(FRESHSERVICE_CONFIG_DOC).get()).data();
      return d ? { domain: str(d.domain), folderId: str(d.folderId) } : null;
    },
    saveSite: async (site, by) => {
      await db
        .doc(FRESHSERVICE_CONFIG_DOC)
        .set({ ...site, updatedBy: by, updatedAt: Date.now() });
    },
    loadApiKey: () => loadApiKeyFromSecretManager(Date.now()),
    publishedTitle: async (setId) => {
      const snap = await db.collection(GL_TOURS_COLLECTION).doc(setId).get();
      if (!snap.exists || snap.get('surface') !== 'web') return null;
      return str(snap.get('set.title'));
    },
    articleId: async (setId) => {
      const id: unknown = (
        await db.collection(FRESHSERVICE_ARTICLES).doc(setId).get()
      ).get('articleId');
      return typeof id === 'number' ? id : null;
    },
    saveArticleId: async (setId, articleId, by) => {
      await db
        .collection(FRESHSERVICE_ARTICLES)
        .doc(setId)
        .set({ articleId, sentBy: by, sentAt: Date.now() });
    },
    fetch: (...args) => fetch(...args),
  };
}

export const freshserviceV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    await assertViewAsAllowed(request, { outward: true });
    if (!request.auth?.uid)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    return runFreshservice(
      parseFreshserviceRequest(request.data),
      request.auth.uid,
      request.auth.token,
      defaultDeps(admin.firestore())
    );
  }
);
