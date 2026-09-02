/**
 * Org-admin review-and-delete console for student media (Brief 4.1).
 *
 * COPPA's school-consent pathway requires the district to be able to review
 * and delete student media. RR-03 put the durable copy in the *individual
 * teacher's* Drive, which no org admin has standing over, so both callables
 * here run Admin-SDK-only and reach Drive through the teacher's own stored,
 * AES-encrypted refresh token (`refreshGoogleAccessTokenForUid`) — exactly the
 * mechanism `archiveQuizMediaArtifact` already uses. No client ever sees a
 * bearer token.
 *
 * `listQuizMediaForOrgAdmin` serves the listing rather than letting the client
 * query `quiz_sessions` across teachers: quiz responses carry no `orgId`, and
 * serving through the Admin SDK avoids both a `firestore.rules` widening and a
 * denormalized index collection.
 *
 * `deleteQuizMediaForOrgAdmin` deletes a *set*: every take of one question for
 * one student, Drive file plus any surviving Storage transit object. It never
 * touches `answers[]`/`artifacts[]` — the student's answer record is a separate
 * FERPA fact from the media COPPA's delete standard reaches. A dead teacher
 * token is surfaced honestly as `'delete-failed'`, never a false success.
 *
 * This console is compliance tooling, so it is deliberately NOT gated on the
 * `quiz-media-response` feature flag: it must clean up media recorded before
 * the feature was ever turned off.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { refreshGoogleAccessTokenForUid } from './googleOAuth';
import {
  computeHasStuckArchive,
  deleteDriveFileById,
  hasQuizMediaStoragePrefix,
  QUIZ_MEDIA_ARCHIVE_SECRETS,
  STUCK_ARCHIVE_AGE_MS,
} from './quizMediaArchive';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';

type Firestore = admin.firestore.Firestore;

/** Roles that may review or delete org media. Mirrors `ADMIN_ROLE_IDS`. */
export const MEDIA_ADMIN_ROLE_IDS: readonly string[] = [
  'super_admin',
  'domain_admin',
];

/** Runaway guards, not expected volumes. */
export const MAX_SESSIONS_SCANNED = 400;
export const MAX_RESPONSES_SCANNED = 4000;
export const MAX_ROWS_RETURNED = 500;
/** Firestore caps an `in` filter at 10 values. */
const TEACHER_CHUNK = 10;
/** One batch delete stays a single admin action, not a bulk purge job. */
export const MAX_DELETE_TARGETS = 100;

// ── Wire shapes ────────────────────────────────────────────────────────────

export interface MediaTakeRow {
  artifactId: string;
  archiveStatus: string;
  driveFileId?: string;
  archivedAt?: number;
  deletedAt?: number;
  archiveError?: string;
  /** Transit object still present; the delete has to sweep Storage too. */
  hasStorageObject: boolean;
}

export interface MediaResponseRow {
  sessionId: string;
  responseKey: string;
  questionId: string;
  quizTitle: string;
  teacherUid: string;
  teacherEmail: string;
  /** Pseudonymous by design — no PII-resolution path exists for an org admin. */
  studentLabel: string;
  takes: MediaTakeRow[];
  /** Newest archive/delete timestamp across the takes; drives sorting + filters. */
  lastActivityAt: number;
}

export interface ListMediaRequest {
  orgId: string;
  teacherUid?: string;
  /** Inclusive epoch-ms bounds on `lastActivityAt`. */
  afterMs?: number;
  beforeMs?: number;
}

export interface ListMediaResponse {
  rows: MediaResponseRow[];
  teachers: Array<{ uid: string; email: string }>;
  /** True when a scan cap was hit, so the list is not exhaustive. */
  truncated: boolean;
}

export interface DeleteTarget {
  sessionId: string;
  responseKey: string;
  questionId: string;
}

export interface DeleteItemResult {
  sessionId: string;
  responseKey: string;
  questionId: string;
  artifactId: string;
  status: 'deleted' | 'already-deleted' | 'failed' | 'skipped';
  error?: string;
}

