// Unit tests for PLC meeting notes: request gating, quota refunds, the queued job steps and draft resolve.
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  storage: vi.fn(),
  firestore: vi.fn(),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError: FakeHttpsError };
});
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('ffmpeg-static', () => ({ default: '/usr/bin/ffmpeg' }));
vi.mock('fluent-ffmpeg', () => ({
  default: Object.assign(vi.fn(), { setFfmpegPath: vi.fn() }),
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./aiGeneration', () => ({
  enforceAiFeatureAccess: vi.fn(),
  getGeminiModelConfig: vi.fn(),
  refundAiUsage: vi.fn(),
  resolveCallerIsAdmin: vi.fn(),
  vertexClientOptions: vi.fn(),
}));

import {
  autoQueueMeetingNotes,
  notesBlocker,
  parseNotesRequest,
  parseResolveRequest,
  requestMeetingNotes,
  resolveMeetingNotesDraft,
  runMeetingNotesJob,
  STALE_JOB_MS,
  type JobDeps,
} from './plcMeetingNotes';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const PLC = 'plc-1';
const REC = 'rec-1';
const EDITOR = 'u-editor';
const VIEWER = 'u-viewer';
const NOW = 1_800_000_000_000;
const REC_PATH = `plcs/${PLC}/recordings/${REC}`;
const CHARGE = { docIds: ['a', 'b', 'c'] };

const plcDoc = (): StubData => ({
  memberUids: [EDITOR, VIEWER, 'u-sarah'],
  members: {
    [EDITOR]: { role: 'member', status: 'active', displayName: 'Pat Lee' },
    [VIEWER]: { role: 'viewer', status: 'active', displayName: 'Viewer' },
    'u-sarah': { role: 'member', status: 'active', displayName: 'Sarah Lund' },
  },
});

function setup(rec: StubData, opts: { admin?: boolean } = {}) {
  const fs = makeStubFirestore({
    [`plcs/${PLC}`]: plcDoc(),
    [REC_PATH]: rec,
  });
  let id = 0;
  const deps: JobDeps = {
    db: fs.db as never,
    now: () => NOW,
    newId: () => `id-${(id += 1)}`,
    isAdmin: vi.fn(() => Promise.resolve(opts.admin === true)),
    charge: vi.fn(() => Promise.resolve(CHARGE)),
    refund: vi.fn(() => Promise.resolve()),
    prepareAudio: vi.fn(() =>
      Promise.resolve({
        uri: 'gs://bucket/audio.webm',
        cleanup: vi.fn(() => Promise.resolve()),
      })
    ),
    transcribe: vi.fn(() =>
      Promise.resolve([
        { speaker: 1, startMs: 0, text: 'Sarah will build the warm-up.' },
      ])
    ),
    summarize: vi.fn(() =>
      Promise.resolve({
        agenda: ['Unit 3'],
        discussion: [],
        decisions: ['Reteach'],
        actionItems: [{ text: 'Build the warm-up', owner: 'Sarah' }],
      })
    ),
    deleteAudio: vi.fn(() => Promise.resolve()),
  };
  return { fs, deps };
}

const ready = (extra: StubData = {}): StubData => ({
  noteId: 'n-1',
  recorderUid: EDITOR,
  status: 'ready',
  parts: [{ segmentCount: 2, durationMs: 60_000 }],
  ...extra,
});

async function drain(fs: ReturnType<typeof makeStubFirestore>, deps: JobDeps) {
  for (let i = 0; i < 5; i += 1) {
    const rec = fs.get(REC_PATH)!;
    if (rec.status !== 'queued') return;
    await runMeetingNotesJob(deps, PLC, REC, rec.jobId as string);
  }
}

describe('request parsing', () => {
  it('rejects unknown modes and path-like ids', () => {
    expect(() =>
      parseNotesRequest({ plcId: PLC, recordingId: REC, mode: 'x' })
    ).toThrow('Unknown mode.');
    expect(() =>
      parseNotesRequest({ plcId: 'a/b', recordingId: REC, mode: 'transcribe' })
    ).toThrow('Malformed identifier.');
    expect(() =>
      parseResolveRequest({ plcId: PLC, recordingId: REC, action: 'inserted' })
    ).toThrow('Missing draft version.');
  });
});

