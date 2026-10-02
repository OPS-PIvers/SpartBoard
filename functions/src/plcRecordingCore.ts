// Group meeting recording logic shared by the callables, schedules and gcPlcOrphans (docs/plans/PLC_MEETING_RECORDING.md).
import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import './functionsInit';
import { withDuration } from './webmDuration';

type Firestore = admin.firestore.Firestore;
type DocRef = admin.firestore.DocumentReference;
type Data = Record<string, unknown>;

export const MEETING_AUDIO_ROOT = 'plc_meeting_audio';
export const STALE_RECORDING_MS = 5 * 60 * 1000;
export const STALE_PAUSE_MS = 30 * 60 * 1000;
export const AUDIO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const FINALIZE_LEASE_MS = 10 * 60 * 1000;
// Wall-clock cap from the doc's server create time; client heartbeat values are not trusted for this.
export const MAX_RECORDING_WALL_MS = 3 * 60 * 60 * 1000;
export const ESTIMATED_SEGMENT_MS = 30 * 1000;
export const SWEEP_PAGE_SIZE = 200;
export const MAX_SWEEP_PER_RUN = 2000;
const MAX_PART_INDEX = 1000;
const MAX_SEGMENT_INDEX = 10000;
const MAX_MERGE_ROUNDS = 3;
const SEGMENT_INDEX_META = 'segments';

export type RecordingStatus =
  | 'recording'
  | 'paused'
  | 'finalizing'
  | 'ready'
  | 'queued'
  | 'transcribing'
  | 'transcribed'
  | 'failed';

export type AudioDeletedReason = 'manual' | 'expired' | 'transcribed';

export interface RecordingPart {
  segmentCount: number;
  durationMs: number;
}

export interface StoredObject {
  data: Buffer;
  metadata: Record<string, string>;
}

/** The Storage surface this module uses, so tests can swap in a fake bucket. */
export interface AudioBucket {
  list: (prefix: string) => Promise<string[]>;
  read: (path: string) => Promise<StoredObject | null>;
  write: (
    path: string,
    data: Buffer,
    metadata: Record<string, string>
  ) => Promise<void>;
  remove: (path: string) => Promise<void>;
}

export interface RecordingDeps {
  db: Firestore;
  bucket: AudioBucket;
  now: () => number;
  newId: () => string;
}

// ───────────────────────── pure helpers ─────────────────────────

export function recordingPrefix(plcId: string, recordingId: string): string {
  return `${MEETING_AUDIO_ROOT}/${plcId}/${recordingId}/`;
}

export function segmentPath(
  plcId: string,
  recordingId: string,
  part: number,
  segment: number
): string {
  return `${recordingPrefix(plcId, recordingId)}${part}/${segment}.webm`;
}

export function partPath(
  plcId: string,
  recordingId: string,
  part: number
): string {
  return `${recordingPrefix(plcId, recordingId)}${part}.webm`;
}

const SEGMENT_RE =
  /^plc_meeting_audio\/([^/]+)\/([^/]+)\/(\d{1,4})\/(\d{1,5})\.webm$/;

/** A live segment upload's coordinates, or null for any other object (including finalized part files). */
export function parseSegmentPath(name: string): {
  plcId: string;
  recordingId: string;
  part: number;
  segment: number;
} | null {
  const m = SEGMENT_RE.exec(name);
  if (!m) return null;
  const part = Number(m[3]);
  const segment = Number(m[4]);
  if (part >= MAX_PART_INDEX || segment >= MAX_SEGMENT_INDEX) return null;
  return { plcId: m[1], recordingId: m[2], part, segment };
}

export interface ListedAudio {
  segments: Map<number, Array<{ index: number; path: string }>>;
  parts: Set<number>;
}

/** Splits a recording's listing into pending segment uploads and finalized part files. */
export function classifyListing(prefix: string, names: string[]): ListedAudio {
  const segments = new Map<number, Array<{ index: number; path: string }>>();
  const parts = new Set<number>();
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const rest = name.slice(prefix.length);
    const seg = /^(\d{1,4})\/(\d{1,5})\.webm$/.exec(rest);
    if (seg) {
      const part = Number(seg[1]);
      const index = Number(seg[2]);
      if (part >= MAX_PART_INDEX || index >= MAX_SEGMENT_INDEX) continue;
      const list = segments.get(part) ?? [];
      list.push({ index, path: name });
      segments.set(part, list);
      continue;
    }
    const whole = /^(\d{1,4})\.webm$/.exec(rest);
    if (whole) parts.add(Number(whole[1]));
  }
  for (const list of segments.values()) list.sort((a, b) => a.index - b.index);
  return { segments, parts };
}