export interface DeleteMediaRequest {
  orgId: string;
  targets: DeleteTarget[];
}

export interface DeleteMediaResponse {
  results: DeleteItemResult[];
}

export interface OrgMediaDeps {
  db: Firestore;
  getAccessToken: (teacherUid: string) => Promise<string>;
  /** Resolves for an already-absent file; rejects on any other Drive failure. */
  deleteDriveFile: (accessToken: string, fileId: string) => Promise<void>;
  deleteStorageObject: (storagePath: string) => Promise<void>;
  now: () => number;
}

// ── Pure helpers (exported for tests) ──────────────────────────────────────

interface StoredArtifact {
  id?: unknown;
  kind?: unknown;
  storagePath?: unknown;
}

interface StoredAnswer {
  questionId?: unknown;
  artifacts?: unknown;
}

type ArchiveEntry = {
  archiveStatus?: unknown;
  driveFileId?: unknown;
  archivedAt?: unknown;
  deletedAt?: unknown;
  deletedBy?: unknown;
  archiveError?: unknown;
  archiveStartedAt?: unknown;
  lastAttemptAt?: unknown;
  deleteAttemptedAt?: unknown;
  orphanedDriveFileId?: unknown;
  storageCleanupPending?: unknown;
};

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readArchiveMap = (
  data: Record<string, unknown> | undefined
): Record<string, ArchiveEntry> => ({
  ...((data?.artifactArchive ?? {}) as Record<string, ArchiveEntry>),
});

/**
 * Every artifact belonging to one question, across every take — the "sets, not
 * files" rule. Order is answer order, so take 1 leads.
 */
export function collectQuestionArtifacts(
  answers: unknown,
  questionId: string
): Array<{ id: string; storagePath: string }> {
  if (!Array.isArray(answers)) return [];
  const out: Array<{ id: string; storagePath: string }> = [];
  for (const raw of answers as StoredAnswer[]) {
    if (raw?.questionId !== questionId) continue;
    const artifacts = Array.isArray(raw.artifacts)
      ? (raw.artifacts as StoredArtifact[])
      : [];
    for (const artifact of artifacts) {
      const id = asString(artifact?.id);
      if (!id || out.some((a) => a.id === id)) continue;
      if (artifact?.kind === 'text') continue;
      out.push({ id, storagePath: asString(artifact?.storagePath) });
    }
  }
  return out;
}

/** Pseudonymous only. No PII-resolution path is reachable from an org admin. */
export function buildStudentLabel(pin: unknown, studentUid: unknown): string {
  const pinValue = asString(pin);
  if (pinValue) return `Pin ${pinValue}`;
  const uid = asString(studentUid);
  return uid ? `Student ${uid.slice(0, 8)}` : 'Unidentified student';
}

/** Newest evidence of activity on the set; 0 when an entry carries no stamp. */
export function latestActivityAt(takes: readonly MediaTakeRow[]): number {
  let latest = 0;
  for (const take of takes) {
    latest = Math.max(latest, take.deletedAt ?? 0, take.archivedAt ?? 0);
  }
  return latest;
}

export function matchesDateWindow(
  lastActivityAt: number,
  afterMs: number | undefined,
  beforeMs: number | undefined
): boolean {
  // An unstamped row (0) is never excluded by a lower bound it cannot satisfy;
  // a records officer asking for "everything before X" must still see it.
  if (
    typeof afterMs === 'number' &&
    lastActivityAt > 0 &&
    lastActivityAt < afterMs
  ) {
    return false;
  }
  if (typeof beforeMs === 'number' && lastActivityAt > beforeMs) return false;
  return true;
}

