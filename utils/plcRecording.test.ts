import { describe, expect, it } from 'vitest';
import {
  livePlcRecordingForNote,
  parsePlcRecording,
  parsePlcRecordingTranscript,
  plcRecordingDraftPending,
  plcRecordingPartPath,
  plcRecordingSegmentPath,
  plcRecordingsForNote,
} from './plcRecording';

const base = {
  noteId: 'n1',
  recorderUid: 'u1',
  status: 'recording',
  parts: [{ segmentCount: 2, durationMs: 60000 }],
  durationMs: 60000,
  lastHeartbeatAt: 1000,
  audioExpiresAt: 5000,
  createdAt: 900,
};

const ts = (ms: number) => ({ toMillis: () => ms });

describe('parsePlcRecording', () => {
  it('parses a live recording', () => {
    const r = parsePlcRecording('r1', base);
    expect(r).toMatchObject({
      id: 'r1',
      noteId: 'n1',
      recorderUid: 'u1',
      status: 'recording',
      durationMs: 60000,
      lastHeartbeatAt: 1000,
      audioExpiresAt: 5000,
      audioDeletedAt: null,
      draft: null,
      createdAt: 900,
    });
  });

  it('drops docs with no note or recorder', () => {
    expect(parsePlcRecording('r', { ...base, noteId: '' })).toBeNull();
    expect(parsePlcRecording('r', { ...base, recorderUid: 1 })).toBeNull();
    expect(parsePlcRecording('r', null)).toBeNull();
  });

  it('reads Firestore timestamps and server-only fields', () => {
    const r = parsePlcRecording('r', {
      ...base,
      createdAt: ts(100),
      lastHeartbeatAt: ts(200),
      audioExpiresAt: undefined,
      audioDeletedAt: ts(300),
      audioDeletedReason: 'manual',
      recoveredInto: 'r2',
      mergedSegments: 3,
    });
    expect(r?.createdAt).toBe(100);
    expect(r?.lastHeartbeatAt).toBe(200);
    expect(r?.audioExpiresAt).toBeNull();
    expect(r?.audioDeletedAt).toBe(300);
    expect(r?.audioDeletedReason).toBe('manual');
    expect(r?.recoveredInto).toBe('r2');
    expect(r?.mergedSegments).toBe(3);
    expect(
      parsePlcRecording('r', { ...base, audioDeletedReason: 'oops' })
        ?.audioDeletedReason
    ).toBeNull();
  });

  it('treats an unknown status as failed and sums part durations', () => {
    const r = parsePlcRecording('r', {
      ...base,
      status: 'exploded',
      durationMs: undefined,
      parts: [
        { segmentCount: 1, durationMs: 1000 },
        'junk',
        { segmentCount: 1, durationMs: 2500 },
      ],
    });
    expect(r?.status).toBe('failed');
    expect(r?.parts).toHaveLength(2);
    expect(r?.durationMs).toBe(3500);
  });

  it('parses a draft and drops malformed action items', () => {
    const r = parsePlcRecording('r', {
      ...base,
      status: 'transcribed',
      draft: {
        markdown: '## Decisions',
        actionItems: [
          { id: 'a1', text: 'Email parents', suggestedOwnerUid: 'u2' },
          { id: 'a2', text: '   ' },
          { text: 'no id' },
        ],
        generatedAt: 10,
        generatedBy: 'u1',
      },
    });
    expect(r?.draft?.actionItems).toEqual([
      { id: 'a1', text: 'Email parents', suggestedOwnerUid: 'u2' },
    ]);
    expect(r && plcRecordingDraftPending(r)).toBe(true);
    const resolved = parsePlcRecording('r', {
      ...base,
      draft: { markdown: 'x' },
      draftResolvedAt: 20,
    });
    expect(resolved && plcRecordingDraftPending(resolved)).toBe(false);
  });
});

describe('parsePlcRecordingTranscript', () => {
  it('keeps well-formed segments', () => {
    expect(
      parsePlcRecordingTranscript({
        segments: [
          { speaker: 2, startMs: 1500, text: 'Hello' },
          { speaker: 'x', startMs: -1, text: 'Hi' },
          { speaker: 1 },
        ],
      }).segments
    ).toEqual([
      { speaker: 2, startMs: 1500, text: 'Hello' },
      { speaker: 1, startMs: 0, text: 'Hi' },
    ]);
    expect(parsePlcRecordingTranscript(undefined).segments).toEqual([]);
  });
});

describe('note helpers', () => {
  const a = parsePlcRecording('a', { ...base, status: 'ready', createdAt: 2 });
  const b = parsePlcRecording('b', { ...base, status: 'paused', createdAt: 1 });
  const c = parsePlcRecording('c', { ...base, noteId: 'n2' });
  const all = [a, b, c].filter((r) => r !== null);

  it('orders a note’s recordings oldest first', () => {
    expect(plcRecordingsForNote(all, 'n1').map((r) => r.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('finds the live recording on a note', () => {
    expect(livePlcRecordingForNote(all, 'n1')?.id).toBe('b');
    expect(
      livePlcRecordingForNote(
        [a].filter((r) => r !== null),
        'n1'
      )
    ).toBe(null);
  });

  it('builds storage paths', () => {
    expect(plcRecordingSegmentPath('p', 'r', 0, 3)).toBe(
      'plc_meeting_audio/p/r/0/3.webm'
    );
    expect(plcRecordingPartPath('p', 'r', 1)).toBe(
      'plc_meeting_audio/p/r/1.webm'
    );
  });
});