export interface SegmentEntry {
  index: number;
  bytes: number;
}

export function encodeSegmentIndex(entries: SegmentEntry[]): string {
  return entries.map((e) => `${e.index}:${e.bytes}`).join(',');
}

/** Parses a part file's segment index; null when it is missing or malformed. */
export function decodeSegmentIndex(raw: unknown): SegmentEntry[] | null {
  if (typeof raw !== 'string' || raw === '') return null;
  const out: SegmentEntry[] = [];
  for (const piece of raw.split(',')) {
    const m = /^(-?\d+):(\d+)$/.exec(piece);
    if (!m) return null;
    out.push({ index: Number(m[1]), bytes: Number(m[2]) });
  }
  return out;
}

/** Rebuilds a part file in segment order; segments already in the part are skipped. */
export function spliceSegments(
  existing: StoredObject | null,
  incoming: Array<{ index: number; data: Buffer }>
): { data: Buffer; index: SegmentEntry[]; added: number } {
  const pieces: Array<{ index: number; data: Buffer }> = [];
  let index = existing
    ? decodeSegmentIndex(existing.metadata[SEGMENT_INDEX_META])
    : [];
  if (existing && index) {
    const total = index.reduce((sum, e) => sum + e.bytes, 0);
    if (total !== existing.data.length) index = null;
  }
  if (existing && !index) {
    // Unreadable index: keep the old bytes whole as entry -1 and append the rest.
    const after = [...incoming].sort((a, b) => a.index - b.index);
    return {
      data: Buffer.concat([existing.data, ...after.map((s) => s.data)]),
      index: [
        { index: -1, bytes: existing.data.length },
        ...after.map((s) => ({ index: s.index, bytes: s.data.length })),
      ],
      added: after.length,
    };
  }
  const base = existing?.data ?? Buffer.alloc(0);
  let offset = 0;
  const have = new Set<number>();
  for (const e of index ?? []) {
    pieces.push({
      index: e.index,
      data: base.subarray(offset, offset + e.bytes),
    });
    offset += e.bytes;
    have.add(e.index);
  }
  let added = 0;
  for (const s of incoming) {
    if (have.has(s.index)) continue;
    have.add(s.index);
    pieces.push(s);
    added += 1;
  }
  pieces.sort((a, b) => a.index - b.index);
  return {
    data: Buffer.concat(pieces.map((p) => p.data)),
    index: pieces.map((p) => ({ index: p.index, bytes: p.data.length })),
    added,
  };
}

/** Keeps the recorder's per-part counts and adds an estimate for segments it never reported. */
export function mergeParts(
  reported: unknown,
  segmentCounts: Map<number, number>
): { parts: RecordingPart[]; durationMs: number } {
  const parts: RecordingPart[] = (Array.isArray(reported) ? reported : []).map(
    (p) => {
      const d = (p ?? {}) as Data;
      return {
        segmentCount: num(d.segmentCount),
        durationMs: num(d.durationMs),
      };
    }
  );
  for (const [part, count] of segmentCounts) {
    while (parts.length <= part) parts.push({ segmentCount: 0, durationMs: 0 });
    const prev = parts[part];
    if (count > prev.segmentCount) {
      parts[part] = {
        segmentCount: count,
        durationMs:
          prev.durationMs + (count - prev.segmentCount) * ESTIMATED_SEGMENT_MS,
      };
    }
  }
  return { parts, durationMs: parts.reduce((s, p) => s + p.durationMs, 0) };
}

/** Tolerant millis read: Firestore Timestamp, number, or 0. */
export function toMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    const ms = (value as { toMillis: () => unknown }).toMillis();
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export type StaleAction =
  | 'interrupted'
  | 'paused-timeout'
  | 'lease-expired'
  | 'time-limit';

