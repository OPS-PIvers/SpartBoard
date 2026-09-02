/**
 * `getQuizArtifactPlaybackUrl` — serves one student their OWN archived audio
 * take back, after their teacher published results (Brief 3.6).
 *
 * The durable copy lives in the assigning teacher's Drive and is never made
 * public (`makeDriveFilePublic` is not called for quiz media), so playback is
 * proxied: this callable mints the teacher's access token server-side via
 * `refreshGoogleAccessTokenForUid` and returns the audio bytes base64-encoded.
 * Neither a Drive URL nor a bearer token ever reaches the client.
 *
 * Four independent gates, all of which must pass: the fail-closed
 * `quiz-media-response` feature record, the session's `mediaResponseEnabled`
 * marker, the teacher's publish state (`scoreVisibility`, re-read on every
 * call so an unpublish revokes playback with no cleanup step), and ownership
 * (`response.studentUid === request.auth.uid`). Anything unresolvable denies.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { refreshGoogleAccessTokenForUid } from './googleOAuth';
import {
  isQuizMediaResponseGranted,
  QUIZ_MEDIA_ARCHIVE_SECRETS,
} from './quizMediaArchive';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';

type Firestore = admin.firestore.Firestore;

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';

/**
 * Decoded ceiling for one take. A 300 s take at the archive's 64 kbps is
 * ~2.4 MB; base64 inflates ~33%, leaving headroom under the callable response
 * cap. A larger file is reported honestly rather than truncated.
 */
export const MAX_PLAYBACK_BYTES = 4 * 1024 * 1024;

export interface PlaybackRequest {
  sessionId: string;
  responseKey: string;
  questionId: string;
  slot: 'primary' | 'addendum';
}

/** `'not-available'` is an answer, not a failure — a mid-archive take is normal. */
export type PlaybackUnavailableReason =
  | 'archiving'
  | 'failed'
  | 'deleted'
  | 'no-recording'
  | 'too-large';

export type PlaybackResult =
  | {
      status: 'ready';
      artifactId: string;
      takeIndex: number;
      mimeType: string;
      /** Base64 audio bytes; the client turns these into an object URL. */
      data: string;
      durationMs?: number;
    }
  | { status: 'not-available'; reason: PlaybackUnavailableReason };

export interface PlaybackDeps {
  db: Firestore;
  getAccessToken: (teacherUid: string) => Promise<string>;
  downloadDriveFile: (accessToken: string, fileId: string) => Promise<Buffer>;
  isFeatureGranted: (teacherUid: string) => Promise<boolean>;
}

interface StoredArtifact {
  id?: unknown;
  slot?: unknown;
  kind?: unknown;
  mimeType?: unknown;
  durationMs?: unknown;
}

interface StoredAnswer {
  questionId?: unknown;
  takeIndex?: unknown;
  artifacts?: unknown;
}

// ── Pure helpers (exported for tests) ──────────────────────────────────────

/**
 * Composite grading key. The unsuffixed key is the primary slot, matching
 * every `QuizResponse.grading` document written before slots existed.
 */
export function gradingKeyFor(questionId: string, slot: string): string {
  return slot === 'primary' ? questionId : `${questionId}::${slot}`;
}

export interface PlaybackTake {
  artifact: StoredArtifact;
  takeIndex: number;
}

/**
 * The take the grade is about: `gradedTakeIndex` when the teacher pinned one
 * (Brief 3.4), else the highest `takeIndex` — the take scoring reads. Playing
 * a recording the teacher's comments aren't about would be worse than useless.
 */
export function selectPlaybackTake(
  answers: readonly StoredAnswer[],
  questionId: string,
  slot: string,
  gradedTakeIndex?: number
): PlaybackTake | null {
  const candidates: PlaybackTake[] = [];
  for (const answer of answers) {
    if (answer?.questionId !== questionId) continue;
    const artifacts = Array.isArray(answer.artifacts)
      ? (answer.artifacts as StoredArtifact[])
      : [];
    const artifact = artifacts.find(
      (a) => a?.kind === 'audio' && (a?.slot ?? 'primary') === slot
    );
    if (!artifact || typeof artifact.id !== 'string') continue;
    const takeIndex =
      typeof answer.takeIndex === 'number' ? answer.takeIndex : 0;
    candidates.push({ artifact, takeIndex });
  }
  if (candidates.length === 0) return null;
  if (typeof gradedTakeIndex === 'number') {
    const pinned = candidates.find((c) => c.takeIndex === gradedTakeIndex);
    if (pinned) return pinned;
  }
  return candidates.reduce((best, c) =>
    c.takeIndex > best.takeIndex ? c : best
  );
}

/** Maps an archive entry to why it cannot be played, or null when it can. */
export function playbackBlockReason(
  entry: { archiveStatus?: unknown; driveFileId?: unknown } | undefined | null
): PlaybackUnavailableReason | null {
  const status = entry?.archiveStatus;
  if (
    status === 'deleting' ||
    status === 'deleted' ||
    status === 'delete-failed'
  ) {
    return 'deleted';
  }
  if (status === 'failed') return 'failed';
  if (status !== 'archived' || typeof entry?.driveFileId !== 'string') {
    return 'archiving';
  }
  return null;
}

