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
import { authorPassesFlag } from './tourAuthors';

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
const MAX_NAME_CHARS = 100;
const MAX_TERMS = 20;
const MAX_TAG_CHARS = 32;
const MAX_KEYWORD_CHARS = 64;
/** Stops a runaway listing; 500 categories or folders is far past any real site. */
const MAX_LIST_PAGES = 5;
const FOLDER_LISTS_AT_ONCE = 5;
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

/** FreshService folder visibility: 1 everyone, 2 signed-in users, 3 agents only. */
export type FreshserviceVisibility = 1 | 2 | 3;

/** Where one tour's article goes and how it is labelled. */
export interface ArticleOptions {
  folderId: string;
  tags: string[];
  keywords: string[];
}

/** What is saved per tour; tags and keywords are absent until someone picks them in SpartBoard. */
export interface ArticleRecord {
  articleId: number | null;
  folderId?: string;
  tags?: string[];
  keywords?: string[];
  /** FreshService's own status as of the last send: 1 draft, 2 published. */
  status?: 1 | 2;
  /** Where an agent opens the article. */
  url?: string;
}

export interface FreshserviceFolder {
  id: string;
  name: string;
  visibility: number;
}

export interface FreshserviceCategory {
  id: string;
  name: string;
  folders: FreshserviceFolder[];
}

/** The site's categories and folders, plus this tour's saved choices. */
export interface FreshserviceCatalog {
  ready: boolean;
  categories: FreshserviceCategory[];
  defaultFolderId: string;
  saved: ArticleOptions | null;
}

export type FreshserviceRequest =
  | { action: 'status' }
  | { action: 'save'; domain: string; folderId: string }
  | { action: 'catalog'; setId: string }
  | { action: 'createCategory'; name: string }
  | {
      action: 'createFolder';
      categoryId: string;
      name: string;
      visibility: FreshserviceVisibility;
    }
  | { action: 'send'; setId: string; html: string; options?: ArticleOptions };

const bad = (msg: string) => new HttpsError('invalid-argument', msg);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Tags or keywords: trimmed, de-duplicated without regard to case, and capped. */
function parseTerms(v: unknown, what: string, maxChars: number): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw bad(`The ${what} are not valid.`);
  const tooMany = () => bad(`Use ${MAX_TERMS} ${what} or fewer.`);
  // Checked before the loop, so an oversized list costs nothing to turn down.
  if (v.length > MAX_TERMS * 5) throw tooMany();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    const term = str(raw).replace(/\s+/g, ' ');
    if (!term) continue;
    if (term.length > maxChars)
      throw bad(`Keep each of the ${what} to ${maxChars} characters.`);
    if (seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    out.push(term);
    if (out.length > MAX_TERMS) throw tooMany();
  }
  return out;
}

function parseName(v: unknown): string {
  const name = str(v).replace(/\s+/g, ' ');
  if (!name) throw bad('Enter a name.');
  if (name.length > MAX_NAME_CHARS)
    throw bad(`Keep the name to ${MAX_NAME_CHARS} characters.`);
  return name;
}

