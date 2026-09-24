// PLC norming flags: anonymized copies of flagged answers for PLC norming (docs/plans/PLC_NORMING_FLAGS.md).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  onDocumentDeleted,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { refreshGoogleAccessTokenForUid } from './googleOAuth';
import {
  isGlobalFeatureGranted,
  QUIZ_MEDIA_GOOGLE_SECRETS,
  QUIZ_MEDIA_STORAGE_ROOT,
} from './quizMediaArchive';
import { downloadDriveFileById } from './getQuizArtifactPlaybackUrl';
import { withQuizSessionContent } from './quizSessionContent';
import './functionsInit';

type Firestore = admin.firestore.Firestore;
type Data = Record<string, unknown>;

export const PLC_NORMING_FEATURE_ID = 'plc-norming-flags';
export const NORMING_LEVELS = ['high', 'medium', 'low', 'review'] as const;
export type NormingLevel = (typeof NORMING_LEVELS)[number];
export const NORMING_MEDIA_ROOT = 'plc_norming_media';
export const NORMING_SOURCES = 'plc_norming_sources';
export const MAX_NORMING_TEXT = 20_000;
export const MAX_NORMING_AUDIO_BYTES = 8 * 1024 * 1024;

export type NormingRequest =
  | {
      mode: 'answer';
      sessionId: string;
      responseKey: string;
      questionId: string;
      slot: 'primary' | 'addendum';
      level: NormingLevel | null;
    }
  | { mode: 'copy'; plcId: string; normingId: string };

export interface NormingResult {
  normingId: string | null;
  level: NormingLevel | null;
}

