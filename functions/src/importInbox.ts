// Import inbox (docs/plans/IMPORT.md D14, D16, D18): the extension's Send to SpartBoard posts a read page with a Google token.
import './functionsInit';
import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { isDistrictStaffEmail } from './districtStaff';
import {
  DISTRICT_DOMAIN,
  EXTENSION_OAUTH_CLIENTS,
  ExtensionCallError,
  bearerToken,
  fetchTokenInfo,
  verifiedTokenEmail,
  type TokenInfo,
} from './webTourExtension';
import {
  IMPORT_INBOX_COLLECTION,
  IMPORT_INBOX_TTL_MS,
  IMPORT_MAX_BLOCKS,
  IMPORT_MAX_BLOCK_CHARS,
  IMPORT_MAX_IMAGES,
  IMPORT_MAX_INBOX_ITEMS,
  IMPORT_MAX_REASON_CHARS,
  IMPORT_MAX_TABLE_CELLS,
  IMPORT_MAX_TABLE_ROWS,
  IMPORT_MAX_TEXT_CHARS,
  IMPORT_MAX_TITLE_CHARS,
  IMPORT_MAX_URL_CHARS,
  IMPORT_PLATFORM_ID,
  IMPORT_READER_FAILURES_COLLECTION,
  IMPORT_READER_FAILURE_TTL_MS,
  IMPORT_SEND_BLOCK_LIST_DOC,
  UNIVERSAL_IMPORT_FEATURE,
  isUrlBlocked,
  resolveBlockPatterns,
  type ImportBlock,
  type ImportImage,
  type ImportReaderFailure,
  type ImportSendReply,
  type ImportSendRequest,
  type ImportStatusReply,
} from './import/shared.gen';

type Firestore = admin.firestore.Firestore;

const SIGN_IN = 'Sign in to Chrome with your Orono account.';
const MAX_DOC_BYTES = 900_000;

const fail = (status: number, message: string) =>
  new ExtensionCallError(status, message);
const malformed = (what: string) =>
  fail(400, `That page is malformed: ${what}.`);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function text(v: unknown, max: number, what: string): string {
  if (typeof v !== 'string' || v.length > max) throw malformed(what);
  return v;
}

function httpUrl(v: unknown, what: string): string {
  const raw = text(v, IMPORT_MAX_URL_CHARS, what);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw malformed(what);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw malformed(what);
  if (u.username || u.password) throw malformed(what);
  return raw;
}

const SECRET_PARAM =
  /^(auth|code|key|sig|session|policy|key-pair-id|jwt|x-amz-.+|x-goog-.+)$|token|secret|signature|credential|password|api_?key/i;

/** The page URL without its fragment or sign-in tokens, which the teacher never meant to send. */
export function storedUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = '';
  for (const name of [...u.searchParams.keys()])
    if (SECRET_PARAM.test(name)) u.searchParams.delete(name);
  return u.toString();
}

function parseBlock(v: unknown, i: number): ImportBlock {
  const what = `block ${i + 1}`;
  if (!isObj(v)) throw malformed(what);
  if (v.type === 'table') {
    if (!Array.isArray(v.rows) || v.rows.length > IMPORT_MAX_TABLE_ROWS)
      throw malformed(what);
    return {
      type: 'table',
      rows: v.rows.map((r) => {
        if (
          !isObj(r) ||
          !Array.isArray(r.cells) ||
          r.cells.length > IMPORT_MAX_TABLE_CELLS
        )
          throw malformed(what);
        return {
          cells: r.cells.map((c) => text(c, IMPORT_MAX_BLOCK_CHARS, what)),
        };
      }),
    };
  }
  const body = text(v.text, IMPORT_MAX_BLOCK_CHARS, what);
  if (v.type === 'heading') {
    const level = v.level;
    if (
      !Number.isInteger(level) ||
      (level as number) < 1 ||
      (level as number) > 6
    )
      throw malformed(what);
    return { type: 'heading', level: level as number, text: body };
  }
  if (v.type === 'paragraph' || v.type === 'listItem' || v.type === 'quote')
    return { type: v.type, text: body };
  throw malformed(what);
}

// An empty cell still counts one, so a page of empty tables can't dodge the cap.
const blockChars = (b: ImportBlock) =>
  b.type === 'table'
    ? b.rows.reduce(
        (n, r) => n + 1 + r.cells.reduce((m, c) => m + 1 + c.length, 0),
        0
      )
    : b.text.length;