export function chunkList<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Builds one row per (response, question) from a response document. */
export function buildRowsForResponse(
  input: {
    sessionId: string;
    responseKey: string;
    quizTitle: string;
    teacherUid: string;
    teacherEmail: string;
  },
  data: Record<string, unknown>
): MediaResponseRow[] {
  const archive = readArchiveMap(data);
  const answers = Array.isArray(data.answers)
    ? (data.answers as StoredAnswer[])
    : [];
  const studentLabel = buildStudentLabel(data.pin, data.studentUid);
  const questionIds: string[] = [];
  for (const answer of answers) {
    const questionId = asString(answer?.questionId);
    if (questionId && !questionIds.includes(questionId)) {
      questionIds.push(questionId);
    }
  }

  const rows: MediaResponseRow[] = [];
  for (const questionId of questionIds) {
    const artifacts = collectQuestionArtifacts(answers, questionId);
    const takes: MediaTakeRow[] = [];
    for (const artifact of artifacts) {
      const entry = archive[artifact.id];
      const hasStorageObject = artifact.storagePath.length > 0;
      // Nothing recorded and nothing in transit means there is no media here.
      if (!entry && !hasStorageObject) continue;
      takes.push({
        artifactId: artifact.id,
        archiveStatus: asString(entry?.archiveStatus) || 'syncing',
        ...(asString(entry?.driveFileId)
          ? { driveFileId: asString(entry?.driveFileId) }
          : {}),
        ...(asNumber(entry?.archivedAt) !== undefined
          ? { archivedAt: asNumber(entry?.archivedAt) }
          : {}),
        ...(asNumber(entry?.deletedAt) !== undefined
          ? { deletedAt: asNumber(entry?.deletedAt) }
          : {}),
        ...(asString(entry?.archiveError)
          ? { archiveError: asString(entry?.archiveError) }
          : {}),
        hasStorageObject,
      });
    }
    if (takes.length === 0) continue;
    rows.push({
      sessionId: input.sessionId,
      responseKey: input.responseKey,
      questionId,
      quizTitle: input.quizTitle,
      teacherUid: input.teacherUid,
      teacherEmail: input.teacherEmail,
      studentLabel,
      takes,
      lastActivityAt: latestActivityAt(takes),
    });
  }
  return rows;
}

// ── Authorization ──────────────────────────────────────────────────────────

/**
 * Fails closed. A SpartBoard admin (`/admins/{email}`) passes; otherwise the
 * caller's own member doc for the TARGET org must carry an admin role. The
 * client-asserted role is never read.
 */
export async function assertOrgMediaAdmin(
  db: Firestore,
  orgId: string,
  callerEmailLower: string
): Promise<void> {
  if (!orgId || !callerEmailLower) {
    throw new HttpsError(
      'permission-denied',
      'Not authorized for this organization.'
    );
  }
  const adminSnap = await db.collection('admins').doc(callerEmailLower).get();
  if (adminSnap.exists) return;
  const memberSnap = await db
    .doc(`organizations/${orgId}/members/${callerEmailLower}`)
    .get();
  if (!memberSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      'Caller is not a member of this organization.'
    );
  }
  const roleId = asString(memberSnap.get('roleId'));
  if (!MEDIA_ADMIN_ROLE_IDS.includes(roleId)) {
    throw new HttpsError(
      'permission-denied',
      'Caller is not an administrator for this organization.'
    );
  }
}

/** uid → email for every member of the org that has signed in at least once. */
export async function loadOrgTeacherUids(
  db: Firestore,
  orgId: string
): Promise<Map<string, string>> {
  const snap = await db.collection(`organizations/${orgId}/members`).get();
  const map = new Map<string, string>();
  for (const doc of snap.docs) {
    const uid = asString(doc.get('uid'));
    if (uid) map.set(uid, asString(doc.get('email')) || doc.id);
  }
  return map;
}

// ── List core ──────────────────────────────────────────────────────────────