export function parsePlaybackRequest(raw: unknown): PlaybackRequest {
  const data = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string): string =>
    typeof data[key] === 'string' ? data[key].trim() : '';
  const sessionId = read('sessionId');
  const responseKey = read('responseKey');
  const questionId = read('questionId');
  const rawSlot = read('slot') || 'primary';
  if (!sessionId || !responseKey || !questionId) {
    throw new HttpsError(
      'invalid-argument',
      'sessionId, responseKey and questionId are required.'
    );
  }
  if ([sessionId, responseKey].some((v) => v.includes('/'))) {
    throw new HttpsError('invalid-argument', 'Malformed identifier.');
  }
  if (rawSlot !== 'primary' && rawSlot !== 'addendum') {
    throw new HttpsError('invalid-argument', 'Unknown artifact slot.');
  }
  return { sessionId, responseKey, questionId, slot: rawSlot };
}

// ── Default dependency implementations ─────────────────────────────────────

export async function downloadDriveFileById(
  accessToken: string,
  fileId: string
): Promise<Buffer> {
  const response = await fetch(
    `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    throw new Error(`Drive responded ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export function buildDefaultPlaybackDeps(): PlaybackDeps {
  const db = admin.firestore();
  return {
    db,
    getAccessToken: async (teacherUid) =>
      (await refreshGoogleAccessTokenForUid(teacherUid)).accessToken,
    downloadDriveFile: downloadDriveFileById,
    isFeatureGranted: async (teacherUid) => {
      let email: string | null = null;
      try {
        email = (await admin.auth().getUser(teacherUid)).email ?? null;
      } catch {
        email = null;
      }
      return isQuizMediaResponseGranted(db, email, teacherUid);
    },
  };
}

// ── Core ───────────────────────────────────────────────────────────────────

export async function resolveArtifactPlayback(
  input: PlaybackRequest & { callerUid: string },
  deps: PlaybackDeps
): Promise<PlaybackResult> {
  const { db } = deps;
  const { sessionId, responseKey, questionId, slot, callerUid } = input;

  const sessionRef = db.collection('quiz_sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Quiz session not found.');
  }
  const session = sessionSnap.data() ?? {};

  // The publish gate. Read from the session doc every call, so an unpublish
  // (which deletes this field) revokes playback with no separate cleanup.
  const visibility: unknown = session.scoreVisibility;
  if (typeof visibility !== 'string' || visibility === 'none') {
    throw new HttpsError(
      'permission-denied',
      'Results have not been published for this assignment.'
    );
  }

  // The fail-closed session marker; production sessions omit it entirely.
  if (session.mediaResponseEnabled !== true) {
    throw new HttpsError(
      'permission-denied',
      'Media responses are not enabled for this assignment.'
    );
  }

  const teacherUid =
    typeof session.teacherUid === 'string' ? session.teacherUid : '';
  if (!teacherUid) {
    throw new HttpsError('failed-precondition', 'Session has no teacher.');
  }
  if (!(await deps.isFeatureGranted(teacherUid))) {
    throw new HttpsError(
      'permission-denied',
      'Media responses are not enabled for this account.'
    );
  }

  const responseRef = sessionRef.collection('responses').doc(responseKey);
  const responseSnap = await responseRef.get();
  if (!responseSnap.exists) {
    throw new HttpsError('not-found', 'Quiz response not found.');
  }
  const response = responseSnap.data() ?? {};
  // A forged `responseKey` dies here: the doc's own `studentUid` is the only
  // ownership fact this callable trusts.
  if (response.studentUid !== callerUid) {
    throw new HttpsError(
      'permission-denied',
      'You can only play back your own recordings.'
    );
  }

  const answers: StoredAnswer[] = Array.isArray(response.answers)
    ? (response.answers as StoredAnswer[])
    : [];
  const grading = (response.grading ?? {}) as Record<string, unknown>;
  const gradeEntry = grading[gradingKeyFor(questionId, slot)] as
    | { gradedTakeIndex?: unknown }
    | undefined;
  const gradedTakeIndex =
    typeof gradeEntry?.gradedTakeIndex === 'number'
      ? gradeEntry.gradedTakeIndex
      : undefined;

  const take = selectPlaybackTake(answers, questionId, slot, gradedTakeIndex);
  if (!take) return { status: 'not-available', reason: 'no-recording' };

  const artifactId = take.artifact.id as string;
  const archive = (response.artifactArchive ?? {}) as Record<
    string,
    { archiveStatus?: unknown; driveFileId?: unknown }
  >;
  const entry = archive[artifactId];
  const blocked = playbackBlockReason(entry);
  if (blocked) return { status: 'not-available', reason: blocked };

  const driveFileId = entry.driveFileId as string;
  let bytes: Buffer;
  try {
    const accessToken = await deps.getAccessToken(teacherUid);
    bytes = await deps.downloadDriveFile(accessToken, driveFileId);
  } catch (error) {
    console.error('[getQuizArtifactPlaybackUrl] Drive fetch failed', {
      sessionId,
      artifactId,
      error,
    });
    throw new HttpsError('unavailable', 'Could not load this recording.');
  }
  if (bytes.byteLength > MAX_PLAYBACK_BYTES) {
    return { status: 'not-available', reason: 'too-large' };
  }

  return {
    status: 'ready',
    artifactId,
    takeIndex: take.takeIndex,
    // Archived takes are always M4A/AAC; the stored mimeType is the webm source.
    mimeType: 'audio/mp4',
    data: bytes.toString('base64'),
    ...(typeof take.artifact.durationMs === 'number'
      ? { durationMs: take.artifact.durationMs }
      : {}),
  };
}

export const getQuizArtifactPlaybackUrl = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: ALLOWED_ORIGINS,
    secrets: QUIZ_MEDIA_ARCHIVE_SECRETS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const parsed = parsePlaybackRequest(request.data);
    return resolveArtifactPlayback(
      { ...parsed, callerUid: request.auth.uid },
      buildDefaultPlaybackDeps()
    );
  }
);