describe('notesBlocker', () => {
  it('allows a transcription only while audio exists and no transcript was made', () => {
    expect(notesBlocker(ready(), 'transcribe', NOW)).toBeNull();
    expect(
      notesBlocker(ready({ audioDeletedAt: 1 }), 'transcribe', NOW)
    ).toMatch(/deleted/);
    expect(
      notesBlocker(ready({ hasTranscript: true }), 'transcribe', NOW)
    ).toMatch(/already/);
    expect(
      notesBlocker(ready({ status: 'recording' }), 'transcribe', NOW)
    ).toMatch(/not finished/);
  });

  it('allows a regenerate only from a saved transcript', () => {
    expect(notesBlocker(ready(), 'regenerate', NOW)).toMatch(/no transcript/);
    expect(
      notesBlocker(
        ready({ status: 'transcribed', hasTranscript: true }),
        'regenerate',
        NOW
      )
    ).toBeNull();
  });

  it('lets a stuck run be requested again', () => {
    const stuck = ready({
      status: 'transcribing',
      jobUpdatedAt: NOW - STALE_JOB_MS - 1,
    });
    expect(notesBlocker(stuck, 'transcribe', NOW)).toBeNull();
    expect(
      notesBlocker({ ...stuck, jobUpdatedAt: NOW - 1000 }, 'transcribe', NOW)
    ).toMatch(/already being made/);
  });
});

describe('requestMeetingNotes', () => {
  it('charges a non-admin editor and queues a transcribe job', async () => {
    const { fs, deps } = setup(ready());
    await requestMeetingNotes(
      { plcId: PLC, recordingId: REC, mode: 'transcribe' },
      EDITOR,
      {},
      deps
    );
    expect(deps.charge).toHaveBeenCalledWith({}, EDITOR, 'transcribe');
    const rec = fs.get(REC_PATH)!;
    expect(rec).toMatchObject({
      status: 'queued',
      job: 'transcribe',
      requestedBy: EDITOR,
      quotaCharge: CHARGE,
    });
    expect(fs.has(`${REC_PATH}/notesJobs/${rec.jobId as string}`)).toBe(true);
  });

  it('does not charge admins', async () => {
    const { fs, deps } = setup(ready(), { admin: true });
    await requestMeetingNotes(
      { plcId: PLC, recordingId: REC, mode: 'transcribe' },
      EDITOR,
      {},
      deps
    );
    expect(deps.charge).not.toHaveBeenCalled();
    expect(fs.get(REC_PATH)!.quotaCharge).toBeNull();
  });

  it('refuses viewers before charging', async () => {
    const { deps } = setup(ready());
    await expect(
      requestMeetingNotes(
        { plcId: PLC, recordingId: REC, mode: 'transcribe' },
        VIEWER,
        {},
        deps
      )
    ).rejects.toThrow(/Only editors/);
    expect(deps.charge).not.toHaveBeenCalled();
  });

  it('refunds when the recording changed before queueing', async () => {
    const { fs, deps } = setup(ready());
    deps.charge = vi.fn(() => {
      fs.store.set(REC_PATH, {
        ...fs.get(REC_PATH)!,
        status: 'queued',
        jobUpdatedAt: NOW,
      });
      return Promise.resolve(CHARGE);
    });
    await expect(
      requestMeetingNotes(
        { plcId: PLC, recordingId: REC, mode: 'transcribe' },
        EDITOR,
        {},
        deps
      )
    ).rejects.toThrow(/already being made/);
    expect(deps.refund).toHaveBeenCalledWith(CHARGE);
  });

  it('auto-queue after Stop reports false instead of throwing when access is denied', async () => {
    const { fs, deps } = setup(ready());
    deps.charge = vi.fn(() =>
      Promise.reject(new Error('Admin access required to use AI generation.'))
    );
    await expect(
      autoQueueMeetingNotes(PLC, REC, EDITOR, {}, deps)
    ).resolves.toBe(false);
    expect(fs.get(REC_PATH)!.status).toBe('ready');
  });
});

