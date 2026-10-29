// Schoology quiz import inbox (docs/plans/SCHOOLOGY_QUIZ_IMPORT.md Q8, Q14): the extension posts read quizzes with a Google token.
import './functionsInit';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import {
  DISTRICT_DOMAIN,
  EXTENSION_OAUTH_CLIENTS,
  ExtensionCallError,
  bearerToken,
  fetchTokenInfo,
  verifiedTokenEmail,
  type TokenInfo,
} from './webTourExtension';

type Firestore = admin.firestore.Firestore;

export const SCHOOLOGY_QUIZ_IMPORT_FEATURE = 'schoology-quiz-import';
export const INBOX_COLLECTION = 'schoology_import_inbox';
export const INBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_INBOX_ITEMS = 200;
export const MAX_QUESTIONS = 500;
export const MAX_IMAGES = 200;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
// Under Cloud Run's 32 MiB request cap, leaving room for the quiz JSON.
export const MAX_IMAGE_TOTAL_CHARS = 24 * 1024 * 1024;
const MAX_DOC_BYTES = 900_000;
const SIGN_IN = 'Sign in to Chrome with your Orono account.';
const KINDS = new Set(['testQuiz', 'assessment', 'questionBank']);
const TYPES = new Set([
  'MC',
  'MA',
  'FIB',
  'Matching',
  'Ordering',
  'free-response',
]);
const SCHOOLOGY_ID = /^\d{1,20}$/;
const SCHOOLOGY_URL = /^https:\/\/[a-z0-9-]+\.schoology\.com\//i;
const PICTURE_TYPES: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) =>
    b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
};
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const fail = (status: number, message: string) =>
  new ExtensionCallError(status, message);
const malformed = (what: string) =>
  fail(400, `That quiz is malformed: ${what}.`);

export interface ImporterDeps {
  clientId: string;
  tokenInfo: (token: string) => Promise<TokenInfo | null>;
  uidForEmail: (email: string) => Promise<string | null>;
  allowed: (email: string, uid: string | null) => Promise<boolean>;
}

export interface Importer {
  email: string;
  uid: string | null;
  enabled: boolean;
}

/** The token's verified district email, its SpartBoard account and whether it has the flag. */
export async function checkImporter(
  token: string,
  deps: ImporterDeps
): Promise<Importer> {
  if (!deps.clientId) throw fail(503, 'Schoology import is not set up yet.');
  const email = await verifiedTokenEmail(token, deps, DISTRICT_DOMAIN, SIGN_IN);
  const uid = await deps.uidForEmail(email);
  return { email, uid, enabled: await deps.allowed(email, uid) };
}

export interface InboxSource {
  kind: 'testQuiz' | 'assessment' | 'questionBank';
  itemId: string;
  sectionId?: string;
  collectionId?: string;
  url?: string;
}

export interface InboxQuestion {
  number: number;
  text: string;
  type: string;
  options: { letter: string; text: string }[];
  correctAnswer: string;
  imageIds: string[];
  warnings: string[];
  points?: number;
  matchingDistractors?: string[];
  allowPartialCredit?: boolean;
  blankAlternates?: string[][];
}

export interface InboxSettings {
  shuffleQuestions?: boolean;
  timeLimitMinutes?: number;
  attempts?: number;
}

export interface InboxPicture {
  id: string;
  mime: string;
  name: string;
  bytes: Buffer;
}

export interface InboxPayload {
  source: InboxSource;
  folderPath: string[];
  title: string;
  questions: InboxQuestion[];
  warnings: string[];
  unsupported: number[];
  settings: InboxSettings;
  pictures: InboxPicture[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function text(v: unknown, max: number, what: string, optional = false): string {
  if (v === undefined && optional) return '';
  if (typeof v !== 'string' || v.length > max) throw malformed(what);
  return v;
}

function texts(
  v: unknown,
  maxItems: number,
  maxChars: number,
  what: string
): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > maxItems) throw malformed(what);
  return v.map((s) => text(s, maxChars, what));
}

