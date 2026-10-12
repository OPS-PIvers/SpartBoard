// PLC meeting notes: request, queue trigger and draft resolve (docs/plans/shipped/PLC_MEETING_RECORDING.md, phase 2).
import './functionsInit';
import { ANTHROPIC_API_KEY } from './secrets';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { ThinkingLevel } from '@google/genai';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  enforceAiFeatureAccess,
  recordAiUsage,
  refundAiUsage,
  resolveCallerIsAdmin,
  type AiUsageCharge,
} from './aiGeneration';
import { generateAi, type AiPart } from './aiRouter';
import {
  buildDraftActionItems,
  buildSummarizePrompt,
  parseSummaryResponse,
  parseTranscriptResponse,
  sectionsToMarkdown,
  SUMMARIZE_SCHEMA,
  SUMMARIZE_SYSTEM_PROMPT,
  TRANSCRIBE_SCHEMA,
  TRANSCRIBE_SYSTEM_PROMPT,
  type DraftActionItem,
  type GroupMember,
  type MeetingNotesSections,
  type TranscriptSegment,
} from './plcMeetingNotesAi';
import { assertViewAsAllowed } from './viewAsGuard';

type Firestore = admin.firestore.Firestore;
type Data = Record<string, unknown>;
type Token = { email?: string; email_verified?: boolean };

export const PLC_MEETING_AI_FEATURE_ID = 'plc-meeting-ai-notes';
export const TRANSCRIBE_DAILY_LIMIT = 3;
export const REGENERATE_DAILY_LIMIT = 10;
// A run that has not finished in this long (function timeout plus margin) may be requested again.
export const STALE_JOB_MS = 12 * 60 * 1000;
export const AUDIO_PREFIX = 'plc_meeting_audio';

export type NotesMode = 'transcribe' | 'regenerate';
export type NotesJob = 'transcribe' | 'summarize';

export interface NotesRequest {
  plcId: string;
  recordingId: string;
  mode: NotesMode;
}

export interface ResolveRequest {
  plcId: string;
  recordingId: string;
  generatedAt: number;
  action: 'inserted' | 'dismissed' | 'reopen';
}

export interface MeetingNotesDeps {
  db: Firestore;
  now: () => number;
  newId: () => string;
  isAdmin: (token: Token) => Promise<boolean>;
  charge: (
    token: Token,
    uid: string,
    mode: NotesMode
  ) => Promise<AiUsageCharge>;
  refund: (charge: AiUsageCharge) => Promise<void>;
  /** Counts an admin's request with no limit checks. */
  record: (
    token: Token,
    uid: string,
    mode: NotesMode
  ) => Promise<AiUsageCharge>;
}