/** What the 5-minute finalizer should do with this recording, if anything. `serverCreatedMs` is the doc's createTime. */
export function staleAction(
  rec: Data,
  now: number,
  serverCreatedMs = 0
): StaleAction | null {
  if (
    (rec.status === 'recording' || rec.status === 'paused') &&
    serverCreatedMs > 0 &&
    now - serverCreatedMs > MAX_RECORDING_WALL_MS
  ) {
    return 'time-limit';
  }
  const beat = toMillis(rec.lastHeartbeatAt) || toMillis(rec.createdAt);
  if (rec.status === 'recording' && now - beat > STALE_RECORDING_MS) {
    return 'interrupted';
  }
  if (rec.status === 'paused' && now - beat > STALE_PAUSE_MS) {
    return 'paused-timeout';
  }
  if (
    rec.status === 'finalizing' &&
    now - toMillis(rec.finalizingAt) > FINALIZE_LEASE_MS
  ) {
    return 'lease-expired';
  }
  return null;
}

export type LateSegmentAction = 'ignore' | 'merge' | 'recover' | 'discard';

/** MR-D8: where a segment that lands after the recording stopped belongs. */
export function lateSegmentAction(rec: Data | undefined): LateSegmentAction {
  if (!rec) return 'discard';
  const reason = rec.audioDeletedReason;
  if (reason === 'manual' || reason === 'expired') return 'discard';
  const status = rec.status;
  if (status === 'recording' || status === 'paused' || status === 'finalizing')
    return 'ignore';
  if (rec.audioDeletedAt != null || reason === 'transcribed') return 'recover';
  if (status === 'ready' || status === 'failed') return 'merge';
  return 'recover';
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function parseRecordingRequest(data: unknown): {
  plcId: string;
  recordingId: string;
} {
  const d = (data ?? {}) as Data;
  if (
    typeof d.plcId !== 'string' ||
    !ID_RE.test(d.plcId) ||
    typeof d.recordingId !== 'string' ||
    !ID_RE.test(d.recordingId)
  ) {
    throw new HttpsError('invalid-argument', 'Missing recording.');
  }
  return { plcId: d.plcId, recordingId: d.recordingId };
}

/** Mirrors `plcCanEditContent` in firestore.rules: members except viewers. */
export function canEditPlc(plc: Data | undefined, uid: string): boolean {
  if (!plc) return false;
  const memberUids = Array.isArray(plc.memberUids) ? plc.memberUids : [];
  const members = (plc.members ?? {}) as Record<string, Data>;
  const entry = members[uid];
  if (entry) return entry.role !== 'viewer' && entry.status !== 'removed';
  return memberUids.includes(uid);
}

export function isPlcMember(plc: Data | undefined, uid: string): boolean {
  const memberUids = Array.isArray(plc?.memberUids) ? plc.memberUids : [];
  return memberUids.includes(uid);
}

// ───────────────────────── Storage + Firestore I/O ─────────────────────────

export function recordingRef(
  db: Firestore,
  plcId: string,
  recordingId: string
): DocRef {
  return db
    .collection('plcs')
    .doc(plcId)
    .collection('recordings')
    .doc(recordingId);
}

export function adminAudioBucket(
  bucket = admin.storage().bucket()
): AudioBucket {
  return {
    list: async (prefix) => {
      const [files] = await bucket.getFiles({ prefix });
      return files.map((f) => f.name);
    },
    read: async (path) => {
      const file = bucket.file(path);
      try {
        const [[data], [meta]] = await Promise.all([
          file.download(),
          file.getMetadata(),
        ]);
        const raw = (meta.metadata ?? {}) as Record<string, unknown>;
        const metadata: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (typeof v === 'string') metadata[k] = v;
        }
        return { data, metadata };
      } catch (err) {
        if ((err as { code?: number }).code === 404) return null;
        throw err;
      }
    },
    write: async (path, data, metadata) => {
      await bucket.file(path).save(data, {
        resumable: false,
        contentType: 'audio/webm',
        metadata: { metadata },
      });
    },
    remove: async (path) => {
      await bucket.file(path).delete({ ignoreNotFound: true });
    },
  };
}