function optId(v: unknown, what: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !SCHOOLOGY_ID.test(v)) throw malformed(what);
  return v;
}

function parseSource(v: unknown): InboxSource {
  if (!isObj(v) || typeof v.kind !== 'string' || !KINDS.has(v.kind))
    throw malformed('source');
  const itemId = optId(v.itemId, 'item id');
  if (!itemId) throw malformed('item id');
  const url = v.url === undefined ? undefined : text(v.url, 2000, 'source url');
  if (url !== undefined && !SCHOOLOGY_URL.test(url))
    throw malformed('source url');
  const sectionId = optId(v.sectionId, 'section id');
  const collectionId = optId(v.collectionId, 'collection id');
  return {
    kind: v.kind as InboxSource['kind'],
    itemId,
    ...(sectionId ? { sectionId } : {}),
    ...(collectionId ? { collectionId } : {}),
    ...(url ? { url } : {}),
  };
}

function parseQuestion(v: unknown, i: number): InboxQuestion {
  const what = `question ${i + 1}`;
  if (!isObj(v) || typeof v.type !== 'string' || !TYPES.has(v.type))
    throw malformed(what);
  const options = v.options ?? [];
  if (!Array.isArray(options) || options.length > 26) throw malformed(what);
  const points = v.points;
  if (
    points !== undefined &&
    !(typeof points === 'number' && points >= 0 && points <= 1000)
  )
    throw malformed(what);
  if (
    v.allowPartialCredit !== undefined &&
    typeof v.allowPartialCredit !== 'boolean'
  )
    throw malformed(what);
  const alternates = v.blankAlternates;
  if (
    alternates !== undefined &&
    (!Array.isArray(alternates) || alternates.length > 50)
  )
    throw malformed(what);
  const number = v.number;
  return {
    number: Number.isInteger(number) ? (number as number) : i + 1,
    text: text(v.text, 20_000, what),
    type: v.type,
    options: options.map((o) => {
      if (!isObj(o)) throw malformed(what);
      return {
        letter: text(o.letter, 3, what),
        text: text(o.text, 5000, what),
      };
    }),
    correctAnswer: text(v.correctAnswer ?? '', 20_000, what),
    imageIds: texts(v.imageIds, 50, 2048, what),
    warnings: texts(v.warnings, 50, 2000, what),
    ...(points !== undefined ? { points } : {}),
    ...(v.matchingDistractors !== undefined
      ? { matchingDistractors: texts(v.matchingDistractors, 50, 2000, what) }
      : {}),
    ...(v.allowPartialCredit !== undefined
      ? { allowPartialCredit: v.allowPartialCredit }
      : {}),
    ...(alternates !== undefined
      ? { blankAlternates: alternates.map((a) => texts(a, 50, 500, what)) }
      : {}),
  };
}

function parseSettings(v: unknown): InboxSettings {
  if (v === undefined) return {};
  if (!isObj(v)) throw malformed('settings');
  const { shuffleQuestions, timeLimitMinutes, attempts } = v;
  const intIn = (n: unknown, lo: number, hi: number) =>
    Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;
  if (shuffleQuestions !== undefined && typeof shuffleQuestions !== 'boolean')
    throw malformed('settings');
  if (timeLimitMinutes !== undefined && !intIn(timeLimitMinutes, 1, 1440))
    throw malformed('settings');
  if (attempts !== undefined && !intIn(attempts, 0, 100))
    throw malformed('settings');
  return {
    ...(shuffleQuestions !== undefined ? { shuffleQuestions } : {}),
    ...(timeLimitMinutes !== undefined
      ? { timeLimitMinutes: timeLimitMinutes as number }
      : {}),
    ...(attempts !== undefined ? { attempts: attempts as number } : {}),
  };
}