export interface JobDeps extends MeetingNotesDeps {
  /** Returns a gs:// URI of the whole recording as one file, and a cleanup for any temp file it made. */
  prepareAudio: (
    plcId: string,
    recordingId: string,
    partCount: number
  ) => Promise<{ uri: string; cleanup: () => Promise<void> }>;
  transcribe: (uri: string) => Promise<TranscriptSegment[]>;
  summarize: (segments: TranscriptSegment[]) => Promise<MeetingNotesSections>;
  deleteAudio: (plcId: string, recordingId: string) => Promise<void>;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const bad = (msg: string) => new HttpsError('invalid-argument', msg);
const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

function readId(d: Data, key: string): string {
  const v = str(d[key]).trim();
  if (!v || v.includes('/') || v.length > 200) {
    throw bad('Malformed identifier.');
  }
  return v;
}

export function parseNotesRequest(raw: unknown): NotesRequest {
  const d = (raw ?? {}) as Data;
  const mode = d.mode;
  if (mode !== 'transcribe' && mode !== 'regenerate') {
    throw bad('Unknown mode.');
  }
  return {
    plcId: readId(d, 'plcId'),
    recordingId: readId(d, 'recordingId'),
    mode,
  };
}

export function parseResolveRequest(raw: unknown): ResolveRequest {
  const d = (raw ?? {}) as Data;
  const action = d.action;
  if (action !== 'inserted' && action !== 'dismissed' && action !== 'reopen') {
    throw bad('Unknown action.');
  }
  if (typeof d.generatedAt !== 'number') throw bad('Missing draft version.');
  return {
    plcId: readId(d, 'plcId'),
    recordingId: readId(d, 'recordingId'),
    generatedAt: d.generatedAt,
    action,
  };
}

/** Mirrors `plcCanEditContent` in firestore.rules: members except viewers. */
export function canEditPlc(plc: Data | undefined, uid: string): boolean {
  if (!plc) return false;
  const memberUids = Array.isArray(plc.memberUids) ? plc.memberUids : [];
  if (!memberUids.includes(uid)) return false;
  const entry = ((plc.members ?? {}) as Record<string, Data>)[uid];
  if (!entry) return true;
  return entry.role !== 'viewer' && entry.status !== 'removed';
}

export function groupMembers(plc: Data | undefined): GroupMember[] {
  const members = (plc?.members ?? {}) as Record<string, Data>;
  return Object.entries(members)
    .filter(([, m]) => m && m.status !== 'removed')
    .map(([uid, m]) => ({ uid, name: str(m.displayName).trim() }))
    .filter((m) => m.name);
}

const recordingRef = (db: Firestore, plcId: string, recordingId: string) =>
  db.collection('plcs').doc(plcId).collection('recordings').doc(recordingId);

const transcriptRef = (db: Firestore, plcId: string, recordingId: string) =>
  recordingRef(db, plcId, recordingId).collection('transcript').doc('main');

// One doc per queued step so the trigger fires only for real work, never for recorder heartbeats.
const jobRef = (
  db: Firestore,
  plcId: string,
  recordingId: string,
  jobId: string
) => recordingRef(db, plcId, recordingId).collection('notesJobs').doc(jobId);

const isStaleJob = (rec: Data, now: number) =>
  (rec.status === 'queued' || rec.status === 'transcribing') &&
  now - num(rec.jobUpdatedAt) > STALE_JOB_MS;

/** Why this recording can't start the requested run, or null when it can. */
export function notesBlocker(
  rec: Data | undefined,
  mode: NotesMode,
  now: number
): string | null {
  if (!rec) return 'This recording no longer exists.';
  const status = str(rec.status);
  const settled =
    status === 'ready' || status === 'transcribed' || status === 'failed';
  if (!settled && !isStaleJob(rec, now)) {
    return status === 'queued' || status === 'transcribing'
      ? 'Notes are already being made for this recording.'
      : 'This recording is not finished yet.';
  }
  if (mode === 'regenerate') {
    return rec.hasTranscript === true
      ? null
      : 'This recording has no transcript yet.';
  }
  if (rec.hasTranscript === true)
    return 'This recording already has a transcript.';
  if (rec.audioDeletedAt) return 'The audio for this recording was deleted.';
  return null;
}

async function loadEditablePlc(
  db: Firestore,
  plcId: string,
  uid: string
): Promise<Data> {
  const snap = await db.collection('plcs').doc(plcId).get();
  const plc = snap.data();
  if (!snap.exists || !plc || !canEditPlc(plc, uid)) {
    throw new HttpsError(
      'permission-denied',
      'Only editors of this group can do that.'
    );
  }
  return plc;
}

async function queueJob(
  deps: MeetingNotesDeps,
  req: NotesRequest,
  uid: string,
  charge: AiUsageCharge | null
): Promise<void> {
  const ref = recordingRef(deps.db, req.plcId, req.recordingId);
  const now = deps.now();
  let staleCharge: AiUsageCharge | null = null;
  await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const rec = snap.data();
    const blocker = notesBlocker(rec, req.mode, now);
    if (blocker) throw new HttpsError('failed-precondition', blocker);
    if (rec && isStaleJob(rec, now)) staleCharge = readCharge(rec.quotaCharge);
    const jobId = deps.newId();
    const job: NotesJob =
      req.mode === 'transcribe' ? 'transcribe' : 'summarize';
    tx.set(jobRef(deps.db, req.plcId, req.recordingId, jobId), {
      job,
      createdAt: now,
    });
    tx.update(ref, {
      status: 'queued',
      job,
      jobId,
      jobUpdatedAt: now,
      requestedBy: uid,
      error: null,
      quotaCharge: charge,
    });
  });
  if (staleCharge) await deps.refund(staleCharge).catch(() => undefined);
}

