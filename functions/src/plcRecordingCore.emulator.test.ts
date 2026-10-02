// Runs only under the emulators: firebase emulators:exec --project demo-spartboard --only firestore,storage "pnpm -C functions exec vitest run src/plcRecordingCore.emulator.test.ts"
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import {
  adminAudioBucket,
  AUDIO_RETENTION_MS,
  deleteAudioAsEditor,
  finalizeAsRecorder,
  handleLateSegments,
  partPath,
  purgeRecording,
  recordingPrefix,
  recordingRef,
  runFinalizeStaleRecordings,
  runSweepExpiredRecordingAudio,
  segmentPath,
  STALE_PAUSE_MS,
  STALE_RECORDING_MS,
  type RecordingDeps,
} from './plcRecordingCore';
import { runGcPlcOrphans } from './gcPlcOrphans';

const RUN =
  !!process.env.FIRESTORE_EMULATOR_HOST &&
  !!process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const BUCKET = 'demo-spartboard.appspot.com';
const T = admin.firestore.Timestamp;

describe.skipIf(!RUN)('meeting recording against the emulators', () => {
  let deps: RecordingDeps;
  const now = 1_900_000_000_000;
  let idSeq = 0;
  let plcId = '';

  beforeAll(() => {
    if (admin.apps.length === 0)
      admin.initializeApp({ projectId: 'demo-spartboard' });
  });

  beforeEach(async () => {
    idSeq += 1;
    plcId = `plc${idSeq}_${Math.random().toString(36).slice(2, 8)}`;
    const db = admin.firestore();
    deps = {
      db,
      bucket: adminAudioBucket(admin.storage().bucket(BUCKET)),
      now: () => now,
      newId: () => `recovered${(idSeq += 1)}`,
    };
    await db
      .collection('plcs')
      .doc(plcId)
      .set({
        memberUids: ['rec', 'ed', 'view'],
        members: {
          rec: { role: 'member' },
          ed: { role: 'lead' },
          view: { role: 'viewer' },
        },
      });
    await db.collection('plcs').doc(plcId).collection('notes').doc('n1').set({
      title: 'Meeting',
    });
  });

  const put = (path: string, text: string) =>
    deps.bucket.write(path, Buffer.from(text), {});

  async function names(recId: string) {
    const prefix = recordingPrefix(plcId, recId);
    return (await deps.bucket.list(prefix))
      .map((n) => n.slice(prefix.length))
      .sort();
  }

  async function text(path: string) {
    return (await deps.bucket.read(path))?.data.toString() ?? null;
  }

  async function seed(recId: string, data: Record<string, unknown>) {
    await recordingRef(deps.db, plcId, recId).set({
      noteId: 'n1',
      recorderUid: 'rec',
      status: 'recording',
      parts: [],
      durationMs: 0,
      lastHeartbeatAt: T.fromMillis(now),
      createdAt: T.fromMillis(now),
      audioExpiresAt: T.fromMillis(now + AUDIO_RETENTION_MS),
      ...data,
    });
  }

  async function rec(recId: string) {
    return (await recordingRef(deps.db, plcId, recId).get()).data();
  }

  it('finalize concatenates each part in order and deletes the segments', async () => {
    await seed('r1', {
      parts: [
        { segmentCount: 3, durationMs: 80_000 },
        { segmentCount: 1, durationMs: 10_000 },
      ],
      durationMs: 90_000,
    });
    await put(segmentPath(plcId, 'r1', 0, 2), 'C');
    await put(segmentPath(plcId, 'r1', 0, 0), 'A');
    await put(segmentPath(plcId, 'r1', 0, 1), 'B');
    await put(segmentPath(plcId, 'r1', 1, 0), 'X');

    await expect(finalizeAsRecorder(deps, 'ed', plcId, 'r1')).rejects.toThrow();
    expect(await finalizeAsRecorder(deps, 'rec', plcId, 'r1')).toEqual({
      status: 'ready',
    });

    expect(await names('r1')).toEqual(['0.webm', '1.webm']);
    expect(await text(partPath(plcId, 'r1', 0))).toBe('ABC');
    expect(await text(partPath(plcId, 'r1', 1))).toBe('X');
    const after = await rec('r1');
    expect(after?.status).toBe('ready');
    expect(after?.durationMs).toBe(90_000);
    expect(after?.interruptedAtMs).toBeUndefined();
    // Calling again is a no-op that reports the current state.
    expect(await finalizeAsRecorder(deps, 'rec', plcId, 'r1')).toEqual({
      status: 'ready',
    });
  });

  it('merges a late segment into the middle of a finalized part', async () => {
    await seed('r2', { parts: [{ segmentCount: 3, durationMs: 90_000 }] });
    await put(segmentPath(plcId, 'r2', 0, 0), 'A');
    await put(segmentPath(plcId, 'r2', 0, 2), 'C');
    await finalizeAsRecorder(deps, 'rec', plcId, 'r2');
    expect(await text(partPath(plcId, 'r2', 0))).toBe('AC');

    await put(segmentPath(plcId, 'r2', 0, 1), 'B');
    expect(await handleLateSegments(deps, plcId, 'r2')).toBe(true);
    expect(await text(partPath(plcId, 'r2', 0))).toBe('ABC');
    expect(await names('r2')).toEqual(['0.webm']);
    const after = await rec('r2');
    expect(after?.status).toBe('ready');
    expect(after?.mergedSegments).toBe(1);
    expect(after?.durationMs).toBe(90_000);
  });

  it('leaves live uploads alone', async () => {
    await seed('r3', {});
    await put(segmentPath(plcId, 'r3', 0, 0), 'A');
    expect(await handleLateSegments(deps, plcId, 'r3')).toBe(false);
    expect(await names('r3')).toEqual(['0/0.webm']);
  });

  it('moves late audio of a transcribed recording into Recovered audio, reusing it for the next segment', async () => {
    await seed('r4', {
      status: 'transcribed',
      audioDeletedAt: T.fromMillis(now),
      audioDeletedReason: 'transcribed',
    });
    await put(segmentPath(plcId, 'r4', 0, 5), 'late');
    await handleLateSegments(deps, plcId, 'r4');

    const parent = await rec('r4');
    const recoveredId = parent?.recoveredInto as string;
    expect(recoveredId).toBeTruthy();
    expect(await names('r4')).toEqual([]);
    expect(await text(partPath(plcId, recoveredId, 0))).toBe('late');
    const recovered = await rec(recoveredId);
    expect(recovered?.recoveredFrom).toBe('r4');
    expect(recovered?.status).toBe('ready');
    expect(recovered?.noteId).toBe('n1');
    expect(recovered?.durationMs).toBe(30_000);

    await put(segmentPath(plcId, 'r4', 0, 6), '-more');
    await handleLateSegments(deps, plcId, 'r4');
    expect((await rec('r4'))?.recoveredInto).toBe(recoveredId);
    expect(await text(partPath(plcId, recoveredId, 0))).toBe('late-more');
  });

  it('drops late segments of audio an editor deleted', async () => {
    await seed('r5', { status: 'ready' });
    await put(partPath(plcId, 'r5', 0), 'AB');
    await deleteAudioAsEditor(deps, 'ed', plcId, 'r5');
    await put(segmentPath(plcId, 'r5', 0, 9), 'late');
    await handleLateSegments(deps, plcId, 'r5');
    expect(await names('r5')).toEqual([]);
    expect((await rec('r5'))?.recoveredInto).toBeUndefined();
  });

  it('early delete removes only this recording, refuses viewers and live recordings', async () => {
    await seed('r6', { status: 'ready' });
    await seed('keep', { status: 'ready' });
    await put(partPath(plcId, 'r6', 0), 'AB');
    await put(partPath(plcId, 'r6', 1), 'CD');
    await put(partPath(plcId, 'keep', 0), 'KEEP');
    await seed('live', { status: 'recording' });
    await put(segmentPath(plcId, 'live', 0, 0), 'L');

    await expect(
      deleteAudioAsEditor(deps, 'view', plcId, 'r6')
    ).rejects.toThrow('Only editors');
    await expect(
      deleteAudioAsEditor(deps, 'ed', plcId, 'live')
    ).rejects.toThrow('Stop the recording');
    expect(await deleteAudioAsEditor(deps, 'ed', plcId, 'r6')).toEqual({
      deleted: true,
    });

    expect(await names('r6')).toEqual([]);
    expect(await names('keep')).toEqual(['0.webm']);
    expect(await names('live')).toEqual(['0/0.webm']);
    const after = await rec('r6');
    expect(after?.audioDeletedReason).toBe('manual');
    expect(after?.audioDeletedAt).toBeTruthy();
    expect(after?.audioExpiresAt).toBeUndefined();
    expect(await deleteAudioAsEditor(deps, 'ed', plcId, 'r6')).toEqual({
      deleted: false,
    });
  });

  it('the stale finalizer interrupts silent recordings and stops long pauses only', async () => {
    const live = now;
    await seed('silent', {
      lastHeartbeatAt: T.fromMillis(live - STALE_RECORDING_MS - 1000),
      durationMs: 125_000,
      parts: [{ segmentCount: 5, durationMs: 125_000 }],
    });
    await seed('beating', { lastHeartbeatAt: T.fromMillis(live - 1000) });
    await seed('short-pause', {
      status: 'paused',
      lastHeartbeatAt: T.fromMillis(live - STALE_RECORDING_MS - 1000),
    });
    await seed('long-pause', {
      status: 'paused',
      lastHeartbeatAt: T.fromMillis(live - STALE_PAUSE_MS - 1000),
    });
    await put(segmentPath(plcId, 'silent', 0, 0), 'S');

    const counts = await runFinalizeStaleRecordings(deps);
    expect(counts.interrupted).toBeGreaterThanOrEqual(1);
    expect(counts['paused-timeout']).toBeGreaterThanOrEqual(1);

    const silent = await rec('silent');
    expect(silent?.status).toBe('ready');
    expect(silent?.interruptedAtMs).toBe(125_000);
    expect(await text(partPath(plcId, 'silent', 0))).toBe('S');
    expect((await rec('beating'))?.status).toBe('recording');
    expect((await rec('short-pause'))?.status).toBe('paused');
    const longPause = await rec('long-pause');
    expect(longPause?.status).toBe('ready');
    expect(longPause?.interruptedAtMs).toBeUndefined();
  });

  it('the 30-day sweep deletes only expired audio, for Timestamp and number expiries', async () => {
    await seed('old-ts', {
      status: 'ready',
      audioExpiresAt: T.fromMillis(now - 1000),
    });
    await seed('old-num', { status: 'failed', audioExpiresAt: now - 1000 });
    await seed('fresh', { status: 'ready' });
    await seed('stuck', {
      status: 'queued',
      audioExpiresAt: T.fromMillis(now - 1000),
    });
    for (const id of ['old-ts', 'old-num', 'fresh', 'stuck']) {
      await put(partPath(plcId, id, 0), id);
    }

    const deleted = await runSweepExpiredRecordingAudio(deps);
    expect(deleted).toBeGreaterThanOrEqual(3);

    for (const id of ['old-ts', 'old-num', 'stuck']) {
      expect(await names(id)).toEqual([]);
      const r = await rec(id);
      expect(r?.audioDeletedReason).toBe('expired');
      expect(r?.audioExpiresAt).toBeUndefined();
    }
    expect((await rec('stuck'))?.status).toBe('failed');
    expect(await names('fresh')).toEqual(['0.webm']);
    expect((await rec('fresh'))?.audioDeletedAt).toBeUndefined();
  });

  it('purgeRecording removes audio, transcript and the doc', async () => {
    await seed('gone', { status: 'transcribed' });
    await recordingRef(deps.db, plcId, 'gone')
      .collection('transcript')
      .doc('main')
      .set({ segments: [] });
    await put(partPath(plcId, 'gone', 0), 'X');
    await purgeRecording(deps, recordingRef(deps.db, plcId, 'gone'));
    expect(await names('gone')).toEqual([]);
    expect(await rec('gone')).toBeUndefined();
    const t = await recordingRef(deps.db, plcId, 'gone')
      .collection('transcript')
      .doc('main')
      .get();
    expect(t.exists).toBe(false);
  });

  it('gcPlcOrphans purges recordings of a hard-deleted note and keeps the rest', async () => {
    const db = deps.db;
    const plcRef = db.collection('plcs').doc(plcId);
    await plcRef
      .collection('notes')
      .doc('trashed')
      .set({
        deletedAt: T.fromMillis(Date.now() - 1000),
      });
    await seed('on-live', {});
    await seed('on-trashed', { noteId: 'trashed', status: 'ready' });
    await seed('on-missing', { noteId: 'missing', status: 'ready' });
    for (const id of ['on-live', 'on-trashed', 'on-missing']) {
      await put(partPath(plcId, id, 0), id);
    }
    await runGcPlcOrphans(db, Date.now(), (ref) => purgeRecording(deps, ref));
    expect(await rec('on-missing')).toBeUndefined();
    expect(await names('on-missing')).toEqual([]);
    expect(await rec('on-live')).toBeTruthy();
    expect(await names('on-trashed')).toEqual(['0.webm']);
  });
});