function parseImage(v: unknown, i: number): ImportImage {
  const what = `image ${i + 1}`;
  if (!isObj(v)) throw malformed(what);
  const url = httpUrl(v.url, what);
  if (v.alt === undefined) return { url };
  return { url, alt: text(v.alt, 500, what) };
}

function platformId(v: unknown, what: string): string {
  if (typeof v !== 'string' || !IMPORT_PLATFORM_ID.test(v))
    throw malformed(what);
  return v;
}

function parseReaderFailure(v: unknown): ImportReaderFailure | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) throw malformed('reader failure');
  return {
    platform: platformId(v.platform, 'reader failure'),
    reason: text(v.reason, IMPORT_MAX_REASON_CHARS, 'reader failure'),
  };
}

/** Checks everything the extension sends; unknown fields are dropped, never stored. */
export function parseSendRequest(body: unknown): ImportSendRequest {
  if (!isObj(body)) throw malformed('body');
  if (!Array.isArray(body.blocks) || body.blocks.length === 0)
    throw fail(400, 'That page has nothing to import.');
  if (body.blocks.length > IMPORT_MAX_BLOCKS)
    throw fail(413, 'This page is too long to send at once.');
  const blocks = body.blocks.map(parseBlock);
  if (blocks.reduce((n, b) => n + blockChars(b), 0) > IMPORT_MAX_TEXT_CHARS)
    throw fail(413, 'This page is too long to send at once.');
  const images = body.images ?? [];
  if (!Array.isArray(images) || images.length > IMPORT_MAX_IMAGES)
    throw malformed('images');
  if (typeof body.selectionOnly !== 'boolean') throw malformed('selection');
  const title = text(body.title, IMPORT_MAX_TITLE_CHARS, 'title').trim();
  if (!title) throw malformed('title');
  const readerFailure = parseReaderFailure(body.readerFailure);
  return {
    url: storedUrl(httpUrl(body.url, 'url')),
    title,
    platform: platformId(body.platform, 'platform'),
    selectionOnly: body.selectionOnly,
    blocks,
    images: images.map(parseImage),
    ...(readerFailure ? { readerFailure } : {}),
  };
}

/** The same content from the same page replaces its unsaved copy instead of piling up. */
export const sendId = (send: ImportSendRequest): string =>
  createHash('sha256')
    .update(
      JSON.stringify([send.url, send.selectionOnly, send.blocks, send.images])
    )
    .digest('hex')
    .slice(0, 40);

/** Origin and first path segment only: the rest of a URL can carry student ids. */
export function failureUrl(url: string): string {
  const u = new URL(url);
  const first = u.pathname.split('/').find((s) => s) ?? '';
  return `${u.origin}/${first}`;
}

export interface Importer {
  email: string;
  uid: string | null;
  enabled: boolean;
}

export interface ImporterDeps {
  clientId: string;
  tokenInfo: (token: string) => Promise<TokenInfo | null>;
  uidForEmail: (email: string) => Promise<string | null>;
  allowed: (email: string, uid: string | null) => Promise<boolean>;
}

/** The token's verified district email, its SpartBoard account and whether it has the flag. */
export async function checkImporter(
  token: string,
  deps: ImporterDeps
): Promise<Importer> {
  if (!deps.clientId) throw fail(503, 'Import is not set up yet.');
  const email = await verifiedTokenEmail(token, deps, DISTRICT_DOMAIN, SIGN_IN);
  const uid = await deps.uidForEmail(email);
  return { email, uid, enabled: await deps.allowed(email, uid) };
}

export interface ImportStore {
  blockPatterns: () => Promise<string[]>;
  count: (uid: string) => Promise<number>;
  exists: (uid: string, id: string) => Promise<boolean>;
  write: (
    uid: string,
    id: string,
    doc: object,
    expireAt: number
  ) => Promise<void>;
  logFailure: (doc: object, expireAt: number) => Promise<void>;
}

export async function importStatus(
  importer: Importer,
  store: Pick<ImportStore, 'blockPatterns'>
): Promise<ImportStatusReply> {
  return {
    enabled: importer.enabled,
    hasAccount: !!importer.uid,
    blockPatterns: importer.enabled ? await store.blockPatterns() : [],
  };
}