export async function listOrgQuizMedia(
  input: ListMediaRequest,
  deps: Pick<OrgMediaDeps, 'db'>
): Promise<ListMediaResponse> {
  const { db } = deps;
  const teacherMap = await loadOrgTeacherUids(db, input.orgId);
  const teachers = [...teacherMap.entries()]
    .map(([uid, email]) => ({ uid, email }))
    .sort((a, b) => a.email.localeCompare(b.email));

  let uids = [...teacherMap.keys()];
  if (input.teacherUid) {
    // An out-of-org uid narrows to nothing rather than escaping the org scope.
    uids = uids.filter((uid) => uid === input.teacherUid);
  }
  if (uids.length === 0) return { rows: [], teachers, truncated: false };

  const rows: MediaResponseRow[] = [];
  let sessionsScanned = 0;
  let responsesScanned = 0;
  let truncated = false;

  // Labelled so a response-cap hit stops every remaining teacher chunk too.
  scan: for (const chunk of chunkList(uids, TEACHER_CHUNK)) {
    if (sessionsScanned >= MAX_SESSIONS_SCANNED) {
      truncated = true;
      break;
    }
    const sessions = await db
      .collection('quiz_sessions')
      .where('teacherUid', 'in', chunk)
      .limit(MAX_SESSIONS_SCANNED - sessionsScanned)
      .get();
    for (const sessionDoc of sessions.docs) {
      sessionsScanned++;
      if (responsesScanned >= MAX_RESPONSES_SCANNED) {
        truncated = true;
        break scan;
      }
      const session = sessionDoc.data() ?? {};
      const teacherUid = asString(session.teacherUid);
      const quizTitle = asString(session.quizTitle) || 'Untitled quiz';
      const responses = await sessionDoc.ref
        .collection('responses')
        .limit(MAX_RESPONSES_SCANNED - responsesScanned)
        .get();
      for (const responseDoc of responses.docs) {
        responsesScanned++;
        const data = responseDoc.data() ?? {};
        rows.push(
          ...buildRowsForResponse(
            {
              sessionId: sessionDoc.id,
              responseKey: responseDoc.id,
              quizTitle,
              teacherUid,
              teacherEmail: teacherMap.get(teacherUid) ?? '',
            },
            data
          )
        );
      }
    }
  }

  const filtered = rows
    .filter((row) =>
      matchesDateWindow(row.lastActivityAt, input.afterMs, input.beforeMs)
    )
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  if (filtered.length > MAX_ROWS_RETURNED) truncated = true;
  return { rows: filtered.slice(0, MAX_ROWS_RETURNED), teachers, truncated };
}

// ── Delete core (reusable by a future retention sweep) ─────────────────────

type DeletionClaim =
  | { kind: 'already-deleted' }
  | { kind: 'in-flight' }
  | { kind: 'claimed'; driveFileId: string };

/** A `'deleting'` claim this old lost its owner; a retry may take it over. */
function isDeleteClaimStale(entry: ArchiveEntry, now: number): boolean {
  const stamp = Math.max(
    asNumber(entry.deleteAttemptedAt) ?? 0,
    asNumber(entry.deletedAt) ?? 0
  );
  return stamp === 0 || now - stamp >= STUCK_ARCHIVE_AGE_MS;
}

const STUCK_ARCHIVE_HOURS = Math.round(STUCK_ARCHIVE_AGE_MS / 3_600_000);

const IN_FLIGHT_MESSAGE = `A delete is already in progress for this take; retry in ${STUCK_ARCHIVE_HOURS}h if it does not finish.`;

/**
 * Phase one of the delete: claims one artifact as `'deleting'` inside the same
 * transaction that reads it, so an archive still in flight cannot hand back a
 * `driveFileId` this call never saw. `deletedAt`/`deletedBy` are the audit
 * record and are stamped once, never overwritten by a later retry.
 */