function parseOptions(v: unknown): ArticleOptions | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object') throw bad('The article settings are not valid.');
  const o = v as Record<string, unknown>;
  const folderId = str(o.folderId);
  if (!FOLDER_RE.test(folderId)) throw bad('Choose a folder.');
  return {
    folderId,
    tags: parseTerms(o.tags, 'tags', MAX_TAG_CHARS),
    keywords: parseTerms(o.keywords, 'keywords', MAX_KEYWORD_CHARS),
  };
}

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
  if (d.action === 'catalog') {
    const setId = str(d.setId);
    if (!SET_ID_RE.test(setId)) throw bad('That tour id is not valid.');
    return { action: 'catalog', setId };
  }
  if (d.action === 'createCategory')
    return { action: 'createCategory', name: parseName(d.name) };
  if (d.action === 'createFolder') {
    const categoryId = str(d.categoryId);
    if (!FOLDER_RE.test(categoryId)) throw bad('Choose a category.');
    if (d.visibility !== 1 && d.visibility !== 2 && d.visibility !== 3)
      throw bad('Choose who can see the folder.');
    return {
      action: 'createFolder',
      categoryId,
      name: parseName(d.name),
      visibility: d.visibility,
    };
  }
  if (d.action === 'send') {
    const setId = str(d.setId);
    if (!SET_ID_RE.test(setId)) throw bad('That tour id is not valid.');
    if (typeof d.html !== 'string' || !d.html.trim())
      throw bad('The article is empty.');
    if (d.html.length > MAX_ARTICLE_CHARS)
      throw bad('The article is too large to send.');
    const options = parseOptions(d.options);
    return {
      action: 'send',
      setId,
      html: d.html,
      ...(options ? { options } : {}),
    };
  }
  throw bad('Unknown action.');
}