/** Stores one read page for its teacher's Import screen. */
export async function receiveSend(
  body: unknown,
  importer: Importer,
  store: ImportStore,
  now = Date.now()
): Promise<ImportSendReply> {
  if (!importer.enabled)
    throw fail(403, "Import isn't available for your account yet.");
  if (!importer.uid)
    throw fail(
      403,
      'Open SpartBoard once with this account, then send the page again.'
    );
  const uid = importer.uid;
  const send = parseSendRequest(body);
  // D16: refused here too, so an out-of-date extension can't send a blocked page.
  const patterns = await store.blockPatterns();
  if (isUrlBlocked(send.url, patterns))
    throw fail(403, "Your district doesn't allow sending this page.");
  // A picture hosted on a blocked site (a student photo in the SIS) is dropped, not stored.
  const images = send.images.filter((img) => !isUrlBlocked(img.url, patterns));
  const id = sendId({ ...send, images });
  const { readerFailure, ...rest } = send;
  const stored = { ...rest, images };
  const doc = { ...stored, receivedAt: now };
  if (Buffer.byteLength(JSON.stringify(stored)) > MAX_DOC_BYTES)
    throw fail(413, 'This page is too long to send at once.');
  if (
    !(await store.exists(uid, id)) &&
    (await store.count(uid)) >= IMPORT_MAX_INBOX_ITEMS
  )
    throw fail(429, 'Import the pages already waiting in SpartBoard first.');
  await store.write(uid, id, doc, now + IMPORT_INBOX_TTL_MS);
  if (readerFailure)
    await store
      .logFailure(
        {
          uid,
          platform: readerFailure.platform,
          reason: readerFailure.reason,
          url: failureUrl(send.url),
          createdAt: now,
        },
        now + IMPORT_READER_FAILURE_TTL_MS
      )
      .catch((error: unknown) =>
        console.error('[importInbox] failure log write failed', error)
      );
  return { id, blocks: send.blocks.length, images: images.length };
}

const inboxRef = (db: Firestore, uid: string) =>
  db.collection('users').doc(uid).collection(IMPORT_INBOX_COLLECTION);

function defaultDeps(db: Firestore): ImporterDeps {
  return {
    clientId: EXTENSION_OAUTH_CLIENTS[process.env.GCLOUD_PROJECT ?? ''] ?? '',
    tokenInfo: fetchTokenInfo,
    uidForEmail: async (email) => {
      try {
        return (await admin.auth().getUserByEmail(email)).uid;
      } catch {
        return null;
      }
    },
    allowed: async (email, uid) => {
      // Students share the district domain, so the flag alone can't admit an address.
      const staff =
        (await isDistrictStaffEmail(db, email)) ||
        (await db.collection('admins').doc(email).get()).exists;
      if (!staff) return false;
      const { isGlobalFeatureGranted } = await import('./quizMediaArchive');
      return isGlobalFeatureGranted(
        db,
        UNIVERSAL_IMPORT_FEATURE,
        email,
        uid ?? ''
      );
    },
  };
}

function defaultStore(db: Firestore): ImportStore {
  return {
    blockPatterns: async () =>
      resolveBlockPatterns(
        (
          await db
            .collection('admin_settings')
            .doc(IMPORT_SEND_BLOCK_LIST_DOC)
            .get()
        ).data()
      ),
    count: async (uid) => (await inboxRef(db, uid).count().get()).data().count,
    exists: async (uid, id) => (await inboxRef(db, uid).doc(id).get()).exists,
    write: async (uid, id, doc, expireAt) => {
      await inboxRef(db, uid)
        .doc(id)
        .set({
          ...doc,
          expireAt: admin.firestore.Timestamp.fromMillis(expireAt),
        });
    },
    logFailure: async (doc, expireAt) => {
      await db.collection(IMPORT_READER_FAILURES_COLLECTION).add({
        ...doc,
        expireAt: admin.firestore.Timestamp.fromMillis(expireAt),
      });
    },
  };
}

type Handler = (
  body: unknown,
  importer: Importer,
  db: Firestore
) => Promise<unknown>;

const importerEndpoint = (handler: Handler) =>
  onRequest(
    {
      memory: '256MiB',
      timeoutSeconds: 60,
      invoker: 'public',
      maxInstances: 20,
    },
    async (req, res) => {
      try {
        if (req.method !== 'POST') throw fail(405, 'Use POST.');
        const db = admin.firestore();
        const importer = await checkImporter(
          bearerToken(req.get('authorization')),
          defaultDeps(db)
        );
        res.json(await handler(req.body, importer, db));
      } catch (error) {
        if (error instanceof ExtensionCallError) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        console.error('[importInbox] failed:', error);
        res.status(500).json({ error: 'Something went wrong.' });
      }
    }
  );

/** Whether the extension shows Send to SpartBoard, and the pages it must not read (D16). */
export const importStatusV1 = importerEndpoint((_body, importer, db) =>
  importStatus(importer, defaultStore(db))
);

export const importInboxV1 = importerEndpoint((body, importer, db) =>
  receiveSend(body, importer, defaultStore(db))
);
