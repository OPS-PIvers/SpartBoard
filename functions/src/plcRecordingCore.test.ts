import { describe, it, expect } from 'vitest';
import {
  canEditPlc,
  classifyListing,
  decodeSegmentIndex,
  encodeSegmentIndex,
  ESTIMATED_SEGMENT_MS,
  lateSegmentAction,
  mergeParts,
  parseRecordingRequest,
  parseSegmentPath,
  partPath,
  recordingPrefix,
  segmentPath,
  spliceSegments,
  staleAction,
  STALE_PAUSE_MS,
  STALE_RECORDING_MS,
  FINALIZE_LEASE_MS,
} from './plcRecordingCore';

const NOW = 1_800_000_000_000;
const buf = (s: string) => Buffer.from(s, 'utf8');

describe('paths', () => {
  it('builds and parses segment paths', () => {
    const p = segmentPath('plc1', 'rec1', 2, 17);
    expect(p).toBe('plc_meeting_audio/plc1/rec1/2/17.webm');
    expect(parseSegmentPath(p)).toEqual({
      plcId: 'plc1',
      recordingId: 'rec1',
      part: 2,
      segment: 17,
    });
  });

  it('does not treat part files or other uploads as segments', () => {
    expect(parseSegmentPath(partPath('plc1', 'rec1', 0))).toBeNull();
    expect(parseSegmentPath('plc_norming_media/a/b/0/1.webm')).toBeNull();
    expect(parseSegmentPath('plc_meeting_audio/a/b/0/1.mp3')).toBeNull();
    expect(parseSegmentPath('plc_meeting_audio/a/b/c/0/1.webm')).toBeNull();
    expect(parseSegmentPath('plc_meeting_audio/a/b/1000/1.webm')).toBeNull();
  });

  it('classifies a listing into segments and part files', () => {
    const prefix = recordingPrefix('p', 'r');
    const listed = classifyListing(prefix, [
      `${prefix}0.webm`,
      `${prefix}0/3.webm`,
      `${prefix}0/1.webm`,
      `${prefix}1/0.webm`,
      `${prefix}junk.txt`,
      'plc_meeting_audio/p/other/0/0.webm',
    ]);
    expect([...listed.parts]).toEqual([0]);
    expect(listed.segments.get(0)?.map((s) => s.index)).toEqual([1, 3]);
    expect(listed.segments.get(1)?.map((s) => s.index)).toEqual([0]);
    expect(listed.segments.size).toBe(2);
  });
});

describe('segment index', () => {
  it('round-trips', () => {
    const entries = [
      { index: 0, bytes: 10 },
      { index: 2, bytes: 5 },
    ];
    expect(decodeSegmentIndex(encodeSegmentIndex(entries))).toEqual(entries);
  });

  it('rejects malformed values', () => {
    expect(decodeSegmentIndex(undefined)).toBeNull();
    expect(decodeSegmentIndex('')).toBeNull();
    expect(decodeSegmentIndex('0:1,x')).toBeNull();
  });
});

describe('spliceSegments', () => {
  it('concatenates fresh segments in index order', () => {
    const out = spliceSegments(null, [
      { index: 1, data: buf('BB') },
      { index: 0, data: buf('A') },
    ]);
    expect(out.data.toString()).toBe('ABB');
    expect(out.index).toEqual([
      { index: 0, bytes: 1 },
      { index: 1, bytes: 2 },
    ]);
    expect(out.added).toBe(2);
  });

  it('inserts a late segment between ones already merged', () => {
    const existing = {
      data: buf('AACC'),
      metadata: { segments: '0:2,2:2' },
    };
    const out = spliceSegments(existing, [{ index: 1, data: buf('b') }]);
    expect(out.data.toString()).toBe('AAbCC');
    expect(out.added).toBe(1);
  });

  it('skips a segment the part already holds (a retried upload)', () => {
    const existing = { data: buf('AB'), metadata: { segments: '0:1,1:1' } };
    const out = spliceSegments(existing, [{ index: 1, data: buf('Z') }]);
    expect(out.data.toString()).toBe('AB');
    expect(out.added).toBe(0);
  });

  it('appends when the stored index does not match the bytes', () => {
    const existing = { data: buf('ABC'), metadata: { segments: '0:1' } };
    const out = spliceSegments(existing, [{ index: 4, data: buf('D') }]);
    expect(out.data.toString()).toBe('ABCD');
    expect(out.added).toBe(1);
    const again = spliceSegments(
      { data: out.data, metadata: { segments: encodeSegmentIndex(out.index) } },
      [{ index: 4, data: buf('D') }]
    );
    expect(again.data.toString()).toBe('ABCD');
    expect(again.added).toBe(0);
  });
});