function parsePictures(v: unknown): InboxPicture[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_IMAGES) throw malformed('pictures');
  const seen = new Set<string>();
  let total = 0;
  return v.map((p, i) => {
    const what = `picture ${i + 1}`;
    if (!isObj(p)) throw malformed(what);
    const id = text(p.id, 2048, what);
    const mime = text(p.mime, 40, what);
    const data = text(p.data, MAX_IMAGE_CHARS, what);
    const sniff = PICTURE_TYPES[mime];
    if (!id || seen.has(id) || !sniff) throw malformed(what);
    if (data.length % 4 !== 0 || !BASE64.test(data)) throw malformed(what);
    total += data.length;
    if (total > MAX_IMAGE_TOTAL_CHARS)
      throw fail(413, 'This quiz has too many pictures to send at once.');
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || !sniff(bytes))
      throw malformed(what);
    seen.add(id);
    return {
      id,
      mime,
      name: text(p.name, 200, what, true) || `Picture ${i + 1}`,
      bytes,
    };
  });
}

/** Checks everything the extension sends; unknown fields are dropped, never stored. */
export function parseInboxPayload(body: unknown): InboxPayload {
  if (!isObj(body)) throw malformed('body');
  const quiz = body.quiz;
  if (!isObj(quiz) || !Array.isArray(quiz.questions))
    throw malformed('questions');
  if (quiz.questions.length === 0)
    throw fail(400, 'That quiz has no questions.');
  if (quiz.questions.length > MAX_QUESTIONS)
    throw fail(413, `A quiz can have at most ${MAX_QUESTIONS} questions.`);
  const folderPath = texts(body.folderPath, 10, 200, 'folder').map((s) =>
    s.trim()
  );
  if (folderPath.some((s) => !s)) throw malformed('folder');
  const unsupported = body.unsupported ?? [];
  if (
    !Array.isArray(unsupported) ||
    unsupported.length > MAX_QUESTIONS ||
    !unsupported.every((n) => Number.isInteger(n))
  )
    throw malformed('unsupported list');
  const title = text(quiz.title, 500, 'title').trim();
  if (!title) throw malformed('title');
  return {
    source: parseSource(body.source),
    folderPath,
    title,
    questions: quiz.questions.map(parseQuestion),
    warnings: texts(quiz.warnings, 100, 2000, 'warnings'),
    unsupported: unsupported as number[],
    settings: parseSettings(body.settings),
    pictures: parsePictures(body.pictures),
  };
}

/** One inbox entry per Schoology item, so sending it again replaces the unsaved copy. */
export const inboxItemId = (source: InboxSource): string =>
  `${source.kind}_${source.itemId}`;

export const picturePrefix = (uid: string, itemId: string): string =>
  `schoology_import/${uid}/${itemId}/`;

const MISSING_PICTURE =
  "A picture couldn't be copied from Schoology. Add it in the editor.";

/** The stored inbox item; questions keep only pictures that arrived, and say when one didn't. */
export function inboxDoc(
  payload: InboxPayload,
  uid: string,
  itemId: string,
  now: number
) {
  const prefix = picturePrefix(uid, itemId);
  const images = payload.pictures.map((p, i) => ({
    id: p.id,
    path: `${prefix}${i}`,
    contentType: p.mime,
    name: p.name,
  }));
  const received = new Set(images.map((img) => img.id));
  const questions = payload.questions.map((q) => {
    const kept = q.imageIds.filter((id) => received.has(id));
    return kept.length === q.imageIds.length
      ? q
      : { ...q, imageIds: kept, warnings: [...q.warnings, MISSING_PICTURE] };
  });
  const doc = {
    source: payload.source,
    folderPath: payload.folderPath,
    quiz: { title: payload.title, questions, warnings: payload.warnings },
    unsupported: payload.unsupported,
    settings: payload.settings,
    images,
    questionCount: questions.length,
    receivedAt: now,
  };
  if (Buffer.byteLength(JSON.stringify(doc)) > MAX_DOC_BYTES)
    throw fail(413, 'This quiz is too large to send at once.');
  return doc;
}