export interface NormingDeps {
  db: Firestore;
  isFeatureGranted: (uid: string, email: string | null) => Promise<boolean>;
  newId: () => string;
  now: () => number;
  /** Null when the transit object is gone (archived or never uploaded). */
  readTransit: (storagePath: string) => Promise<Buffer | null>;
  readDrive: (teacherUid: string, fileId: string) => Promise<Buffer>;
  /** Re-encodes to m4a with all container metadata dropped. */
  stripAudio: (bytes: Buffer) => Promise<Buffer>;
  saveAudio: (storagePath: string, bytes: Buffer) => Promise<void>;
  deleteAudio: (storagePath: string) => Promise<void>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function isLevel(v: unknown): v is NormingLevel {
  return (NORMING_LEVELS as readonly unknown[]).includes(v);
}

export function parseNormingRequest(raw: unknown): NormingRequest {
  const d = (raw ?? {}) as Data;
  const read = (k: string) => str(d[k]).trim();
  const bad = (msg: string) => new HttpsError('invalid-argument', msg);
  const ids = (vals: string[]) => {
    if (vals.some((v) => !v || v.includes('/') || v.length > 200)) {
      throw bad('Malformed identifier.');
    }
  };
  if (read('normingId')) {
    if (d.level !== null) throw bad('A copy can only be removed.');
    ids([read('plcId'), read('normingId')]);
    return { mode: 'copy', plcId: read('plcId'), normingId: read('normingId') };
  }
  ids([read('sessionId'), read('responseKey'), read('questionId')]);
  const slot = read('slot') || 'primary';
  if (slot !== 'primary' && slot !== 'addendum') throw bad('Unknown slot.');
  if (d.level !== null && !isLevel(d.level)) throw bad('Unknown level.');
  return {
    mode: 'answer',
    sessionId: read('sessionId'),
    responseKey: read('responseKey'),
    questionId: read('questionId'),
    slot,
    level: d.level,
  };
}

/** Private pointer id; one flag per teacher per answer slot. */
export function normingSourceId(
  uid: string,
  sessionId: string,
  responseKey: string,
  questionId: string,
  slot: string
): string {
  return createHash('sha256')
    .update([uid, sessionId, responseKey, questionId, slot].join('\u0000'))
    .digest('hex');
}

/** Mirrors `plcCanEditContent` in firestore.rules: members except viewers. */
export function canFlagInPlc(plc: Data | undefined, uid: string): boolean {
  if (!plc) return false;
  const memberUids = Array.isArray(plc.memberUids) ? plc.memberUids : [];
  if (!memberUids.includes(uid)) return false;
  const members = (plc.members ?? {}) as Record<string, Data>;
  const entry = members[uid];
  if (!entry) return true;
  return entry.role !== 'viewer' && entry.status !== 'removed';
}

export function flaggerName(plc: Data, uid: string): string {
  const entry = ((plc.members ?? {}) as Record<string, Data>)[uid];
  const emails = (plc.memberEmails ?? {}) as Data;
  return (
    str(entry?.displayName).trim() ||
    str(entry?.email) ||
    str(emails[uid]) ||
    'A teammate'
  );
}

export type NormingContent =
  | {
      kind: 'text';
      questionIndex: number;
      questionText: string;
      answerText: string;
      truncated: boolean;
    }
  | {
      kind: 'audio';
      questionIndex: number;
      questionText: string;
      artifactId: string;
      storagePath: string | null;
      driveFileId: string | null;
      durationMs: number | null;
    };

interface StoredAnswer {
  questionId?: unknown;
  answer?: unknown;
  status?: unknown;
  unresponded?: unknown;
  takeIndex?: unknown;
  artifacts?: unknown;
}

const notAvailable = (msg: string) =>
  new HttpsError('failed-precondition', msg);

/** Picks what to copy from the answer, deriving everything from stored data. */
export function extractNormingContent(
  session: Data,
  response: Data,
  sessionId: string,
  responseKey: string,
  questionId: string,
  slot: 'primary' | 'addendum'
): NormingContent {
  const questions = Array.isArray(session.publicQuestions)
    ? (session.publicQuestions as Data[])
    : [];
  const questionIndex = questions.findIndex((q) => q?.id === questionId);
  const question = questions[questionIndex];
  if (!question || question.type !== 'free-response') {
    throw notAvailable('Only written or spoken answers can be flagged.');
  }
  const questionText = str(question.text);
  const answers = (
    Array.isArray(response.answers) ? response.answers : []
  ) as StoredAnswer[];
  const takes = answers.filter(
    (a) =>
      a?.questionId === questionId &&
      a.status !== 'draft' &&
      a.unresponded == null
  );
  if (takes.length === 0) throw notAvailable('This answer was not submitted.');
  const take = takes.reduce((best, a) =>
    (typeof a.takeIndex === 'number' ? a.takeIndex : 0) >
    (typeof best.takeIndex === 'number' ? best.takeIndex : 0)
      ? a
      : best
  );
  const artifacts = (
    Array.isArray(take.artifacts) ? take.artifacts : []
  ) as Data[];
  const inSlot = (a: Data) => (str(a?.slot) || 'primary') === slot;
  const audio = artifacts.find((a) => a?.kind === 'audio' && inSlot(a));
  if (audio && typeof audio.id === 'string') {
    const archive = ((response.artifactArchive ?? {}) as Record<string, Data>)[
      audio.id
    ];
    const status = archive?.archiveStatus;
    if (
      status === 'deleting' ||
      status === 'deleted' ||
      status === 'delete-failed'
    ) {
      throw notAvailable('This recording was deleted.');
    }
    const transitPrefix = `${QUIZ_MEDIA_STORAGE_ROOT}/${sessionId}/${responseKey}/`;
    const storagePath = str(audio.storagePath);
    return {
      kind: 'audio',
      questionIndex,
      questionText,
      artifactId: audio.id,
      storagePath: storagePath.startsWith(transitPrefix) ? storagePath : null,
      driveFileId:
        status === 'archived' && typeof archive?.driveFileId === 'string'
          ? archive.driveFileId
          : null,
      durationMs:
        typeof audio.durationMs === 'number' &&
        Number.isFinite(audio.durationMs)
          ? audio.durationMs
          : null,
    };
  }
  const textArtifact = artifacts.find((a) => a?.kind === 'text' && inSlot(a));
  const raw =
    slot === 'primary' && str(take.answer).trim()
      ? str(take.answer)
      : str(textArtifact?.text);
  const text = raw.trim();
  if (!text) throw notAvailable('This answer is empty.');
  return {
    kind: 'text',
    questionIndex,
    questionText,
    answerText: text.slice(0, MAX_NORMING_TEXT),
    truncated: text.length > MAX_NORMING_TEXT,
  };
}

async function findLiveAssessmentId(
  db: Firestore,
  plcId: string,
  syncGroupId: string
): Promise<string | null> {
  const snap = await db
    .collection('plcs')
    .doc(plcId)
    .collection('assessments')
    .where('syncGroupId', '==', syncGroupId)
    .get();
  const live = snap.docs
    .filter((d) => d.data().deletedAt == null)
    .map((d) => d.id)
    .sort();
  return live[0] ?? null;
}

async function loadAudio(
  deps: NormingDeps,
  content: Extract<NormingContent, { kind: 'audio' }>,
  teacherUid: string
): Promise<Buffer> {
  let bytes: Buffer | null = null;
  if (content.storagePath) bytes = await deps.readTransit(content.storagePath);
  if (!bytes && content.driveFileId) {
    try {
      bytes = await deps.readDrive(teacherUid, content.driveFileId);
    } catch (err) {
      logger.warn('plcNorming: Drive read failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new HttpsError('unavailable', 'Could not load this recording.');
    }
  }
  if (!bytes)
    throw notAvailable('This recording is still saving. Try again shortly.');
  if (bytes.byteLength > MAX_NORMING_AUDIO_BYTES) {
    throw notAvailable('This recording is too long to share.');
  }
  return deps.stripAudio(bytes);
}

async function removeCopy(
  deps: NormingDeps,
  plcId: string,
  normingId: string,
  sourceRef: admin.firestore.DocumentReference | null
): Promise<void> {
  const copyRef = deps.db.doc(`plcs/${plcId}/norming/${normingId}`);
  const copy = await copyRef.get();
  const audioPath = str(copy.data()?.audioPath);
  await deps.db.runTransaction((tx) => {
    tx.delete(copyRef);
    if (sourceRef) tx.delete(sourceRef);
    return Promise.resolve();
  });
  if (audioPath) await deps.deleteAudio(audioPath);
}

export async function setPlcNormingFlag(
  req: NormingRequest,
  callerUid: string,
  callerEmail: string | null,
  deps: NormingDeps
): Promise<NormingResult> {
  const { db } = deps;
  if (!(await deps.isFeatureGranted(callerUid, callerEmail))) {
    throw new HttpsError('permission-denied', 'Norming flags are not enabled.');
  }

  if (req.mode === 'copy') {
    const copy = await db
      .doc(`plcs/${req.plcId}/norming/${req.normingId}`)
      .get();
    if (!copy.exists) return { normingId: null, level: null };
    if (copy.data()?.flaggedByUid !== callerUid) {
      throw new HttpsError(
        'permission-denied',
        'Only the teacher who flagged this can remove it.'
      );
    }
    const sources = await db
      .collection(NORMING_SOURCES)
      .where('flaggedByUid', '==', callerUid)
      .where('normingId', '==', req.normingId)
      .get();
    await removeCopy(deps, req.plcId, req.normingId, null);
    await Promise.all(sources.docs.map((d) => d.ref.delete()));
    return { normingId: null, level: null };
  }

  const sessionRef = db.collection('quiz_sessions').doc(req.sessionId);
  const sessionSnap = await sessionRef.get();
  const rawSession = sessionSnap.data();
  if (!sessionSnap.exists || !rawSession) {
    throw new HttpsError('not-found', 'Quiz session not found.');
  }
  if (rawSession.teacherUid !== callerUid) {
    throw new HttpsError(
      'permission-denied',
      'Only the assigning teacher can flag answers.'
    );
  }
  const plcId = str(rawSession.plcId);
  const syncGroupId = str(rawSession.syncGroupId);
  if (!plcId || !syncGroupId) {
    throw notAvailable('This quiz is not shared with a PLC.');
  }
  const plcRef = db.collection('plcs').doc(plcId);
  const plc = (await plcRef.get()).data();
  if (!plc || !canFlagInPlc(plc, callerUid)) {
    throw new HttpsError(
      'permission-denied',
      'You are not an editing member of this PLC.'
    );
  }
  const assessmentId = await findLiveAssessmentId(db, plcId, syncGroupId);
  if (!assessmentId)
    throw notAvailable('This PLC has no assessment for this quiz yet.');

  const sourceRef = db
    .collection(NORMING_SOURCES)
    .doc(
      normingSourceId(
        callerUid,
        req.sessionId,
        req.responseKey,
        req.questionId,
        req.slot
      )
    );
  const source = (await sourceRef.get()).data();
  const existingId = str(source?.normingId);
  const existingPlc = str(source?.plcId);

  if (req.level === null) {
    if (existingId)
      await removeCopy(deps, existingPlc || plcId, existingId, sourceRef);
    return { normingId: null, level: null };
  }

  if (existingId) {
    const copyRef = db.doc(`plcs/${existingPlc}/norming/${existingId}`);
    if ((await copyRef.get()).exists) {
      const updatedAt = deps.now();
      await db.runTransaction((tx) => {
        tx.update(copyRef, { level: req.level, updatedAt });
        tx.update(sourceRef, { level: req.level });
        return Promise.resolve();
      });
      return { normingId: existingId, level: req.level };
    }
    await sourceRef.delete();
  }

  const responseSnap = await sessionRef
    .collection('responses')
    .doc(req.responseKey)
    .get();
  if (!responseSnap.exists)
    throw new HttpsError('not-found', 'Response not found.');
  const session = await withQuizSessionContent(sessionRef, rawSession);
  const content = extractNormingContent(
    session,
    responseSnap.data() ?? {},
    req.sessionId,
    req.responseKey,
    req.questionId,
    req.slot
  );

  const normingId = deps.newId();
  const audioPath =
    content.kind === 'audio'
      ? `${NORMING_MEDIA_ROOT}/${plcId}/${normingId}.m4a`
      : null;
  if (content.kind === 'audio' && audioPath) {
    const bytes = await loadAudio(deps, content, callerUid);
    await deps.saveAudio(audioPath, bytes);
  }

  const now = deps.now();
  const copy: Data = {
    id: normingId,
    assessmentId,
    questionId: req.questionId,
    questionIndex: content.questionIndex,
    questionText: content.questionText,
    level: req.level,
    kind: content.kind,
    ...(content.kind === 'text'
      ? { answerText: content.answerText, truncated: content.truncated }
      : {
          audioPath,
          mimeType: 'audio/mp4',
          ...(content.durationMs !== null
            ? { durationMs: content.durationMs }
            : {}),
        }),
    flaggedByUid: callerUid,
    flaggedByName: flaggerName(plc, callerUid),
    createdAt: now,
    updatedAt: now,
  };

  let winner: string | null = null;
  try {
    winner = await db.runTransaction(async (tx) => {
      const [plcNow, assessmentNow, sourceNow] = await Promise.all([
        tx.get(plcRef),
        tx.get(db.doc(`plcs/${plcId}/assessments/${assessmentId}`)),
        tx.get(sourceRef),
      ]);
      if (!canFlagInPlc(plcNow.data(), callerUid)) {
        throw new HttpsError(
          'permission-denied',
          'You are no longer an editing member of this PLC.'
        );
      }
      if (!assessmentNow.exists || assessmentNow.data()?.deletedAt != null) {
        throw notAvailable('This PLC assessment was removed.');
      }
      const raced = str(sourceNow.data()?.normingId);
      if (raced) return raced;
      tx.set(db.doc(`plcs/${plcId}/norming/${normingId}`), copy);
      tx.set(sourceRef, {
        normingId,
        plcId,
        flaggedByUid: callerUid,
        sessionId: req.sessionId,
        responseKey: req.responseKey,
        questionId: req.questionId,
        slot: req.slot,
        level: req.level,
        createdAt: now,
      });
      return null;
    });
  } catch (err) {
    if (audioPath) await deps.deleteAudio(audioPath);
    throw err;
  }
  if (winner) {
    if (audioPath) await deps.deleteAudio(audioPath);
    return { normingId: winner, level: req.level };
  }
  return { normingId, level: req.level };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export interface CleanupDeps {
  db: Firestore;
  deleteAudio: (storagePath: string) => Promise<void>;
  deleteAudioPrefix: (prefix: string) => Promise<void>;
}

/** Uids present in `before.memberUids` but not `after.memberUids`. */
export function departedMemberUids(
  before: Data | undefined,
  after: Data | undefined
): string[] {
  const list = (d: Data | undefined) =>
    Array.isArray(d?.memberUids)
      ? (d.memberUids as unknown[]).filter(
          (u): u is string => typeof u === 'string'
        )
      : [];
  const kept = new Set(list(after));
  return list(before).filter((u) => !kept.has(u));
}

async function deleteCopies(
  deps: CleanupDeps,
  docs: admin.firestore.QueryDocumentSnapshot[]
): Promise<void> {
  for (const d of docs) {
    const audioPath = str(d.data().audioPath);
    if (audioPath) await deps.deleteAudio(audioPath);
    await d.ref.delete();
  }
}

/** Deletes a departed teacher's copies, pointers and audio in one PLC. */
export async function cleanupNormingForMembers(
  deps: CleanupDeps,
  plcId: string,
  uids: string[]
): Promise<void> {
  const { db } = deps;
  for (const uid of uids) {
    const copies = await db
      .collection('plcs')
      .doc(plcId)
      .collection('norming')
      .where('flaggedByUid', '==', uid)
      .get();
    await deleteCopies(deps, copies.docs);
    const sources = await db
      .collection(NORMING_SOURCES)
      .where('flaggedByUid', '==', uid)
      .where('plcId', '==', plcId)
      .get();
    await Promise.all(sources.docs.map((d) => d.ref.delete()));
  }
}

export async function cleanupNormingForPlc(
  deps: CleanupDeps,
  plcId: string
): Promise<void> {
  const { db } = deps;
  const copies = await db
    .collection('plcs')
    .doc(plcId)
    .collection('norming')
    .get();
  await Promise.all(copies.docs.map((d) => d.ref.delete()));
  await deps.deleteAudioPrefix(`${NORMING_MEDIA_ROOT}/${plcId}/`);
  const sources = await db
    .collection(NORMING_SOURCES)
    .where('plcId', '==', plcId)
    .get();
  await Promise.all(sources.docs.map((d) => d.ref.delete()));
}

/** Voice identifies a student, so audio copies of their answers go; text copies stay. */
export async function cleanupNormingForResponse(
  deps: CleanupDeps,
  sessionId: string,
  responseKey: string,
  questionId?: string
): Promise<void> {
  const { db } = deps;
  const sources = await db
    .collection(NORMING_SOURCES)
    .where('sessionId', '==', sessionId)
    .where('responseKey', '==', responseKey)
    .get();
  for (const s of sources.docs) {
    const src = s.data();
    if (questionId && src.questionId !== questionId) continue;
    const copyRef = db.doc(
      `plcs/${str(src.plcId)}/norming/${str(src.normingId)}`
    );
    const copy = (await copyRef.get()).data();
    if (copy?.kind === 'audio') {
      if (str(copy.audioPath)) await deps.deleteAudio(str(copy.audioPath));
      await copyRef.delete();
    }
    if (!questionId || copy?.kind === 'audio') await s.ref.delete();
  }
}

export async function cleanupNormingSourcesForSession(
  deps: CleanupDeps,
  sessionId: string
): Promise<void> {
  const sources = await deps.db
    .collection(NORMING_SOURCES)
    .where('sessionId', '==', sessionId)
    .get();
  await Promise.all(sources.docs.map((d) => d.ref.delete()));
}

// ── Default deps + entry points ─────────────────────────────────────────────

async function stripAudioMetadata(input: Buffer): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'norming-'));
  const inputPath = path.join(dir, 'in.bin');
  const outputPath = path.join(dir, 'out.m4a');
  try {
    await fs.writeFile(inputPath, input);
    if (!ffmpegStatic) throw new Error('ffmpeg-static binary missing');
    ffmpeg.setFfmpegPath(ffmpegStatic);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec('aac')
        .audioBitrate('64k')
        .format('mp4')
        .outputOptions(
          '-map_metadata',
          '-1',
          '-map_chapters',
          '-1',
          '-movflags',
          '+faststart'
        )
        .on('error', (err: Error) => reject(err))
        .on('end', () => resolve())
        .save(outputPath);
    });
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function isNotFound(err: unknown): boolean {
  return (err as { code?: unknown })?.code === 404;
}