describe('mergeParts', () => {
  it('keeps reported durations when no segment was unreported', () => {
    const out = mergeParts(
      [{ segmentCount: 3, durationMs: 75_000 }],
      new Map([[0, 3]])
    );
    expect(out).toEqual({
      parts: [{ segmentCount: 3, durationMs: 75_000 }],
      durationMs: 75_000,
    });
  });

  it('estimates time for segments the recorder never reported', () => {
    const out = mergeParts(
      [{ segmentCount: 2, durationMs: 50_000 }],
      new Map([
        [0, 3],
        [2, 1],
      ])
    );
    expect(out.parts).toEqual([
      { segmentCount: 3, durationMs: 50_000 + ESTIMATED_SEGMENT_MS },
      { segmentCount: 0, durationMs: 0 },
      { segmentCount: 1, durationMs: ESTIMATED_SEGMENT_MS },
    ]);
    expect(out.durationMs).toBe(50_000 + 2 * ESTIMATED_SEGMENT_MS);
  });

  it('tolerates malformed parts', () => {
    expect(mergeParts('nope', new Map()).durationMs).toBe(0);
  });
});

describe('staleAction', () => {
  it('interrupts a recording with no heartbeat for 5 minutes', () => {
    expect(
      staleAction(
        { status: 'recording', lastHeartbeatAt: NOW - STALE_RECORDING_MS - 1 },
        NOW
      )
    ).toBe('interrupted');
    expect(
      staleAction(
        { status: 'recording', lastHeartbeatAt: NOW - STALE_RECORDING_MS + 1 },
        NOW
      )
    ).toBeNull();
  });

  it('stops a recording paused for 30 minutes, not sooner', () => {
    expect(
      staleAction(
        { status: 'paused', lastHeartbeatAt: NOW - STALE_RECORDING_MS - 1 },
        NOW
      )
    ).toBeNull();
    expect(
      staleAction(
        { status: 'paused', lastHeartbeatAt: NOW - STALE_PAUSE_MS - 1 },
        NOW
      )
    ).toBe('paused-timeout');
  });

  it('falls back to createdAt and reads Timestamps', () => {
    const ts = { toMillis: () => NOW - STALE_RECORDING_MS - 1 };
    expect(staleAction({ status: 'recording', createdAt: ts }, NOW)).toBe(
      'interrupted'
    );
  });

  it('retakes an abandoned finalize lock', () => {
    expect(
      staleAction(
        { status: 'finalizing', finalizingAt: NOW - FINALIZE_LEASE_MS - 1 },
        NOW
      )
    ).toBe('lease-expired');
    expect(
      staleAction({ status: 'finalizing', finalizingAt: NOW - 1000 }, NOW)
    ).toBeNull();
  });

  it('leaves finished recordings alone', () => {
    expect(
      staleAction({ status: 'ready', lastHeartbeatAt: 0 }, NOW)
    ).toBeNull();
  });
});

describe('lateSegmentAction', () => {
  it('ignores live uploads and the finalize lock', () => {
    expect(lateSegmentAction({ status: 'recording' })).toBe('ignore');
    expect(lateSegmentAction({ status: 'paused' })).toBe('ignore');
    expect(lateSegmentAction({ status: 'finalizing' })).toBe('ignore');
  });

  it('merges into a recording that has no transcript yet', () => {
    expect(lateSegmentAction({ status: 'ready' })).toBe('merge');
    expect(lateSegmentAction({ status: 'failed' })).toBe('merge');
  });

  it('recovers once a transcript exists or is being made', () => {
    expect(lateSegmentAction({ status: 'queued' })).toBe('recover');
    expect(lateSegmentAction({ status: 'transcribing' })).toBe('recover');
    expect(lateSegmentAction({ status: 'transcribed' })).toBe('recover');
    expect(
      lateSegmentAction({
        status: 'transcribed',
        audioDeletedAt: 1,
        audioDeletedReason: 'transcribed',
      })
    ).toBe('recover');
  });

  it('drops segments of audio someone deleted, expired audio, or a removed recording', () => {
    expect(
      lateSegmentAction({
        status: 'ready',
        audioDeletedAt: 1,
        audioDeletedReason: 'manual',
      })
    ).toBe('discard');
    expect(
      lateSegmentAction({ status: 'ready', audioDeletedReason: 'expired' })
    ).toBe('discard');
    expect(lateSegmentAction(undefined)).toBe('discard');
  });
});

describe('request parsing and roles', () => {
  it('accepts plain ids only', () => {
    expect(parseRecordingRequest({ plcId: 'a', recordingId: 'b' })).toEqual({
      plcId: 'a',
      recordingId: 'b',
    });
    expect(() =>
      parseRecordingRequest({ plcId: 'a/../x', recordingId: 'b' })
    ).toThrow();
    expect(() => parseRecordingRequest({ plcId: 'a' })).toThrow();
    expect(() => parseRecordingRequest(null)).toThrow();
  });

  it('mirrors plcCanEditContent', () => {
    const plc = {
      memberUids: ['lead', 'viewer', 'legacy'],
      members: {
        lead: { role: 'lead' },
        viewer: { role: 'viewer' },
        gone: { role: 'member', status: 'removed' },
      },
    };
    expect(canEditPlc(plc, 'lead')).toBe(true);
    expect(canEditPlc(plc, 'viewer')).toBe(false);
    expect(canEditPlc(plc, 'gone')).toBe(false);
    expect(canEditPlc(plc, 'legacy')).toBe(true);
    expect(canEditPlc(plc, 'stranger')).toBe(false);
    expect(canEditPlc(undefined, 'lead')).toBe(false);
  });
});