export interface FreshserviceDeps {
  isAdmin: (token: Token) => Promise<boolean>;
  allowed: (token: Token, uid: string) => Promise<boolean>;
  /** A listed tour author for whom the flag is on. */
  isAuthor: (token: Token) => Promise<boolean>;
  loadSite: () => Promise<FreshserviceSite | null>;
  saveSite: (site: FreshserviceSite, by: string) => Promise<void>;
  /** The key from Secret Manager; null when the secret or its access grant isn't set up. */
  loadApiKey: () => Promise<string | null>;
  /** The published copy's title when it is a published web tour; null otherwise. */
  publishedTitle: (setId: string) => Promise<string | null>;
  article: (setId: string) => Promise<ArticleRecord | null>;
  saveArticle: (
    setId: string,
    record: ArticleRecord & { articleId: number },
    by: string
  ) => Promise<void>;
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
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; json: unknown }> {
  const res = await deps.fetch(`https://${config.domain}/api/v2${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.apiKey}:X`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
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

/** The article's FreshService status in a send's answer; anything but published reads as a draft. */
const articleStatusOf = (json: unknown): 1 | 2 =>
  (json as { article?: { status?: unknown } } | null)?.article?.status === 2
    ? 2
    : 1;

const idOf = (v: unknown): string | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? String(v) : null;

/** Throws the caller-facing error for a FreshService answer that isn't a success. */
function assertOk(
  result: { status: number; json?: unknown },
  what: string,
  detail: Record<string, unknown> = {}
): void {
  if (result.status === 401 || result.status === 403) {
    const body = result.json as { code?: unknown; message?: unknown } | null;
    console.error(`[freshserviceV1] ${what} refused`, {
      status: result.status,
      code: typeof body?.code === 'string' ? body.code.slice(0, 100) : null,
      message:
        typeof body?.message === 'string' ? body.message.slice(0, 300) : null,
      ...detail,
    });
    throw new HttpsError(
      'permission-denied',
      'FreshService turned down the API key.'
    );
  }
  if (result.status >= 200 && result.status < 300) return;
  console.error(`[freshserviceV1] ${what} failed`, {
    status: result.status,
    ...detail,
  });
  throw new HttpsError(
    'unavailable',
    `FreshService answered ${result.status}.`
  );
}

/** Every row of a FreshService list, a page at a time. */
async function listAll(
  deps: FreshserviceDeps,
  config: FreshserviceConfig,
  path: string,
  key: 'categories' | 'folders'
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const result = await callApi(
      deps,
      config,
      'GET',
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`
    );
    assertOk(result, 'list', { path });
    const got = (result.json as Record<string, unknown> | null)?.[key];
    const batch = Array.isArray(got)
      ? got.filter(
          (r): r is Record<string, unknown> => !!r && typeof r === 'object'
        )
      : [];
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

const savedOptions = (record: ArticleRecord | null): ArticleOptions | null =>
  record?.folderId && FOLDER_RE.test(record.folderId)
    ? {
        folderId: record.folderId,
        tags: record.tags ?? [],
        keywords: record.keywords ?? [],
      }
    : null;

/** The site's categories with their folders, and what this tour last used. */
export async function loadCatalog(
  setId: string,
  deps: FreshserviceDeps
): Promise<FreshserviceCatalog> {
  const config = await loadConfig(deps);
  if (!config)
    return { ready: false, categories: [], defaultFolderId: '', saved: null };
  const cats = await listAll(
    deps,
    config,
    '/solutions/categories',
    'categories'
  );
  const named = cats.flatMap((cat) => {
    const id = idOf(cat.id);
    return id ? [{ id, name: str(cat.name) }] : [];
  });
  const categories: FreshserviceCategory[] = [];
  // A few at a time: quick for a normal site, and never a burst at FreshService's rate limit.
  for (let at = 0; at < named.length; at += FOLDER_LISTS_AT_ONCE) {
    const batch = await Promise.all(
      named.slice(at, at + FOLDER_LISTS_AT_ONCE).map(async ({ id, name }) => {
        const folders = await listAll(
          deps,
          config,
          `/solutions/folders?category_id=${id}`,
          'folders'
        );
        return {
          id,
          name,
          folders: folders.flatMap((f) => {
            const folderId = idOf(f.id);
            if (!folderId) return [];
            return [
              {
                id: folderId,
                name: str(f.name),
                visibility: typeof f.visibility === 'number' ? f.visibility : 0,
              },
            ];
          }),
        };
      })
    );
    categories.push(...batch);
  }
  return {
    ready: true,
    categories,
    defaultFolderId: config.folderId,
    saved: savedOptions(await deps.article(setId)),
  };
}

/** Makes a category or a folder and returns its id; null while FreshService isn't set up. */
export async function createPlace(
  req: Extract<
    FreshserviceRequest,
    { action: 'createCategory' | 'createFolder' }
  >,
  deps: FreshserviceDeps
): Promise<{ id: string | null }> {
  const config = await loadConfig(deps);
  if (!config) return { id: null };
  const result =
    req.action === 'createFolder'
      ? await callApi(deps, config, 'POST', '/solutions/folders', {
          name: req.name,
          category_id: Number(req.categoryId),
          visibility: req.visibility,
        })
      : await callApi(deps, config, 'POST', '/solutions/categories', {
          name: req.name,
        });
  if (result.status === 400 || result.status === 409)
    throw new HttpsError(
      'invalid-argument',
      'FreshService turned that name down. It may already be in use.'
    );
  assertOk(result, req.action);
  const made = (result.json as Record<string, { id?: unknown }> | null)?.[
    req.action === 'createFolder' ? 'folder' : 'category'
  ];
  const id = idOf(made?.id);
  if (!id) throw new HttpsError('unavailable', 'FreshService sent no id back.');
  return { id };
}

/** Creates the tour's article as a draft the first time, then updates it in place; a deleted article is made again. */
export async function sendArticle(
  setId: string,
  html: string,
  by: string,
  deps: FreshserviceDeps,
  options?: ArticleOptions
): Promise<{ sent: true; articleId: number } | { sent: false }> {
  const config = await loadConfig(deps);
  if (!config) return { sent: false };
  const title = await deps.publishedTitle(setId);
  if (title === null)
    throw new HttpsError(
      'failed-precondition',
      'Publish the tour before sending it.'
    );
  const record = await deps.article(setId);
  const existing = record?.articleId ?? null;
  const chosen = options ?? savedOptions(record);
  const folderId = chosen?.folderId ?? config.folderId;
  // Tags and keywords go only once chosen here, so ones added by hand in FreshService aren't wiped.
  const tags = options?.tags ?? record?.tags;
  const keywords = options?.keywords ?? record?.keywords;
  const fields = {
    title: title.slice(0, 250) || 'Web tour',
    description: html,
    folder_id: Number(folderId),
    ...(tags ? { tags } : {}),
    ...(keywords ? { keywords } : {}),
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
    article_type: 1,
    status: 1,
  });
  assertOk(result, 'send', { setId });
  const id = articleIdOf(result.json);
  if (!id) {
    console.error('[freshserviceV1] send returned no article', { setId });
    throw new HttpsError('unavailable', 'FreshService sent no article back.');
  }
  // Saved on every send, so the Web tours list knows when the article last matched the tour.
  await deps.saveArticle(
    setId,
    {
      articleId: id,
      ...(chosen ? { folderId } : {}),
      ...(tags ? { tags } : {}),
      ...(keywords ? { keywords } : {}),
      status: articleStatusOf(result.json),
      url: `https://${config.domain}/a/solutions/articles/${id}`,
    },
    by
  );
  return { sent: true, articleId: id };
}

/** Admin and flag checks, then the action. */
export async function runFreshservice(
  req: FreshserviceRequest,
  uid: string,
  token: Token,
  deps: FreshserviceDeps
): Promise<
  | FreshserviceStatus
  | FreshserviceCatalog
  | { id: string | null }
  | { sent: boolean; articleId?: number }
> {
  const isAdmin = await deps.isAdmin(token);
  // A tour author sends and files articles; the saved site and folder stay with admins (WEB_TOUR_AUTHORS.md B5).
  const ok = isAdmin
    ? await deps.allowed(token, uid)
    : await deps.isAuthor(token);
  if (!ok)
    throw new HttpsError(
      'permission-denied',
      'FreshService sync is not turned on for this account.'
    );
  if (req.action === 'save' && !isAdmin)
    throw new HttpsError(
      'permission-denied',
      'Only an admin can change the FreshService settings.'
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
    if (req.action === 'catalog') return await loadCatalog(req.setId, deps);
    if (req.action === 'createCategory' || req.action === 'createFolder')
      return await createPlace(req, deps);
    return await sendArticle(req.setId, req.html, by, deps, req.options);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('[freshserviceV1] failed:', safeErr(error));
    throw new HttpsError('unavailable', "FreshService couldn't be reached.");
  }
}

const KEY_CACHE_MS = 5 * 60_000;
/** A missing secret is checked again soon, so setting it up shows at once. */
const MISSING_CACHE_MS = 15_000;
let keyCache: { key: string | null; at: number } | null = null;
let auth: GoogleAuth | null = null;

/** The latest secret version, cached for five minutes; 403 or 404 means not set up yet. */
async function loadApiKeyFromSecretManager(
  now: number
): Promise<string | null> {
  if (
    keyCache &&
    now - keyCache.at < (keyCache.key ? KEY_CACHE_MS : MISSING_CACHE_MS)
  )
    return keyCache.key;
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
    isAuthor: async (token) =>
      token.email_verified === true &&
      authorPassesFlag(db, FRESHSERVICE_FEATURE_ID, token.email),
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
    article: async (setId) => {
      const d = (
        await db.collection(FRESHSERVICE_ARTICLES).doc(setId).get()
      ).data();
      if (!d) return null;
      const terms = (v: unknown) =>
        Array.isArray(v)
          ? v.filter((t): t is string => typeof t === 'string')
          : undefined;
      const tags = terms(d.tags);
      const keywords = terms(d.keywords);
      return {
        articleId: typeof d.articleId === 'number' ? d.articleId : null,
        ...(str(d.folderId) ? { folderId: str(d.folderId) } : {}),
        ...(tags ? { tags } : {}),
        ...(keywords ? { keywords } : {}),
      };
    },
    saveArticle: async (setId, record, by) => {
      await db
        .collection(FRESHSERVICE_ARTICLES)
        .doc(setId)
        .set({ ...record, sentBy: by, sentAt: Date.now() });
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