export interface InboxStore {
  count: (uid: string) => Promise<number>;
  exists: (uid: string, itemId: string) => Promise<boolean>;
  clearPictures: (prefix: string) => Promise<void>;
  savePicture: (path: string, picture: InboxPicture) => Promise<void>;
  write: (
    uid: string,
    itemId: string,
    doc: object,
    expireAt: number
  ) => Promise<void>;
}

/** Stores one read quiz for its teacher's review screen. */
export async function receiveQuiz(
  body: unknown,
  importer: Importer,
  store: InboxStore,
  now = Date.now()
): Promise<{ id: string; questions: number; pictures: number }> {
  if (!importer.enabled)
    throw fail(403, "Schoology import isn't available for your account yet.");
  if (!importer.uid)
    throw fail(
      403,
      'Open SpartBoard once with this account, then send the quiz again.'
    );
  const uid = importer.uid;
  const payload = parseInboxPayload(body);
  const itemId = inboxItemId(payload.source);
  const doc = inboxDoc(payload, uid, itemId, now);
  if (
    !(await store.exists(uid, itemId)) &&
    (await store.count(uid)) >= MAX_INBOX_ITEMS
  )
    throw fail(429, 'Review the quizzes already waiting in SpartBoard first.');
  const prefix = picturePrefix(uid, itemId);
  await store.clearPictures(prefix);
  try {
    for (const [i, picture] of payload.pictures.entries())
      await store.savePicture(doc.images[i].path, picture);
    await store.write(uid, itemId, doc, now + INBOX_TTL_MS);
  } catch (error) {
    await store.clearPictures(prefix).catch(() => undefined);
    throw error;
  }
  return {
    id: itemId,
    questions: doc.questionCount,
    pictures: doc.images.length,
  };
}

const inboxRef = (db: Firestore, uid: string) =>
  db.collection('users').doc(uid).collection(INBOX_COLLECTION);

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
      const { isGlobalFeatureGranted } = await import('./quizMediaArchive');
      return isGlobalFeatureGranted(
        db,
        SCHOOLOGY_QUIZ_IMPORT_FEATURE,
        email,
        uid ?? ''
      );
    },
  };
}

function defaultStore(db: Firestore): InboxStore {
  const bucket = admin.storage().bucket();
  return {
    count: async (uid) => (await inboxRef(db, uid).count().get()).data().count,
    exists: async (uid, itemId) =>
      (await inboxRef(db, uid).doc(itemId).get()).exists,
    clearPictures: (prefix) => bucket.deleteFiles({ prefix }),
    savePicture: (path, picture) =>
      bucket.file(path).save(picture.bytes, {
        resumable: false,
        contentType: picture.mime,
        metadata: { cacheControl: 'private, max-age=0' },
      }),
    write: async (uid, itemId, doc, expireAt) => {
      await inboxRef(db, uid)
        .doc(itemId)
        .set({
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

const importerEndpoint = (handler: Handler, memory: '256MiB' | '1GiB') =>
  onRequest(
    { memory, timeoutSeconds: 120, invoker: 'public', maxInstances: 20 },
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
        console.error('[schoologyQuizImport] failed:', error);
        res.status(500).json({ error: 'Something went wrong.' });
      }
    }
  );

/** Whether the extension shows its Send to SpartBoard button (Q4); no button, no reading. */
export const schoologyImportStatusV1 = importerEndpoint(
  (_body, importer) =>
    Promise.resolve({ enabled: importer.enabled, hasAccount: !!importer.uid }),
  '256MiB'
);

export const schoologyImportInboxV1 = importerEndpoint(
  (body, importer, db) => receiveQuiz(body, importer, defaultStore(db)),
  '1GiB'
);

// Saved, discarded or expired by TTL: the item's pictures go with it.
export const schoologyImportInboxCleanup = onDocumentDeleted(
  `users/{uid}/${INBOX_COLLECTION}/{itemId}`,
  async (event) => {
    const { uid, itemId } = event.params;
    await admin
      .storage()
      .bucket()
      .deleteFiles({ prefix: picturePrefix(uid, itemId) });
  }
);