export function defaultRecordingDeps(): RecordingDeps {
  const db = admin.firestore();
  return {
    db,
    bucket: adminAudioBucket(),
    now: () => Date.now(),
    newId: () => db.collection('_').doc().id,
  };
}

/** Sets the WebM Duration inside the first piece (the one holding the header) and grows that piece's byte count to match. */
export function withPlayableDuration(spliced: {
  data: Buffer;
  index: SegmentEntry[];
}): { data: Buffer; index: SegmentEntry[] } {
  const head = spliced.index[0];
  if (!head || head.index > 0) return spliced;
  const fixed = withDuration(spliced.data, head.bytes);
  if (!fixed) return spliced;
  return {
    data: fixed.data,
    index: [
      { index: head.index, bytes: head.bytes + fixed.delta },
      ...spliced.index.slice(1),
    ],
  };
}

/** Folds pending segments from `source` into `target`'s part files, then deletes them. Returns per-part segment counts. */
async function mergePendingSegments(
  bucket: AudioBucket,
  plcId: string,
  source: string,
  target: string
): Promise<{ counts: Map<number, number>; merged: number }> {
  const sourcePrefix = recordingPrefix(plcId, source);
  const listed = classifyListing(sourcePrefix, await bucket.list(sourcePrefix));
  const counts = new Map<number, number>();
  let merged = 0;
  for (const [part, segs] of listed.segments) {
    const incoming: Array<{ index: number; data: Buffer }> = [];
    for (const s of segs) {
      const obj = await bucket.read(s.path);
      if (obj) incoming.push({ index: s.index, data: obj.data });
    }
    const dest = partPath(plcId, target, part);
    const existing = await bucket.read(dest);
    const spliced = spliceSegments(existing, incoming);
    if (spliced.added > 0 || !existing) {
      const playable = withPlayableDuration(spliced);
      await bucket.write(dest, playable.data, {
        [SEGMENT_INDEX_META]: encodeSegmentIndex(playable.index),
      });
    }
    // Segments are removed only after the part file holding them is written.
    for (const s of segs) await bucket.remove(s.path);
    counts.set(part, spliced.index.filter((e) => e.index >= 0).length);
    merged += spliced.added;
  }
  return { counts, merged };
}

/** Takes the finalize lock when the recording is in one of `from`; returns its data, or null when another state won. */
async function claimForFinalize(
  deps: RecordingDeps,
  ref: DocRef,
  accept: (rec: Data) => boolean
): Promise<Data | null> {
  return deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const rec = snap.data() as Data;
    if (!accept(rec)) return null;
    tx.update(ref, {
      status: 'finalizing',
      finalizingAt: admin.firestore.Timestamp.fromMillis(deps.now()),
    });
    return rec;
  });
}

export type FinalizeReason = 'stopped' | StaleAction | 'late';

/** Concatenates every pending segment into part files and marks the recording ready. */
async function completeFinalize(
  deps: RecordingDeps,
  plcId: string,
  recordingId: string,
  rec: Data,
  reason: FinalizeReason
): Promise<void> {
  const ref = recordingRef(deps.db, plcId, recordingId);
  const { counts, merged } = await mergePendingSegments(
    deps.bucket,
    plcId,
    recordingId,
    recordingId
  );
  const { parts, durationMs } = mergeParts(rec.parts, counts);
  const update: Data = {
    status: 'ready',
    parts,
    durationMs,
    finalizedAt: admin.firestore.Timestamp.fromMillis(deps.now()),
    finalizingAt: admin.firestore.FieldValue.delete(),
  };
  if (reason === 'interrupted') update.interruptedAtMs = num(rec.durationMs);
  if (rec.audioExpiresAt == null && rec.audioDeletedAt == null) {
    const created = toMillis(rec.createdAt) || deps.now();
    update.audioExpiresAt = admin.firestore.Timestamp.fromMillis(
      created + AUDIO_RETENTION_MS
    );
  }
  if (reason === 'late') {
    update.error = admin.firestore.FieldValue.delete();
    update.mergedSegments = admin.firestore.FieldValue.increment(merged);
  }
  await ref.update(update);
}