async function claimArtifactForDeletion(
  db: Firestore,
  responseRef: admin.firestore.DocumentReference,
  artifactId: string,
  now: number,
  deletedBy: string
): Promise<DeletionClaim> {
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(responseRef);
    const archive = readArchiveMap(fresh.data());
    const entry = archive[artifactId];
    if (entry?.archiveStatus === 'deleted') {
      return { kind: 'already-deleted' as const };
    }
    if (
      entry?.archiveStatus === 'deleting' &&
      !isDeleteClaimStale(entry, now)
    ) {
      return { kind: 'in-flight' as const };
    }
    const driveFileId =
      asString(entry?.driveFileId) || asString(entry?.orphanedDriveFileId);
    const deletedAt = asNumber(entry?.deletedAt) ?? now;
    const attributedTo = asString(entry?.deletedBy) || deletedBy;
    const claimed: ArchiveEntry = {
      ...(entry ?? {}),
      archiveStatus: 'deleting',
      ...(driveFileId ? { driveFileId } : {}),
    };
    delete claimed.storageCleanupPending;
    delete claimed.orphanedDriveFileId;
    archive[artifactId] = claimed;
    tx.set(
      responseRef,
      {
        artifactArchive: {
          [artifactId]: {
            archiveStatus: 'deleting',
            deletedAt,
            deletedBy: attributedTo,
            deleteAttemptedAt: now,
            ...(driveFileId ? { driveFileId } : {}),
            storageCleanupPending: admin.firestore.FieldValue.delete(),
            orphanedDriveFileId: admin.firestore.FieldValue.delete(),
            archiveError: admin.firestore.FieldValue.delete(),
            archiveStartedAt: admin.firestore.FieldValue.delete(),
            lastAttemptAt: admin.firestore.FieldValue.delete(),
          },
        },
        hasStuckArchive: computeHasStuckArchive(
          archive as Record<
            string,
            { archiveStatus?: unknown; storageCleanupPending?: unknown }
          >
        ),
      },
      { merge: true }
    );
    return { kind: 'claimed' as const, driveFileId };
  });
}

/** Phase two: only a confirmed physical delete may commit `'deleted'`. */
async function finalizeDeletedEntry(
  db: Firestore,
  responseRef: admin.firestore.DocumentReference,
  artifactId: string
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(responseRef);
    const archive = readArchiveMap(fresh.data());
    const settled: ArchiveEntry = {
      ...(archive[artifactId] ?? {}),
      archiveStatus: 'deleted',
    };
    delete settled.storageCleanupPending;
    delete settled.orphanedDriveFileId;
    archive[artifactId] = settled;
    tx.set(
      responseRef,
      {
        artifactArchive: {
          [artifactId]: {
            archiveStatus: 'deleted',
            deleteAttemptedAt: admin.firestore.FieldValue.delete(),
            storageCleanupPending: admin.firestore.FieldValue.delete(),
            orphanedDriveFileId: admin.firestore.FieldValue.delete(),
          },
        },
        hasStuckArchive: computeHasStuckArchive(
          archive as Record<
            string,
            { archiveStatus?: unknown; storageCleanupPending?: unknown }
          >
        ),
      },
      { merge: true }
    );
  });
}

/** Clears the orphan bookkeeping on an entry that is already tombstoned. */
async function clearDeleteResidue(
  db: Firestore,
  responseRef: admin.firestore.DocumentReference,
  artifactId: string
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(responseRef);
    const archive = readArchiveMap(fresh.data());
    const settled: ArchiveEntry = { ...(archive[artifactId] ?? {}) };
    delete settled.storageCleanupPending;
    delete settled.orphanedDriveFileId;
    archive[artifactId] = settled;
    tx.set(
      responseRef,
      {
        artifactArchive: {
          [artifactId]: {
            storageCleanupPending: admin.firestore.FieldValue.delete(),
            orphanedDriveFileId: admin.firestore.FieldValue.delete(),
          },
        },
        hasStuckArchive: computeHasStuckArchive(
          archive as Record<
            string,
            { archiveStatus?: unknown; storageCleanupPending?: unknown }
          >
        ),
      },
      { merge: true }
    );
  });
}