/** Queues a transcription or a regenerate; any editor may ask (MR-D14, MR-D15). */
export async function requestMeetingNotes(
  req: NotesRequest,
  uid: string,
  token: Token,
  deps: MeetingNotesDeps
): Promise<{ status: 'queued' }> {
  await loadEditablePlc(deps.db, req.plcId, uid);
  const pre = await recordingRef(deps.db, req.plcId, req.recordingId).get();
  const blocker = notesBlocker(pre.data(), req.mode, deps.now());
  if (blocker) throw new HttpsError('failed-precondition', blocker);
  const charge = (await deps.isAdmin(token))
    ? await deps.record(token, uid, req.mode)
    : await deps.charge(token, uid, req.mode);
  try {
    await queueJob(deps, req, uid, charge);
  } catch (err) {
    if (charge) await deps.refund(charge).catch(() => undefined);
    throw err;
  }
  return { status: 'queued' };
}

/** Called by finalize after Stop: queues a transcription when the recorder has AI access, else leaves it ready (MR-D14). */
export async function autoQueueMeetingNotes(
  plcId: string,
  recordingId: string,
  uid: string,
  token: Token,
  deps: MeetingNotesDeps = defaultDeps()
): Promise<boolean> {
  try {
    await requestMeetingNotes(
      { plcId, recordingId, mode: 'transcribe' },
      uid,
      token,
      deps
    );
    return true;
  } catch (err) {
    logger.info('Meeting notes not queued after finalize', {
      plcId,
      recordingId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function readCharge(v: unknown): AiUsageCharge | null {
  const ids = (v as { docIds?: unknown } | null)?.docIds;
  return Array.isArray(ids) && ids.every((i) => typeof i === 'string')
    ? { docIds: ids }
    : null;
}

const FAILED_MESSAGE = "Couldn't make notes from this recording.";

/** Claims a queued job; returns its job name, or null if another run already took it. */
async function claimJob(
  deps: JobDeps,
  plcId: string,
  recordingId: string,
  jobId: string
): Promise<NotesJob | null> {
  const ref = recordingRef(deps.db, plcId, recordingId);
  return deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data();
    if (!rec || rec.status !== 'queued' || rec.jobId !== jobId) return null;
    const job = rec.job === 'summarize' ? 'summarize' : 'transcribe';
    tx.update(ref, { status: 'transcribing', jobUpdatedAt: deps.now() });
    return job;
  });
}

async function failJob(
  deps: JobDeps,
  plcId: string,
  recordingId: string,
  jobId: string,
  err: unknown
): Promise<void> {
  logger.error('Meeting notes job failed', {
    plcId,
    recordingId,
    error: err instanceof Error ? err.message : String(err),
  });
  const ref = recordingRef(deps.db, plcId, recordingId);
  let charge: AiUsageCharge | null = null;
  await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data();
    if (!rec || rec.jobId !== jobId) return;
    charge = readCharge(rec.quotaCharge);
    tx.update(ref, {
      status: 'failed',
      job: null,
      jobUpdatedAt: deps.now(),
      error: FAILED_MESSAGE,
      quotaCharge: null,
    });
  });
  if (charge) await deps.refund(charge);
}