/** Runs one finalize from `accept`ed states, then sweeps up segments that landed while the lock was held. */
export async function finalizeRecording(
  deps: RecordingDeps,
  plcId: string,
  recordingId: string,
  reason: FinalizeReason,
  accept: (rec: Data) => boolean
): Promise<boolean> {
  const ref = recordingRef(deps.db, plcId, recordingId);
  const rec = await claimForFinalize(deps, ref, accept);
  if (!rec) return false;
  await completeFinalize(deps, plcId, recordingId, rec, reason);
  await settleLateSegments(deps, plcId, recordingId);
  return true;
}

/** Re-lists after a lock is released, so a segment the trigger skipped mid-lock is still placed. */
async function settleLateSegments(
  deps: RecordingDeps,
  plcId: string,
  recordingId: string
): Promise<void> {
  const prefix = recordingPrefix(plcId, recordingId);
  for (let round = 0; round < MAX_MERGE_ROUNDS; round += 1) {
    const listed = classifyListing(prefix, await deps.bucket.list(prefix));
    if (listed.segments.size === 0) return;
    const handled = await handleLateSegments(deps, plcId, recordingId, true);
    if (!handled) return;
  }
}

/** MR-D8 entry point for the Storage trigger. Returns whether any work was done. */
export async function handleLateSegments(
  deps: RecordingDeps,
  plcId: string,
  recordingId: string,
  settling = false
): Promise<boolean> {
  const ref = recordingRef(deps.db, plcId, recordingId);
  const snap = await ref.get();
  const rec = snap.exists ? (snap.data() as Data) : undefined;
  const action = lateSegmentAction(rec);
  if (action === 'ignore') return false;
  if (action === 'discard') {
    await discardSegments(deps.bucket, plcId, recordingId, !rec);
    return true;
  }
  if (action === 'merge') {
    const merged = await claimForFinalize(
      deps,
      ref,
      (r) => lateSegmentAction(r) === 'merge'
    );
    if (!merged) return false;
    await completeFinalize(deps, plcId, recordingId, merged, 'late');
    if (!settling) await settleLateSegments(deps, plcId, recordingId);
    return true;
  }
  await recoverSegments(deps, plcId, recordingId);
  return true;
}

async function discardSegments(
  bucket: AudioBucket,
  plcId: string,
  recordingId: string,
  everything: boolean
): Promise<void> {
  const prefix = recordingPrefix(plcId, recordingId);
  const names = await bucket.list(prefix);
  const listed = classifyListing(prefix, names);
  const doomed = everything
    ? names.filter((n) => n.startsWith(prefix))
    : [...listed.segments.values()].flat().map((s) => s.path);
  for (const path of doomed) await bucket.remove(path);
}

/** Moves late segments of an already-transcribed recording into a separate "Recovered audio" recording. */
async function recoverSegments(
  deps: RecordingDeps,
  plcId: string,
  parentId: string
): Promise<void> {
  const prefix = recordingPrefix(plcId, parentId);
  for (let round = 0; round < MAX_MERGE_ROUNDS; round += 1) {
    if (!(await recoverOnce(deps, plcId, parentId))) return;
    const listed = classifyListing(prefix, await deps.bucket.list(prefix));
    if (listed.segments.size === 0) return;
  }
}