describe('runMeetingNotesJob', () => {
  it('transcribes, then summarizes into a draft and deletes the audio', async () => {
    const { fs, deps } = setup(ready());
    await requestMeetingNotes(
      { plcId: PLC, recordingId: REC, mode: 'transcribe' },
      EDITOR,
      {},
      deps
    );
    await drain(fs, deps);
    expect(fs.get(`${REC_PATH}/transcript/main`)).toEqual({
      segments: [
        { speaker: 1, startMs: 0, text: 'Sarah will build the warm-up.' },
      ],
      generatedAt: NOW,
    });
    const rec = fs.get(REC_PATH)!;
    expect(rec).toMatchObject({
      status: 'transcribed',
      hasTranscript: true,
      job: null,
      quotaCharge: null,
      audioDeletedReason: 'transcribed',
      draftResolvedAt: null,
      draft: {
        markdown: '## Agenda\n- Unit 3\n\n## Decisions\n- Reteach',
        generatedAt: NOW,
        generatedBy: EDITOR,
        source: 'gemini',
        actionItems: [
          { text: 'Build the warm-up', suggestedOwnerUid: 'u-sarah' },
        ],
      },
    });
    expect(deps.deleteAudio).toHaveBeenCalledWith(PLC, REC);
    expect(deps.refund).not.toHaveBeenCalled();
    expect([...fs.store.keys()].some((k) => k.includes('/notesJobs/'))).toBe(
      false
    );
  });

  it('marks the run failed, keeps the audio and refunds when Gemini fails', async () => {
    const { fs, deps } = setup(ready());
    deps.transcribe = vi.fn(() => Promise.reject(new Error('boom')));
    await requestMeetingNotes(
      { plcId: PLC, recordingId: REC, mode: 'transcribe' },
      EDITOR,
      {},
      deps
    );
    await drain(fs, deps);
    expect(fs.get(REC_PATH)).toMatchObject({
      status: 'failed',
      job: null,
      quotaCharge: null,
      error: "Couldn't make notes from this recording.",
    });
    expect(fs.get(REC_PATH)!.audioDeletedAt).toBeUndefined();
    expect(deps.deleteAudio).not.toHaveBeenCalled();
    expect(deps.refund).toHaveBeenCalledWith(CHARGE);
  });

  it('keeps the transcript when only the summary fails', async () => {
    const { fs, deps } = setup(ready());
    deps.summarize = vi.fn(() => Promise.reject(new Error('boom')));
    await requestMeetingNotes(
      { plcId: PLC, recordingId: REC, mode: 'transcribe' },
      EDITOR,
      {},
      deps
    );
    await drain(fs, deps);
    expect(fs.get(REC_PATH)).toMatchObject({
      status: 'failed',
      hasTranscript: true,
    });
    expect(fs.has(`${REC_PATH}/transcript/main`)).toBe(true);
    expect(notesBlocker(fs.get(REC_PATH), 'regenerate', NOW)).toBeNull();
  });

  it('ignores a job that is no longer current', async () => {
    const { fs, deps } = setup(
      ready({ status: 'queued', job: 'transcribe', jobId: 'new' })
    );
    await runMeetingNotesJob(deps, PLC, REC, 'old');
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(fs.get(REC_PATH)!.status).toBe('queued');
  });

  it('regenerates from the saved transcript without touching audio again', async () => {
    const { fs, deps } = setup(
      ready({ status: 'transcribed', hasTranscript: true, audioDeletedAt: 5 })
    );
    fs.store.set(`${REC_PATH}/transcript/main`, {
      segments: [{ speaker: 1, startMs: 0, text: 'Hi' }],
    });
    await requestMeetingNotes(
      { plcId: PLC, recordingId: REC, mode: 'regenerate' },
      EDITOR,
      {},
      deps
    );
    expect(deps.charge).toHaveBeenCalledWith({}, EDITOR, 'regenerate');
    await drain(fs, deps);
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(deps.deleteAudio).not.toHaveBeenCalled();
    expect(fs.get(REC_PATH)).toMatchObject({
      status: 'transcribed',
      audioDeletedAt: 5,
    });
  });
});

describe('resolveMeetingNotesDraft', () => {
  const withDraft = () =>
    ready({
      status: 'transcribed',
      draft: {
        markdown: 'x',
        actionItems: [],
        generatedAt: 42,
        generatedBy: EDITOR,
      },
      draftResolvedAt: null,
    });

  it('resolves once and refuses a second resolve', async () => {
    const { fs, deps } = setup(withDraft());
    const req = {
      plcId: PLC,
      recordingId: REC,
      generatedAt: 42,
      action: 'inserted' as const,
    };
    await resolveMeetingNotesDraft(req, EDITOR, deps);
    expect(fs.get(REC_PATH)).toMatchObject({
      draftResolvedAt: NOW,
      draftResolution: 'inserted',
      draftResolvedBy: EDITOR,
    });
    await expect(
      resolveMeetingNotesDraft({ ...req, action: 'dismissed' }, 'u-sarah', deps)
    ).rejects.toThrow(/already handled/);
  });

  it('refuses a stale draft version and lets only the resolver reopen', async () => {
    const { fs, deps } = setup(withDraft());
    await expect(
      resolveMeetingNotesDraft(
        { plcId: PLC, recordingId: REC, generatedAt: 41, action: 'dismissed' },
        EDITOR,
        deps
      )
    ).rejects.toThrow(/newer draft/);
    const req = { plcId: PLC, recordingId: REC, generatedAt: 42 };
    await resolveMeetingNotesDraft(
      { ...req, action: 'inserted' },
      EDITOR,
      deps
    );
    await expect(
      resolveMeetingNotesDraft({ ...req, action: 'reopen' }, 'u-sarah', deps)
    ).rejects.toThrow(/Nothing to reopen/);
    await resolveMeetingNotesDraft({ ...req, action: 'reopen' }, EDITOR, deps);
    expect(fs.get(REC_PATH)!.draftResolvedAt).toBeNull();
  });
});