async function runTranscribe(
  deps: JobDeps,
  plcId: string,
  recordingId: string,
  jobId: string,
  rec: Data
): Promise<void> {
  const partCount = Array.isArray(rec.parts) ? rec.parts.length : 0;
  if (partCount === 0) throw new Error('Recording has no audio parts.');
  const audio = await deps.prepareAudio(plcId, recordingId, partCount);
  let segments: TranscriptSegment[];
  try {
    segments = await deps.transcribe(audio.uri);
  } finally {
    await audio.cleanup().catch(() => undefined);
  }
  if (segments.length === 0) throw new Error('No speech found.');
  const now = deps.now();
  const ref = recordingRef(deps.db, plcId, recordingId);
  await transcriptRef(deps.db, plcId, recordingId).set({
    segments,
    generatedAt: now,
  });
  // The summarize step runs as its own trigger so each Gemini call gets the full timeout.
  await deps.db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data();
    if (!cur || cur.jobId !== jobId) return;
    const nextId = deps.newId();
    tx.set(jobRef(deps.db, plcId, recordingId, nextId), {
      job: 'summarize',
      createdAt: now,
    });
    tx.update(ref, {
      hasTranscript: true,
      status: 'queued',
      job: 'summarize',
      jobId: nextId,
      jobUpdatedAt: now,
    });
  });
}

async function runSummarize(
  deps: JobDeps,
  plcId: string,
  recordingId: string,
  jobId: string,
  rec: Data
): Promise<void> {
  const transcript = (
    await transcriptRef(deps.db, plcId, recordingId).get()
  ).data();
  const segments = (
    Array.isArray(transcript?.segments) ? transcript.segments : []
  ) as TranscriptSegment[];
  if (segments.length === 0) throw new Error('Transcript is empty.');
  const plc = (await deps.db.collection('plcs').doc(plcId).get()).data();
  const sections = await deps.summarize(segments);
  const actionItems: DraftActionItem[] = buildDraftActionItems(
    sections,
    groupMembers(plc),
    deps.newId
  );
  const markdown = sectionsToMarkdown(sections);
  if (!markdown && actionItems.length === 0) {
    throw new Error('Summary came back empty.');
  }
  const now = deps.now();
  const ref = recordingRef(deps.db, plcId, recordingId);
  const hadAudio = !rec.audioDeletedAt;
  const applied = await deps.db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data();
    if (!cur || cur.jobId !== jobId) return false;
    tx.update(ref, {
      status: 'transcribed',
      job: null,
      jobUpdatedAt: now,
      error: null,
      quotaCharge: null,
      draft: {
        markdown,
        actionItems,
        generatedAt: now,
        generatedBy: str(cur.requestedBy),
        source: 'gemini',
      },
      draftResolvedAt: null,
      draftResolution: null,
      draftResolvedBy: null,
      ...(hadAudio
        ? {
            audioDeletedAt: now,
            audioDeletedReason: 'transcribed',
            audioExpiresAt: null,
          }
        : {}),
    });
    return true;
  });
  // MR-D9: the audio goes as soon as the transcript and the draft are saved.
  if (applied && hadAudio) await deps.deleteAudio(plcId, recordingId);
}

/** Runs one queued step for a recording; safe to re-deliver because the claim is transactional. */
export async function runMeetingNotesJob(
  deps: JobDeps,
  plcId: string,
  recordingId: string,
  jobId: string
): Promise<void> {
  try {
    const job = await claimJob(deps, plcId, recordingId, jobId);
    if (!job) return;
    const rec = (await recordingRef(deps.db, plcId, recordingId).get()).data();
    if (!rec) return;
    try {
      if (job === 'transcribe') {
        await runTranscribe(deps, plcId, recordingId, jobId, rec);
      } else {
        await runSummarize(deps, plcId, recordingId, jobId, rec);
      }
    } catch (err) {
      await failJob(deps, plcId, recordingId, jobId, err);
    }
  } finally {
    await jobRef(deps.db, plcId, recordingId, jobId).delete();
  }
}