async function recoverOnce(
  deps: RecordingDeps,
  plcId: string,
  parentId: string
): Promise<boolean> {
  const parentRef = recordingRef(deps.db, plcId, parentId);
  const nowMs = deps.now();
  const targetId = await deps.db.runTransaction(async (tx) => {
    const parentSnap = await tx.get(parentRef);
    if (!parentSnap.exists) return null;
    const parent = parentSnap.data() as Data;
    if (lateSegmentAction(parent) !== 'recover') return null;
    const existingId =
      typeof parent.recoveredInto === 'string' ? parent.recoveredInto : null;
    if (existingId) {
      const existingRef = recordingRef(deps.db, plcId, existingId);
      const existing = await tx.get(existingRef);
      const e = existing.data() as Data | undefined;
      if (e && lateSegmentAction(e) === 'merge') {
        tx.update(existingRef, {
          status: 'finalizing',
          finalizingAt: admin.firestore.Timestamp.fromMillis(nowMs),
        });
        return existingId;
      }
      // The lock holder re-lists this parent after it releases, so it picks these segments up.
      if (e && e.status === 'finalizing') return null;
    }
    const id = deps.newId();
    tx.create(recordingRef(deps.db, plcId, id), {
      noteId: parent.noteId ?? null,
      recorderUid: parent.recorderUid ?? null,
      recoveredFrom: parentId,
      status: 'finalizing',
      finalizingAt: admin.firestore.Timestamp.fromMillis(nowMs),
      parts: [],
      durationMs: 0,
      createdAt: admin.firestore.Timestamp.fromMillis(nowMs),
      audioExpiresAt: admin.firestore.Timestamp.fromMillis(
        nowMs + AUDIO_RETENTION_MS
      ),
    });
    tx.update(parentRef, { recoveredInto: id });
    return id;
  });
  if (!targetId) return false;
  const targetRef = recordingRef(deps.db, plcId, targetId);
  const target = ((await targetRef.get()).data() ?? {}) as Data;
  const { counts } = await mergePendingSegments(
    deps.bucket,
    plcId,
    parentId,
    targetId
  );
  const { parts, durationMs } = mergeParts(target.parts, counts);
  await targetRef.update({
    status: 'ready',
    parts,
    durationMs,
    finalizedAt: admin.firestore.Timestamp.fromMillis(deps.now()),
    finalizingAt: admin.firestore.FieldValue.delete(),
  });
  return true;
}

/** Hard-deletes a recording's audio (MR-D9, MR-D11). Marks first so late segments are dropped, not merged. */
export async function deleteRecordingAudio(
  deps: RecordingDeps,
  plcId: string,
  recordingId: string,
  reason: AudioDeletedReason
): Promise<void> {
  const ref = recordingRef(deps.db, plcId, recordingId);
  await ref.update({
    audioDeletedAt: admin.firestore.Timestamp.fromMillis(deps.now()),
    audioDeletedReason: reason,
  });
  const prefix = recordingPrefix(plcId, recordingId);
  for (const path of await deps.bucket.list(prefix)) {
    if (path.startsWith(prefix)) await deps.bucket.remove(path);
  }
  // Cleared only once every object is gone, so a failed delete is retried by the daily sweep.
  await ref.update({ audioExpiresAt: admin.firestore.FieldValue.delete() });
}

/** Removes a recording entirely: audio, transcript and the doc (gcPlcOrphans, hard-deleted note). */
export async function purgeRecording(
  deps: Pick<RecordingDeps, 'db' | 'bucket'>,
  ref: DocRef
): Promise<void> {
  const plcId = ref.parent.parent?.id;
  if (!plcId) return;
  const prefix = recordingPrefix(plcId, ref.id);
  for (const path of await deps.bucket.list(prefix)) {
    if (path.startsWith(prefix)) await deps.bucket.remove(path);
  }
  const transcripts = await ref.collection('transcript').get();
  for (const t of transcripts.docs) await t.ref.delete();
  await ref.delete();
}

// ───────────────────────── scheduled runs ─────────────────────────

export async function runFinalizeStaleRecordings(
  deps: RecordingDeps
): Promise<Record<StaleAction, number>> {
  const counts: Record<StaleAction, number> = {
    interrupted: 0,
    'paused-timeout': 0,
    'lease-expired': 0,
    'time-limit': 0,
  };
  const snap = await deps.db
    .collectionGroup('recordings')
    .where('status', 'in', ['recording', 'paused', 'finalizing'])
    .limit(MAX_SWEEP_PER_RUN)
    .get();
  for (const doc of snap.docs) {
    const plcId = doc.ref.parent.parent?.id;
    if (!plcId) continue;
    const created = doc.createTime?.toMillis() ?? 0;
    const action = staleAction(doc.data(), deps.now(), created);
    if (!action) continue;
    try {
      // The check repeats inside the transaction: a heartbeat may have landed since the query.
      const done = await finalizeRecording(
        deps,
        plcId,
        doc.id,
        action,
        (rec) => staleAction(rec, deps.now(), created) === action
      );
      if (done) counts[action] += 1;
    } catch (err) {
      logger.error('[finalizeStalePlcRecordings] failed', {
        path: doc.ref.path,
        err: String(err),
      });
    }
  }
  return counts;
}