/** The honest failure path: the file is still out there, so say so. */
async function writeDeleteFailedEntry(
  db: Firestore,
  responseRef: admin.firestore.DocumentReference,
  artifactId: string,
  message: string,
  attemptedAt: number
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(responseRef);
    const archive = readArchiveMap(fresh.data());
    archive[artifactId] = {
      ...(archive[artifactId] ?? {}),
      archiveStatus: 'delete-failed',
    };
    tx.set(
      responseRef,
      {
        artifactArchive: {
          [artifactId]: {
            archiveStatus: 'delete-failed',
            archiveError: message.slice(0, 180),
            deleteAttemptedAt: attemptedAt,
          },
        },
        hasStuckArchive: computeHasStuckArchive(
          archive as Record<
            string,
            { archiveStatus?: unknown; storageCleanupPending?: unknown }
          >
        ),
      },
      { merge: true }
    );
  });
}

const DEAD_TOKEN_MESSAGE =
  "Teacher's Google account is disconnected; the file cannot be deleted remotely.";

type TokenResult = { token: string } | { error: string };

/** One refresh per teacher, not per artifact; a dead token is cached too. */
function createTokenResolver(
  deps: Pick<OrgMediaDeps, 'getAccessToken'>
): (teacherUid: string) => Promise<TokenResult> {
  const cache = new Map<string, TokenResult>();
  return async (teacherUid: string) => {
    const cached = cache.get(teacherUid);
    if (cached) return cached;
    let resolved: TokenResult;
    try {
      resolved = { token: await deps.getAccessToken(teacherUid) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      resolved = {
        error: message.includes('needs-consent')
          ? DEAD_TOKEN_MESSAGE
          : `Could not reach the teacher's Google Drive: ${message}`,
      };
    }
    cache.set(teacherUid, resolved);
    return resolved;
  };
}

/** The bytes themselves. Returns a failure message, or null when both are gone. */
async function runPhysicalDelete(
  input: { teacherUid: string; driveFileId: string; storagePath: string },
  deps: OrgMediaDeps,
  tokenFor: (teacherUid: string) => Promise<TokenResult>
): Promise<string | null> {
  if (input.driveFileId) {
    const token = await tokenFor(input.teacherUid);
    if ('error' in token) return token.error;
    try {
      await deps.deleteDriveFile(token.token, input.driveFileId);
    } catch (err) {
      return err instanceof Error
        ? `Drive delete failed: ${err.message}`
        : 'Drive delete failed.';
    }
  }
  if (input.storagePath) {
    try {
      await deps.deleteStorageObject(input.storagePath);
    } catch (err) {
      return err instanceof Error
        ? `Storage delete failed: ${err.message}`
        : 'Storage delete failed.';
    }
  }
  return null;
}

/**
 * Deletes the media set for each target. Per-item results so one dead teacher
 * token never blocks the rest of the batch. Exported so the future
 * end-of-year retention sweep can reuse this exact path.
 */
export async function deleteOrgQuizMediaSets(
  input: { orgId: string; targets: readonly DeleteTarget[]; deletedBy: string },
  deps: OrgMediaDeps
): Promise<DeleteMediaResponse> {
  const { db } = deps;
  const teacherMap = await loadOrgTeacherUids(db, input.orgId);
  const results: DeleteItemResult[] = [];
  const tokenFor = createTokenResolver(deps);

  for (const target of input.targets) {
    const base = {
      sessionId: target.sessionId,
      responseKey: target.responseKey,
      questionId: target.questionId,
    };
    const sessionRef = db.collection('quiz_sessions').doc(target.sessionId);
    const sessionSnap = await sessionRef.get();
    const teacherUid = asString(sessionSnap.data()?.teacherUid);
    // Cross-org guard: an admin of org A must never reach org B's sessions.
    if (!sessionSnap.exists || !teacherMap.has(teacherUid)) {
      results.push({
        ...base,
        artifactId: '',
        status: 'failed',
        error: 'This response does not belong to your organization.',
      });
      continue;
    }

    const responseRef = sessionRef
      .collection('responses')
      .doc(target.responseKey);
    const responseSnap = await responseRef.get();
    if (!responseSnap.exists) {
      results.push({
        ...base,
        artifactId: '',
        status: 'failed',
        error: 'Response not found.',
      });
      continue;
    }
    const data = responseSnap.data() ?? {};
    const studentUid = asString(data.studentUid);
    const artifacts = collectQuestionArtifacts(data.answers, target.questionId);
    if (artifacts.length === 0) {
      results.push({
        ...base,
        artifactId: '',
        status: 'skipped',
        error: 'No media takes on this question.',
      });
      continue;
    }

    for (const artifact of artifacts) {
      const claim = await claimArtifactForDeletion(
        db,
        responseRef,
        artifact.id,
        deps.now(),
        input.deletedBy
      );
      if (claim.kind === 'already-deleted') {
        results.push({
          ...base,
          artifactId: artifact.id,
          status: 'already-deleted',
        });
        continue;
      }
      if (claim.kind === 'in-flight') {
        results.push({
          ...base,
          artifactId: artifact.id,
          status: 'skipped',
          error: IN_FLIGHT_MESSAGE,
        });
        continue;
      }
      const storagePath = hasQuizMediaStoragePrefix(
        artifact.storagePath,
        target.sessionId,
        studentUid
      )
        ? artifact.storagePath
        : '';

      const failure = await runPhysicalDelete(
        { teacherUid, driveFileId: claim.driveFileId, storagePath },
        deps,
        tokenFor
      );
      if (failure) {
        await writeDeleteFailedEntry(
          db,
          responseRef,
          artifact.id,
          failure,
          deps.now()
        );
        results.push({
          ...base,
          artifactId: artifact.id,
          status: 'failed',
          error: failure,
        });
        continue;
      }
      // Only now, with both copies confirmed gone, does the tombstone commit.
      await finalizeDeletedEntry(db, responseRef, artifact.id);
      results.push({ ...base, artifactId: artifact.id, status: 'deleted' });
    }
  }

  return { results };
}

export interface StuckDeleteTarget {
  sessionId: string;
  responseKey: string;
  questionId: string;
  artifactId: string;
}

/**
 * Finishes a compliance delete that a crash or a lost archive race left owing
 * bytes: a `'deleting'` claim whose physical deletes never confirmed, or a
 * tombstone carrying `orphanedDriveFileId`/`storageCleanupPending`. Throws when
 * the delete still fails, so the sweep counts it instead of clearing it.
 */
export async function finishStuckMediaDelete(
  input: StuckDeleteTarget,
  deps: OrgMediaDeps
): Promise<void> {
  const { db } = deps;
  const sessionRef = db.collection('quiz_sessions').doc(input.sessionId);
  const sessionSnap = await sessionRef.get();
  const teacherUid = asString(sessionSnap.data()?.teacherUid);
  const responseRef = sessionRef.collection('responses').doc(input.responseKey);
  const responseSnap = await responseRef.get();
  if (!responseSnap.exists) return;
  const data = responseSnap.data() ?? {};
  const entry = readArchiveMap(data)[input.artifactId];
  if (!entry) return;
  const status = asString(entry.archiveStatus);
  const claimed = status === 'deleting';
  const orphaned = asString(entry.orphanedDriveFileId);
  // A settled tombstone only ever owes the orphan the archive left behind.
  const driveFileId = claimed
    ? asString(entry.driveFileId) || orphaned
    : orphaned;
  const studentUid = asString(data.studentUid);
  const artifact = collectQuestionArtifacts(
    data.answers,
    input.questionId
  ).find((a) => a.id === input.artifactId);
  const rawPath = artifact?.storagePath ?? '';
  const storagePath =
    (claimed || entry.storageCleanupPending === true) &&
    hasQuizMediaStoragePrefix(rawPath, input.sessionId, studentUid)
      ? rawPath
      : '';

  const failure = await runPhysicalDelete(
    { teacherUid, driveFileId, storagePath },
    deps,
    createTokenResolver(deps)
  );
  if (failure) {
    if (claimed) {
      await writeDeleteFailedEntry(
        db,
        responseRef,
        input.artifactId,
        failure,
        deps.now()
      );
    }
    throw new Error(failure);
  }
  if (claimed) {
    await finalizeDeletedEntry(db, responseRef, input.artifactId);
    return;
  }
  await clearDeleteResidue(db, responseRef, input.artifactId);
}

// ── Default dependency implementations ─────────────────────────────────────

export function buildDefaultOrgMediaDeps(): OrgMediaDeps {
  const db = admin.firestore();
  return {
    db,
    getAccessToken: async (teacherUid) =>
      (await refreshGoogleAccessTokenForUid(teacherUid)).accessToken,
    deleteDriveFile: deleteDriveFileById,
    deleteStorageObject: async (storagePath) => {
      await admin
        .storage()
        .bucket()
        .file(storagePath)
        .delete({ ignoreNotFound: true });
    },
    now: () => Date.now(),
  };
}

// ── Request parsing (fails closed) ─────────────────────────────────────────

const readId = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export function parseListRequest(raw: unknown): ListMediaRequest {
  const data = (raw ?? {}) as Record<string, unknown>;
  const orgId = readId(data.orgId);
  if (!orgId || orgId.includes('/')) {
    throw new HttpsError('invalid-argument', 'orgId is required.');
  }
  const teacherUid = readId(data.teacherUid);
  const afterMs = asNumber(data.afterMs);
  const beforeMs = asNumber(data.beforeMs);
  return {
    orgId,
    ...(teacherUid ? { teacherUid } : {}),
    ...(afterMs !== undefined ? { afterMs } : {}),
    ...(beforeMs !== undefined ? { beforeMs } : {}),
  };
}

export function parseDeleteRequest(raw: unknown): DeleteMediaRequest {
  const data = (raw ?? {}) as Record<string, unknown>;
  const orgId = readId(data.orgId);
  if (!orgId || orgId.includes('/')) {
    throw new HttpsError('invalid-argument', 'orgId is required.');
  }
  const rawTargets = Array.isArray(data.targets) ? data.targets : null;
  if (!rawTargets || rawTargets.length === 0) {
    throw new HttpsError('invalid-argument', 'targets is required.');
  }
  if (rawTargets.length > MAX_DELETE_TARGETS) {
    throw new HttpsError(
      'invalid-argument',
      `At most ${MAX_DELETE_TARGETS} targets per request.`
    );
  }
  const targets: DeleteTarget[] = rawTargets.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const sessionId = readId(item.sessionId);
    const responseKey = readId(item.responseKey);
    const questionId = readId(item.questionId);
    if (!sessionId || !responseKey || !questionId) {
      throw new HttpsError(
        'invalid-argument',
        'sessionId, responseKey and questionId are required on every target.'
      );
    }
    if ([sessionId, responseKey].some((v) => v.includes('/'))) {
      throw new HttpsError('invalid-argument', 'Malformed identifier.');
    }
    return { sessionId, responseKey, questionId };
  });
  return { orgId, targets };
}

const callerEmailFrom = (token: { email?: unknown }): string => {
  const email = asString(token.email).trim().toLowerCase();
  if (!email) {
    throw new HttpsError(
      'permission-denied',
      'Caller must have an email address.'
    );
  }
  return email;
};

export const listQuizMediaForOrgAdmin = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
  },
  async (request): Promise<ListMediaResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const parsed = parseListRequest(request.data);
    const db = admin.firestore();
    await assertOrgMediaAdmin(
      db,
      parsed.orgId,
      callerEmailFrom(request.auth.token)
    );
    return listOrgQuizMedia(parsed, { db });
  }
);

export const deleteQuizMediaForOrgAdmin = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 300,
    cors: ALLOWED_ORIGINS,
    secrets: QUIZ_MEDIA_ARCHIVE_SECRETS,
  },
  async (request): Promise<DeleteMediaResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const parsed = parseDeleteRequest(request.data);
    const db = admin.firestore();
    await assertOrgMediaAdmin(
      db,
      parsed.orgId,
      callerEmailFrom(request.auth.token)
    );
    return deleteOrgQuizMediaSets(
      { ...parsed, deletedBy: request.auth.uid },
      buildDefaultOrgMediaDeps()
    );
  }
);