/** Marks a draft inserted or dismissed; `reopen` undoes the caller's own resolve when their insert failed (MR-D19). */
export async function resolveMeetingNotesDraft(
  req: ResolveRequest,
  uid: string,
  deps: Pick<MeetingNotesDeps, 'db' | 'now'>
): Promise<{ ok: true }> {
  await loadEditablePlc(deps.db, req.plcId, uid);
  const ref = recordingRef(deps.db, req.plcId, req.recordingId);
  await deps.db.runTransaction(async (tx) => {
    const rec = (await tx.get(ref)).data();
    const draft = rec?.draft as Data | null | undefined;
    if (!rec || !draft || num(draft.generatedAt) !== req.generatedAt) {
      throw new HttpsError(
        'failed-precondition',
        'These notes were replaced by a newer draft.'
      );
    }
    if (req.action === 'reopen') {
      if (rec.draftResolvedBy !== uid) {
        throw new HttpsError('failed-precondition', 'Nothing to reopen.');
      }
      tx.update(ref, {
        draftResolvedAt: null,
        draftResolution: null,
        draftResolvedBy: null,
      });
      return;
    }
    if (rec.draftResolvedAt) {
      throw new HttpsError(
        'failed-precondition',
        'Someone already handled these notes.'
      );
    }
    tx.update(ref, {
      draftResolvedAt: deps.now(),
      draftResolution: req.action,
      draftResolvedBy: uid,
    });
  });
  return { ok: true };
}

// ── Default deps + entry points ─────────────────────────────────────────────

const LIMIT_MESSAGE: Record<NotesMode, string> = {
  transcribe: `You can make notes from ${TRANSCRIBE_DAILY_LIMIT} recordings a day. Try again tomorrow.`,
  regenerate: `You can regenerate notes ${REGENERATE_DAILY_LIMIT} times a day. Try again tomorrow.`,
};

/** Admins skip the quota, but a flag switched off still stops them. */
async function adminSkipsQuota(
  db: admin.firestore.Firestore,
  token: Token
): Promise<boolean> {
  if (!(await resolveCallerIsAdmin(db, token))) return false;
  const flags = await Promise.all(
    ['gemini-functions', PLC_MEETING_AI_FEATURE_ID].map((id) =>
      db.collection('global_permissions').doc(id).get()
    )
  );
  return flags.every((d) => d.data()?.enabled !== false);
}

function defaultDeps(): MeetingNotesDeps {
  const db = admin.firestore();
  return {
    db,
    now: () => Date.now(),
    newId: () => db.collection('plcs').doc().id,
    isAdmin: (token) => adminSkipsQuota(db, token),
    charge: (token, uid, mode) =>
      enforceAiFeatureAccess(db, token, uid, PLC_MEETING_AI_FEATURE_ID, false, {
        key: `plc-meeting-${mode}`,
        limit:
          mode === 'transcribe'
            ? TRANSCRIBE_DAILY_LIMIT
            : REGENERATE_DAILY_LIMIT,
        message: LIMIT_MESSAGE[mode],
      }),
    refund: (charge) => refundAiUsage(db, charge),
    record: (token, uid, mode) =>
      recordAiUsage(
        db,
        token,
        uid,
        PLC_MEETING_AI_FEATURE_ID,
        `plc-meeting-${mode}`
      ),
  };
}

const partPath = (plcId: string, recordingId: string, i: number) =>
  `${AUDIO_PREFIX}/${plcId}/${recordingId}/${i}.webm`;

async function concatParts(inputs: string[], output: string): Promise<void> {
  if (!ffmpegStatic) throw new Error('ffmpeg-static binary missing');
  ffmpeg.setFfmpegPath(ffmpegStatic);
  const list = path.join(path.dirname(output), 'list.txt');
  await fs.writeFile(list, inputs.map((p) => `file '${p}'`).join('\n'));
  await new Promise<void>((resolve, reject) => {
    ffmpeg(list)
      .inputOptions('-f', 'concat', '-safe', '0')
      .outputOptions('-c', 'copy')
      .on('error', (err: Error) => reject(err))
      .on('end', () => resolve())
      .save(output);
  });
}

async function generateJson(
  db: admin.firestore.Firestore,
  integration: 'plc-meeting-transcribe' | 'plc-meeting-summary',
  parts: AiPart[],
  systemInstruction: string,
  responseSchema: typeof TRANSCRIBE_SCHEMA
): Promise<string> {
  const result = await generateAi(db, {
    integration,
    parts,
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema,
    thinkingLevel: ThinkingLevel.LOW,
    temperature: 0,
    maxOutputTokens: 65536,
    claudeTimeoutMs: 240_000,
  });
  if (result.stopped !== 'complete') {
    throw new Error(`${result.model} stopped early: ${result.finishReason}`);
  }
  if (!result.text) throw new Error('Empty response from the AI model.');
  return result.text;
}