export async function runSweepExpiredRecordingAudio(
  deps: RecordingDeps
): Promise<number> {
  const nowMs = deps.now();
  let deleted = 0;
  // Both value types are queried: a range filter never mixes Timestamps and numbers.
  for (const bound of [admin.firestore.Timestamp.fromMillis(nowMs), nowMs]) {
    let last: admin.firestore.QueryDocumentSnapshot | undefined;
    let visited = 0;
    while (visited < MAX_SWEEP_PER_RUN) {
      let q = deps.db
        .collectionGroup('recordings')
        .where('audioExpiresAt', '<=', bound)
        .orderBy('audioExpiresAt')
        .limit(SWEEP_PAGE_SIZE);
      if (last) q = q.startAfter(last);
      const page = await q.get();
      if (page.empty) break;
      for (const doc of page.docs) {
        visited += 1;
        const plcId = doc.ref.parent.parent?.id;
        const rec = doc.data();
        if (!plcId) continue;
        if (
          rec.status === 'recording' ||
          rec.status === 'paused' ||
          rec.status === 'finalizing'
        )
          continue;
        try {
          if (rec.status === 'queued' || rec.status === 'transcribing') {
            await doc.ref.update({ status: 'failed', error: 'audio-expired' });
          }
          await deleteRecordingAudio(deps, plcId, doc.id, 'expired');
          deleted += 1;
        } catch (err) {
          logger.error('[sweepPlcRecordingAudio] failed', {
            path: doc.ref.path,
            err: String(err),
          });
        }
      }
      last = page.docs[page.docs.length - 1];
      if (page.size < SWEEP_PAGE_SIZE) break;
    }
  }
  return deleted;
}

// ───────────────────────── callables ─────────────────────────

export async function finalizeAsRecorder(
  deps: RecordingDeps,
  uid: string,
  plcId: string,
  recordingId: string
): Promise<{ status: RecordingStatus; stopped: boolean }> {
  const [plcSnap, recSnap] = await Promise.all([
    deps.db.collection('plcs').doc(plcId).get(),
    recordingRef(deps.db, plcId, recordingId).get(),
  ]);
  const rec = recSnap.data() as Data | undefined;
  if (!rec || !isPlcMember(plcSnap.data(), uid) || rec.recorderUid !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the person recording can stop it.'
    );
  }
  let stopped = false;
  if (rec.status === 'recording' || rec.status === 'paused') {
    stopped = await finalizeRecording(
      deps,
      plcId,
      recordingId,
      'stopped',
      (r) => r.status === 'recording' || r.status === 'paused'
    );
  }
  const after = (
    await recordingRef(deps.db, plcId, recordingId).get()
  ).data() as Data;
  return { status: after.status as RecordingStatus, stopped };
}

const BLOCKS_EARLY_DELETE = new Set([
  'recording',
  'paused',
  'finalizing',
  'transcribing',
]);

export async function deleteAudioAsEditor(
  deps: RecordingDeps,
  uid: string,
  plcId: string,
  recordingId: string
): Promise<{ deleted: boolean }> {
  const ref = recordingRef(deps.db, plcId, recordingId);
  const [plcSnap, recSnap] = await Promise.all([
    deps.db.collection('plcs').doc(plcId).get(),
    ref.get(),
  ]);
  if (!canEditPlc(plcSnap.data(), uid)) {
    throw new HttpsError('permission-denied', 'Only editors can do this.');
  }
  const rec = recSnap.data() as Data | undefined;
  if (!rec) throw new HttpsError('not-found', 'Recording not found.');
  if (BLOCKS_EARLY_DELETE.has(String(rec.status))) {
    throw new HttpsError(
      'failed-precondition',
      rec.status === 'transcribing'
        ? 'Notes are being made from this recording. Try again when they are ready.'
        : 'Stop the recording first.'
    );
  }
  if (rec.audioDeletedAt != null && rec.audioExpiresAt == null) {
    return { deleted: false };
  }
  if (rec.status === 'queued') {
    await ref.update({ status: 'ready', requestedBy: null });
  }
  await deleteRecordingAudio(deps, plcId, recordingId, 'manual');
  return { deleted: true };
}