function defaultCleanupDeps(): CleanupDeps {
  const bucket = admin.storage().bucket();
  return {
    db: admin.firestore(),
    deleteAudio: async (p) => {
      await bucket.file(p).delete({ ignoreNotFound: true });
    },
    deleteAudioPrefix: async (prefix) => {
      await bucket.deleteFiles({ prefix, force: true });
    },
  };
}

function defaultNormingDeps(): NormingDeps {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  return {
    db,
    isFeatureGranted: (uid, email) =>
      isGlobalFeatureGranted(db, PLC_NORMING_FEATURE_ID, email, uid),
    newId: () => db.collection(NORMING_SOURCES).doc().id,
    now: () => Date.now(),
    readTransit: async (p) => {
      try {
        const [bytes] = await bucket.file(p).download();
        return bytes;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    readDrive: async (teacherUid, fileId) => {
      const { accessToken } = await refreshGoogleAccessTokenForUid(teacherUid);
      return downloadDriveFileById(accessToken, fileId);
    },
    stripAudio: stripAudioMetadata,
    saveAudio: async (p, bytes) => {
      await bucket
        .file(p)
        .save(bytes, { contentType: 'audio/mp4', resumable: false });
    },
    deleteAudio: async (p) => {
      await bucket.file(p).delete({ ignoreNotFound: true });
    },
  };
}

export const setPlcNormingFlagV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: ALLOWED_ORIGINS,
    secrets: QUIZ_MEDIA_GOOGLE_SECRETS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    const email =
      typeof request.auth.token.email === 'string'
        ? request.auth.token.email
        : null;
    return setPlcNormingFlag(
      parseNormingRequest(request.data),
      request.auth.uid,
      email,
      defaultNormingDeps()
    );
  }
);

