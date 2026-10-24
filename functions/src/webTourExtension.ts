// The extension's own tour calls (docs/plans/shipped/WEB_TOURS_HELP_PANEL.md H7): a Google access token, never Firebase auth.
import './functionsInit';
import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { GL_TOURS_COLLECTION } from './glTours';
import { WEB_TOURS_FEATURE_ID, isWebTourPicturePath } from './mcp/webTourTools';
import { isWebTourSnapshot } from './mcp/webTours';

type Firestore = admin.firestore.Firestore;

export const DISTRICT_DOMAIN = 'orono.k12.mn.us';

// Each listing's "Chrome extension" OAuth client (H8). Keep equal to extension/src/listings.ts.
export const EXTENSION_OAUTH_CLIENTS: Record<string, string> = {
  spartboard:
    '759666600376-3588aon892pctctjtosfpurqksup9hk5.apps.googleusercontent.com',
  'spartboard-dev':
    '258543092004-9mfh4nls8a7edmift5dkh9l93jp7pdk1.apps.googleusercontent.com',
};

// Same caps as the extension's start message (components/tours/web/extensionProtocol.ts).
export const MAX_PICTURE_CHARS = Math.ceil((5 * 1024 * 1024) / 3) * 4;
export const MAX_PICTURE_TOTAL_CHARS = 8 * 1024 * 1024;
const MAX_STEPS = 200;
const MAX_RUN_LIST = 50;
const MAX_RUN_STEP = 500;
const MAX_RUN_ID = 200;
const MAX_FIX_CHARS = 4000;
const PICTURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SET_ID = /^[A-Za-z0-9_-]{1,128}$/;

export class ExtensionCallError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const fail = (status: number, message: string) =>
  new ExtensionCallError(status, message);

/** What Google's tokeninfo says about an access token. */
export interface TokenInfo {
  aud?: unknown;
  azp?: unknown;
  email?: unknown;
  email_verified?: unknown;
  expires_in?: unknown;
}

/** The signed-in staff member a token belongs to; its email is Google's, never the extension's. */
export interface ExtensionCaller {
  email: string;
  uid: string | null;
}

export interface ExtensionDeps {
  clientId: string;
  tokenInfo: (token: string) => Promise<TokenInfo | null>;
  uidForEmail: (email: string) => Promise<string | null>;
  allowed: (email: string, uid: string | null) => Promise<boolean>;
  isAdmin: (email: string) => Promise<boolean>;
}

export function bearerToken(header: unknown): string {
  const value = typeof header === 'string' ? header : '';
  const token = value.startsWith('Bearer ') ? value.slice(7).trim() : '';
  if (!token) throw fail(401, 'Sign in to Chrome with your Orono account.');
  return token;
}

/** Checks the token's client, its verified district email and the web-tours flag. */
export async function verifyCaller(
  token: string,
  deps: ExtensionDeps
): Promise<ExtensionCaller> {
  if (!deps.clientId) throw fail(503, 'Web tours are not set up yet.');
  const info = await deps.tokenInfo(token).catch(() => null);
  const email = typeof info?.email === 'string' ? info.email.toLowerCase() : '';
  if (
    !info ||
    info.aud !== deps.clientId ||
    (info.azp !== undefined && info.azp !== deps.clientId) ||
    !(Number(info.expires_in) > 0)
  )
    throw fail(401, 'Sign in to Chrome with your Orono account.');
  if (
    String(info.email_verified) !== 'true' ||
    !email.endsWith(`@${DISTRICT_DOMAIN}`)
  )
    throw fail(403, 'Sign in to Chrome with your Orono account.');
  const uid = await deps.uidForEmail(email);
  if (!(await deps.allowed(email, uid)))
    throw fail(403, "Web tours aren't available for your account yet.");
  return { email, uid };
}

interface StoredStep {
  id?: unknown;
  label?: unknown;
  text?: unknown;
  web?: {
    urlPattern?: unknown;
    action?: unknown;
    locator?: unknown;
    picture?: { path?: unknown; w?: unknown; h?: unknown };
  };
}