function defaultJobDeps(): JobDeps {
  const base = defaultDeps();
  const bucket = admin.storage().bucket();
  return {
    ...base,
    prepareAudio: async (plcId, recordingId, partCount) => {
      if (partCount === 1) {
        return {
          uri: `gs://${bucket.name}/${partPath(plcId, recordingId, 0)}`,
          cleanup: () => Promise.resolve(),
        };
      }
      // Gemini takes one audio file per prompt, so parts are joined without re-encoding.
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-'));
      const combinedPath = `${AUDIO_PREFIX}/${plcId}/${recordingId}/combined.webm`;
      try {
        const inputs: string[] = [];
        for (let i = 0; i < partCount; i += 1) {
          const local = path.join(dir, `${i}.webm`);
          await bucket
            .file(partPath(plcId, recordingId, i))
            .download({ destination: local });
          inputs.push(local);
        }
        const output = path.join(dir, 'combined.webm');
        await concatParts(inputs, output);
        await bucket.upload(output, {
          destination: combinedPath,
          contentType: 'audio/webm',
          resumable: false,
        });
      } finally {
        await fs
          .rm(dir, { recursive: true, force: true })
          .catch(() => undefined);
      }
      return {
        uri: `gs://${bucket.name}/${combinedPath}`,
        cleanup: async () => {
          await bucket.file(combinedPath).delete({ ignoreNotFound: true });
        },
      };
    },
    transcribe: async (uri) =>
      parseTranscriptResponse(
        await generateJson(
          base.db,
          'plc-meeting-transcribe',
          [
            { text: 'Transcribe this meeting recording.' },
            { fileData: { fileUri: uri, mimeType: 'audio/webm' } },
          ],
          TRANSCRIBE_SYSTEM_PROMPT,
          TRANSCRIBE_SCHEMA
        )
      ),
    summarize: async (segments) =>
      parseSummaryResponse(
        await generateJson(
          base.db,
          'plc-meeting-summary',
          [{ text: buildSummarizePrompt(segments) }],
          SUMMARIZE_SYSTEM_PROMPT,
          SUMMARIZE_SCHEMA
        )
      ),
    deleteAudio: async (plcId, recordingId) => {
      await bucket.deleteFiles({
        prefix: `${AUDIO_PREFIX}/${plcId}/${recordingId}/`,
        force: true,
      });
    },
  };
}

function requireAuth(request: {
  auth?: { uid: string; token: Token } | null;
}): { uid: string; token: Token } {
  if (!request.auth)
    throw new HttpsError('unauthenticated', 'Sign in required.');
  return { uid: request.auth.uid, token: request.auth.token };
}

export const requestPlcMeetingNotesV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    assertViewAsAllowed(request, { outward: true });
    const { uid, token } = requireAuth(request);
    return requestMeetingNotes(
      parseNotesRequest(request.data),
      uid,
      token,
      defaultDeps()
    );
  }
);

export const resolvePlcMeetingNotesDraftV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    assertViewAsAllowed(request);
    const { uid } = requireAuth(request);
    return resolveMeetingNotesDraft(
      parseResolveRequest(request.data),
      uid,
      defaultDeps()
    );
  }
);

export const runPlcMeetingNotesJob = onDocumentCreated(
  {
    document: 'plcs/{plcId}/recordings/{recordingId}/notesJobs/{jobId}',
    memory: '2GiB',
    timeoutSeconds: 540,
    maxInstances: 10,
    secrets: [ANTHROPIC_API_KEY],
  },
  async (event) => {
    const { plcId, recordingId, jobId } = event.params;
    await runMeetingNotesJob(defaultJobDeps(), plcId, recordingId, jobId);
  }
);
