// Authoring-time text extraction for image/pdf quiz stimuli
// (docs/plans/QUIZ_READ_ALOUD.md §4.2): PDF text layer first, Gemini OCR fallback.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import { QUIZ_READ_ALOUD_FEATURE_ID } from './quizReadAloud';
import './functionsInit';

export const MAX_STORED_CHARS = 50_000;
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MIN_CHARS_PER_PAGE = 40;
export const OCR_PAGE_CAP = 4;
export const OCR_DEADLINE_MS = 60_000;
export const MAX_FETCH_REDIRECTS = 5;
export const OCR_FEATURE_ID = 'ocr';
export const DEFAULT_OCR_DAILY_LIMIT = 20;

export type StimulusTextSource = 'pdf-text' | 'ocr' | 'needs-manual';

export interface ExtractRequest {
  stimulusId: string;
  type: 'image' | 'pdf';
  driveFileId?: string;
  url?: string;
}

export interface ExtractResult {
  text: string;
  source: StimulusTextSource;
}

export interface ExtractDeps {
  db: Firestore;
  isFeatureGranted: (teacherUid: string) => Promise<boolean>;
  getAccessToken: (teacherUid: string) => Promise<string>;
  downloadDriveFile: (accessToken: string, fileId: string) => Promise<Buffer>;
  fetchUrl: (url: string) => Promise<Buffer>;
  pdfText: (bytes: Buffer) => Promise<{ text: string; pages: number }>;
  pdfFirstPages: (bytes: Buffer, count: number) => Promise<Buffer>;
  ocr: (bytes: Buffer, mimeType: string) => Promise<string>;
  /** Throws `resource-exhausted` past the teacher's daily OCR allowance. */
  chargeOcr: (uid: string, email: string | null) => Promise<void>;
  now: () => number;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

export function parseExtractRequest(raw: unknown): ExtractRequest {
  const d = (raw ?? {}) as Record<string, unknown>;
  const stimulusId =
    typeof d.stimulusId === 'string' ? d.stimulusId.trim() : '';
  if (!stimulusId)
    throw new HttpsError('invalid-argument', 'stimulusId is required.');
  if (d.type !== 'image' && d.type !== 'pdf')
    throw new HttpsError('invalid-argument', 'type must be image or pdf.');
  const driveFileId =
    typeof d.driveFileId === 'string' && d.driveFileId.trim()
      ? d.driveFileId.trim()
      : undefined;
  const url =
    typeof d.url === 'string' && d.url.trim() ? d.url.trim() : undefined;
  if (!driveFileId && !url)
    throw new HttpsError('invalid-argument', 'driveFileId or url is required.');
  if (driveFileId && !/^[\w-]{10,}$/.test(driveFileId))
    throw new HttpsError('invalid-argument', 'Invalid driveFileId.');
  if (!driveFileId && url) assertFetchableUrl(url);
  return { stimulusId, type: d.type, driveFileId, url };
}

/** Only public https hosts; blocks loopback, link-local and RFC1918 literals. */
export function assertFetchableUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpsError('invalid-argument', 'Invalid url.');
  }
  if (parsed.protocol !== 'https:')
    throw new HttpsError('invalid-argument', 'Only https urls are supported.');
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '::1' ||
    host.startsWith('[');
  if (blocked)
    throw new HttpsError('invalid-argument', 'That url cannot be fetched.');
}

/** Collapses whitespace runs, keeps paragraph breaks, caps stored length (R4). */
export function normalizeExtractedText(raw: string): string {
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= MAX_STORED_CHARS) return text;
  const cut = text.lastIndexOf(' ', MAX_STORED_CHARS);
  return text
    .slice(0, cut > MAX_STORED_CHARS / 2 ? cut : MAX_STORED_CHARS)
    .trim();
}

/** A text layer thinner than 40 characters per page is treated as absent. */
export function hasUsableTextLayer(text: string, pages: number): boolean {
  const chars = text.replace(/\s+/g, '').length;
  return chars >= MIN_CHARS_PER_PAGE * Math.max(1, pages);
}

export function sniffImageMime(bytes: Buffer): string {
  if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e)
      return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
      return 'image/gif';
    if (
      bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    )
      return 'image/webp';
  }
  return 'image/png';
}

export function isPdf(bytes: Buffer): boolean {
  return bytes.length >= 5 && bytes.toString('ascii', 0, 5) === '%PDF-';
}

// ── Core ───────────────────────────────────────────────────────────────────