interface StoredSnapshot {
  publishedAt?: unknown;
  set?: { title?: unknown; surface?: unknown; steps?: unknown };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const webSteps = (snap: StoredSnapshot): StoredStep[] =>
  (Array.isArray(snap.set?.steps) ? (snap.set.steps as StoredStep[]) : [])
    .filter((s) => !!s && typeof s.web === 'object' && !!s.web)
    .slice(0, MAX_STEPS);

/** The host a tour starts on, from its first step's address; null when it can't be opened. */
export function startHostOf(snap: StoredSnapshot): string | null {
  const pattern = str(webSteps(snap)[0]?.web?.urlPattern);
  const host = /^https:\/\/([^/?#]*)/.exec(pattern)?.[1];
  return host && !host.includes('*') && !host.includes('@')
    ? host.toLowerCase()
    : null;
}

export interface ListedTour {
  id: string;
  title: string;
  host: string;
  steps: number;
  version: number;
}

/** Every published web tour that can start somewhere, for the badge and the Tours tab. */
export function listTours(
  docs: readonly { id: string; data: StoredSnapshot }[]
): ListedTour[] {
  return docs.flatMap(({ id, data }) => {
    const host = startHostOf(data);
    const version = data.publishedAt;
    if (!isWebTourSnapshot(data) || !host || !Number.isInteger(version))
      return [];
    return [
      {
        id,
        title: str(data.set?.title).slice(0, 500),
        host,
        steps: webSteps(data).length,
        version: version as number,
      },
    ];
  });
}

export interface LoadedTourPicture {
  mime: string;
  data: string;
  w: number;
  h: number;
}

export interface LoadedTour {
  setId: string;
  version: number;
  title: string;
  steps: {
    id: string;
    label: string;
    text: string;
    web: { urlPattern: string; action: unknown; locator: unknown };
  }[];
  pictures: Record<string, LoadedTourPicture>;
}

/** The published tour as the extension plays it: no notes or questions, pictures within the start message's budget. */
export async function loadTour(
  setId: string,
  snap: StoredSnapshot | null,
  readPicture: (path: string) => Promise<{ mime: string; data: string } | null>
): Promise<LoadedTour> {
  if (!snap || !isWebTourSnapshot(snap) || !startHostOf(snap))
    throw fail(404, 'That tour is no longer published.');
  const steps = webSteps(snap);
  const read = await Promise.all(
    steps.map(async (step) => {
      const pic = step.web?.picture;
      const path = str(pic?.path);
      const w = Number(pic?.w);
      const h = Number(pic?.h);
      if (!isWebTourPicturePath(setId, path) || !(w > 0) || !(h > 0))
        return null;
      const got = await readPicture(path).catch(() => null);
      return got && got.data.length <= MAX_PICTURE_CHARS
        ? { ...got, w, h }
        : null;
    })
  );
  const pictures: Record<string, LoadedTourPicture> = {};
  let total = 0;
  steps.forEach((step, i) => {
    const pic = read[i];
    if (!pic || total + pic.data.length > MAX_PICTURE_TOTAL_CHARS) return;
    total += pic.data.length;
    pictures[str(step.id)] = pic;
  });
  return {
    setId,
    version: Number(snap.publishedAt) || 0,
    title: str(snap.set?.title),
    steps: steps.map((step) => ({
      id: str(step.id),
      label: str(step.label),
      text: str(step.text),
      web: {
        urlPattern: str(step.web?.urlPattern),
        action: step.web?.action,
        locator: step.web?.locator ?? {},
      },
    })),
    pictures,
  };
}

export interface StoredRun {
  v: number;
  startedAt: number;
  furthest: number;
  done: boolean;
  exit?: number;
  misses: string[];
  surface: 'web';
  weak: string[];
  fixes?: Record<string, unknown>;
  admin?: true;
}

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isIdList = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= MAX_RUN_LIST &&
  v.every((s) => typeof s === 'string' && s.length <= MAX_RUN_ID);

/** The run the extension sends, checked like the runs rule; `admin` comes from the server, never the body. */
export function parseRun(raw: unknown, isAdmin: boolean): StoredRun {
  const d = (raw ?? {}) as Record<string, unknown>;
  const fixes = d.fixes ?? {};
  const fixesOk =
    !!fixes &&
    typeof fixes === 'object' &&
    !Array.isArray(fixes) &&
    Object.keys(fixes).length <= MAX_RUN_LIST &&
    Object.entries(fixes).every(
      ([id, v]) =>
        id.length <= MAX_RUN_ID &&
        !!v &&
        typeof v === 'object' &&
        JSON.stringify(v).length <= MAX_FIX_CHARS
    );
  if (
    !isInt(d.v) ||
    !isInt(d.startedAt) ||
    !isInt(d.furthest) ||
    d.furthest < 0 ||
    d.furthest > MAX_RUN_STEP ||
    typeof d.done !== 'boolean' ||
    (d.exit !== undefined && !isInt(d.exit)) ||
    !isIdList(d.misses) ||
    !isIdList(d.weak ?? []) ||
    !fixesOk
  )
    throw fail(400, 'That run is malformed.');
  const fixMap = fixes as Record<string, unknown>;
  return {
    v: d.v,
    startedAt: d.startedAt,
    furthest: d.furthest,
    done: d.done,
    ...(isInt(d.exit) ? { exit: d.exit } : {}),
    misses: d.misses,
    surface: 'web',
    weak: (d.weak ?? []) as string[],
    ...(Object.keys(fixMap).length ? { fixes: fixMap } : {}),
    ...(isAdmin ? { admin: true as const } : {}),
  };
}

export function parseSetId(body: unknown): string {
  const setId = str((body as { setId?: unknown } | null)?.setId);
  if (!SET_ID.test(setId)) throw fail(400, 'Malformed tour id.');
  return setId;
}

function defaultDeps(db: Firestore): ExtensionDeps {
  return {
    clientId: EXTENSION_OAUTH_CLIENTS[process.env.GCLOUD_PROJECT ?? ''] ?? '',
    tokenInfo: async (token) => {
      const res = await fetch('https://oauth2.googleapis.com/tokeninfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: token }).toString(),
      });
      return res.ok ? ((await res.json()) as TokenInfo) : null;
    },
    uidForEmail: async (email) => {
      try {
        return (await admin.auth().getUserByEmail(email)).uid;
      } catch {
        return null;
      }
    },
    allowed: async (email, uid) => {
      const { isGlobalFeatureGranted } = await import('./quizMediaArchive');
      return isGlobalFeatureGranted(db, WEB_TOURS_FEATURE_ID, email, uid ?? '');
    },
    isAdmin: async (email) =>
      (await db.collection('admins').doc(email).get()).exists,
  };
}

async function readPicture(
  path: string
): Promise<{ mime: string; data: string } | null> {
  const file = admin.storage().bucket().file(path);
  const [meta] = await file.getMetadata();
  const mime = String(meta.contentType ?? '');
  if (!PICTURE_TYPES.has(mime) || Number(meta.size ?? 0) > 5 * 1024 * 1024)
    return null;
  const [data] = await file.download();
  return { mime, data: data.toString('base64') };
}

type Handler = (
  body: unknown,
  caller: ExtensionCaller,
  db: Firestore,
  deps: ExtensionDeps
) => Promise<unknown>;

const extensionEndpoint = (handler: Handler, memory: '256MiB' | '512MiB') =>
  onRequest(
    { memory, timeoutSeconds: 60, invoker: 'public', maxInstances: 20 },
    async (req, res) => {
      try {
        if (req.method !== 'POST') throw fail(405, 'Use POST.');
        const db = admin.firestore();
        const deps = defaultDeps(db);
        const caller = await verifyCaller(
          bearerToken(req.get('authorization')),
          deps
        );
        res.json(await handler(req.body, caller, db, deps));
      } catch (error) {
        if (error instanceof ExtensionCallError) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        console.error('[webTourExtension] failed:', error);
        res.status(500).json({ error: 'Something went wrong.' });
      }
    }
  );

export const webToursListV1 = extensionEndpoint(
  async (_body, caller, db, deps) => {
    const snap = await db
      .collection(GL_TOURS_COLLECTION)
      .where('set.surface', '==', 'web')
      .select('publishedAt', 'set.title', 'set.surface', 'set.steps')
      .get();
    return {
      tours: listTours(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
      // Admins also get the side panel's Record tab (H5).
      admin: await deps.isAdmin(caller.email),
    };
  },
  '256MiB'
);

export const webTourLoadV1 = extensionEndpoint(async (body, _caller, db) => {
  const setId = parseSetId(body);
  const snap = await db.collection(GL_TOURS_COLLECTION).doc(setId).get();
  return loadTour(
    setId,
    snap.exists ? (snap.data() as StoredSnapshot) : null,
    readPicture
  );
}, '512MiB');

export const webTourRunV1 = extensionEndpoint(
  async (body, caller, db, deps) => {
    const setId = parseSetId(body);
    // A staff member with no SpartBoard account still plays the tour; there is no uid to record it under.
    if (!caller.uid) return { recorded: false };
    const run = parseRun(
      (body as { run?: unknown }).run,
      await deps.isAdmin(caller.email)
    );
    const tourRef = db.collection(GL_TOURS_COLLECTION).doc(setId);
    const tour = await tourRef.get();
    if (!tour.exists || !isWebTourSnapshot(tour.data()))
      throw fail(404, 'That tour is no longer published.');
    await tourRef.collection('runs').doc(caller.uid).set(run);
    return { recorded: true };
  },
  '256MiB'
);