export const cleanupPlcNormingOnMembership = onDocumentWritten(
  { document: 'plcs/{plcId}', memory: '256MiB', maxInstances: 5 },
  async (event) => {
    const { plcId } = event.params;
    const before = event.data?.before;
    const after = event.data?.after;
    if (!before?.exists) return;
    try {
      if (!after?.exists) {
        await cleanupNormingForPlc(defaultCleanupDeps(), plcId);
        return;
      }
      const gone = departedMemberUids(before.data(), after.data());
      if (gone.length > 0)
        await cleanupNormingForMembers(defaultCleanupDeps(), plcId, gone);
    } catch (err) {
      logger.error('cleanupPlcNormingOnMembership failed', {
        plcId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
);

export const cleanupPlcNormingOnResponseDelete = onDocumentDeleted(
  {
    document: 'quiz_sessions/{sessionId}/responses/{responseKey}',
    memory: '256MiB',
    maxInstances: 5,
  },
  async (event) => {
    await cleanupNormingForResponse(
      defaultCleanupDeps(),
      event.params.sessionId,
      event.params.responseKey
    );
  }
);

export const cleanupPlcNormingOnSessionDelete = onDocumentDeleted(
  { document: 'quiz_sessions/{sessionId}', memory: '256MiB', maxInstances: 5 },
  async (event) => {
    await cleanupNormingSourcesForSession(
      defaultCleanupDeps(),
      event.params.sessionId
    );
  }
);