async function withDeadline<T>(
  work: Promise<T>,
  ms: number
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  try {
    return await Promise.race([
      work.then((value) => ({ timedOut: false as const, value })),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function extractStimulusReadAloudText(
  request: ExtractRequest,
  caller: { uid: string; email: string | null; studentRole: boolean },
  deps: ExtractDeps
): Promise<ExtractResult> {
  if (caller.studentRole)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  if (!(await deps.isFeatureGranted(caller.uid)))
    throw new HttpsError(
      'permission-denied',
      'Read-aloud is not enabled for this account.'
    );

  const startedAt = deps.now();
  let bytes: Buffer;
  try {
    if (request.driveFileId) {
      const token = await deps.getAccessToken(caller.uid);
      bytes = await deps.downloadDriveFile(token, request.driveFileId);
    } else {
      bytes = await deps.fetchUrl(request.url ?? '');
    }
  } catch (err) {
    console.warn('[quizStimulusText] download failed', err);
    throw new HttpsError('unavailable', 'Could not download the stimulus.');
  }
  if (bytes.length === 0)
    throw new HttpsError('invalid-argument', 'The stimulus file is empty.');
  if (bytes.length > MAX_SOURCE_BYTES)
    throw new HttpsError(
      'invalid-argument',
      'The stimulus file is too large to extract text from.'
    );

  const type = request.type === 'pdf' || isPdf(bytes) ? 'pdf' : 'image';
  let ocrBytes = bytes;
  let mimeType = 'application/pdf';

  if (type === 'pdf') {
    let layer: { text: string; pages: number } | null = null;
    try {
      layer = await deps.pdfText(bytes);
    } catch (err) {
      console.warn('[quizStimulusText] pdf text layer failed', err);
    }
    if (layer && hasUsableTextLayer(layer.text, layer.pages)) {
      return { text: normalizeExtractedText(layer.text), source: 'pdf-text' };
    }
    try {
      ocrBytes = await deps.pdfFirstPages(bytes, OCR_PAGE_CAP);
    } catch (err) {
      console.warn('[quizStimulusText] pdf page slice failed', err);
      return { text: '', source: 'needs-manual' };
    }
  } else {
    mimeType = sniffImageMime(bytes);
  }

  // Quota is charged only once OCR can actually run within the deadline.
  const remaining = OCR_DEADLINE_MS - (deps.now() - startedAt);
  if (remaining <= 0) return { text: '', source: 'needs-manual' };
  await deps.chargeOcr(caller.uid, caller.email);
  let outcome: Awaited<ReturnType<typeof withDeadline<string>>>;
  try {
    outcome = await withDeadline(deps.ocr(ocrBytes, mimeType), remaining);
  } catch (err) {
    console.error('[quizStimulusText] ocr failed', err);
    throw new HttpsError('unavailable', 'Text extraction is unavailable.');
  }
  if (outcome.timedOut) return { text: '', source: 'needs-manual' };
  const text = normalizeExtractedText(outcome.value);
  return text ? { text, source: 'ocr' } : { text: '', source: 'needs-manual' };
}

// ── Default deps ───────────────────────────────────────────────────────────

const OCR_PROMPT =
  'Transcribe every piece of readable text in this document in natural reading order. ' +
  'Keep paragraphs separated by a blank line. Output only the transcribed text with no commentary. ' +
  'If there is no readable text, output nothing.';

/** Streams the body so a missing or understated content-length can't buffer past the cap. */
async function readCappedBody(res: Response): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const parts: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      total += value.byteLength;
      if (total > MAX_SOURCE_BYTES) throw new Error('Source too large');
      parts.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(parts, total);
}

/** Redirects are followed by hand so every hop is re-checked against the public-host rules (no SSRF via 302). */
export async function fetchPublicUrl(
  url: string,
  doFetch: typeof fetch = fetch
): Promise<Buffer> {
  let target = url;
  for (let hop = 0; hop <= MAX_FETCH_REDIRECTS; hop += 1) {
    assertFetchableUrl(target);
    const res = await doFetch(target, { redirect: 'manual' });
    const location =
      res.status >= 300 && res.status < 400
        ? res.headers.get('location')
        : null;
    if (location) {
      await res.body?.cancel().catch(() => undefined);
      target = new URL(location, target).toString();
      continue;
    }
    if (!res.ok) throw new Error(`Fetch responded ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_SOURCE_BYTES) throw new Error('Source too large');
    return readCappedBody(res);
  }
  throw new Error('Too many redirects');
}

async function pdfTextLayer(
  bytes: Buffer
): Promise<{ text: string; pages: number }> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return { text: result.text, pages: result.total };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function pdfFirstPagesBytes(
  bytes: Buffer,
  count: number
): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (source.getPageCount() <= count) return bytes;
  const target = await PDFDocument.create();
  const indices = Array.from({ length: count }, (_, i) => i);
  const pages = await target.copyPages(source, indices);
  for (const page of pages) target.addPage(page);
  return Buffer.from(await target.save());
}

async function geminiOcr(bytes: Buffer, mimeType: string): Promise<string> {
  const [{ GoogleGenAI }, ai] = await Promise.all([
    import('@google/genai'),
    import('./aiGeneration'),
  ]);
  const client = new GoogleGenAI(ai.__vertexClientOptions());
  const { standardModel } = await ai.__getGeminiModelConfig(admin.firestore());
  const result = await client.models.generateContent({
    model: standardModel,
    contents: [
      {
        role: 'user',
        parts: [
          { text: OCR_PROMPT },
          { inlineData: { mimeType, data: bytes.toString('base64') } },
        ],
      },
    ],
    config: { responseMimeType: 'text/plain' },
  });
  return result.text ?? '';
}

/** Mirrors generateWithAI's per-feature `ocr` counter; admins are uncapped. */
export async function chargeOcrQuota(
  db: Firestore,
  uid: string,
  email: string | null,
  nowMs: number
): Promise<void> {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const isAdmin = email
    ? (await db.collection('admins').doc(email.toLowerCase()).get()).exists
    : false;
  const overallRef = db.collection('ai_usage').doc(`${uid}_${today}`);
  const specificRef = db
    .collection('ai_usage')
    .doc(`${uid}_${OCR_FEATURE_ID}_${today}`);
  const permRef = db.collection('global_permissions').doc(OCR_FEATURE_ID);
  await db.runTransaction(async (tx) => {
    const [specific, perm] = await Promise.all([
      tx.get(specificRef),
      tx.get(permRef),
    ]);
    const used = specific.exists ? Number(specific.data()?.count ?? 0) : 0;
    const config = (perm.data()?.config ?? {}) as {
      dailyLimit?: unknown;
      dailyLimitEnabled?: unknown;
    };
    const limit =
      typeof config.dailyLimit === 'number'
        ? config.dailyLimit
        : DEFAULT_OCR_DAILY_LIMIT;
    if (!isAdmin && config.dailyLimitEnabled !== false && used >= limit)
      throw new HttpsError(
        'resource-exhausted',
        `Daily limit for ${OCR_FEATURE_ID} reached (${limit} per day). Please try again tomorrow.`
      );
    const inc = (n: number) => admin.firestore.FieldValue.increment(n);
    const stamp = admin.firestore.FieldValue.serverTimestamp();
    tx.set(
      specificRef,
      { count: inc(1), lastUsed: stamp, featureId: OCR_FEATURE_ID },
      { merge: true }
    );
    tx.set(overallRef, { count: inc(1), lastUsed: stamp }, { merge: true });
  });
}

export function buildDefaultExtractDeps(): ExtractDeps {
  const db = admin.firestore();
  return {
    db,
    isFeatureGranted: async (teacherUid) => {
      let email: string | null = null;
      try {
        email = (await admin.auth().getUser(teacherUid)).email ?? null;
      } catch {
        email = null;
      }
      return isGlobalFeatureGranted(
        db,
        QUIZ_READ_ALOUD_FEATURE_ID,
        email,
        teacherUid
      );
    },
    getAccessToken: async (teacherUid) => {
      const { refreshGoogleAccessTokenForUid } = await import('./googleOAuth');
      return (await refreshGoogleAccessTokenForUid(teacherUid)).accessToken;
    },
    downloadDriveFile: async (token, fileId) => {
      const { downloadDriveFileById } =
        await import('./getQuizArtifactPlaybackUrl');
      return downloadDriveFileById(token, fileId);
    },
    fetchUrl: fetchPublicUrl,
    pdfText: pdfTextLayer,
    pdfFirstPages: pdfFirstPagesBytes,
    ocr: geminiOcr,
    chargeOcr: (uid, email) => chargeOcrQuota(db, uid, email, Date.now()),
    now: () => Date.now(),
  };
}

// ── Callable ───────────────────────────────────────────────────────────────

export const extractStimulusReadAloudTextV1 = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    const parsed = parseExtractRequest(request.data);
    return extractStimulusReadAloudText(
      parsed,
      {
        uid: request.auth.uid,
        email: request.auth.token.email ?? null,
        studentRole: request.auth.token.studentRole === true,
      },
      buildDefaultExtractDeps()
    );
  }
);
