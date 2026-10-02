import { describe, it, expect } from 'vitest';
import {
  computeDurationMs,
  injectDuration,
  opusPacketMs,
  withDuration,
} from './webmDuration';
import {
  encodeSegmentIndex,
  spliceSegments,
  withPlayableDuration,
} from './plcRecordingCore';

const UNKNOWN = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

function el(id: number[], body: Buffer, unknownSize = false): Buffer {
  const size = unknownSize
    ? UNKNOWN
    : Buffer.from([0x40 | (body.length >> 8), body.length & 0xff]);
  return Buffer.concat([Buffer.from(id), size, body]);
}

function block(rel: number): Buffer {
  const body = Buffer.alloc(6);
  body[0] = 0x81;
  body.writeInt16BE(rel, 1);
  body[3] = 0x80;
  body[4] = 0x08; // Opus TOC: config 1 (20 ms), one frame.
  body[5] = 0x00;
  return el([0xa3], body);
}

function cluster(tc: number, blocks: number): Buffer {
  const tcBody = Buffer.alloc(2);
  tcBody.writeUInt16BE(tc);
  const parts = [el([0xe7], tcBody)];
  for (let i = 0; i < blocks; i++) parts.push(block(i * 20));
  return el([0x1f, 0x43, 0xb6, 0x75], Buffer.concat(parts), true);
}

const HEAD = Buffer.concat([
  el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], Buffer.from('webm'))),
  Buffer.from([0x18, 0x53, 0x80, 0x67]),
  UNKNOWN,
  el(
    [0x15, 0x49, 0xa9, 0x66],
    Buffer.concat([
      el([0x2a, 0xd7, 0xb1], Buffer.from([0x0f, 0x42, 0x40])),
      el([0x4d, 0x80], Buffer.from('Chrome')),
    ])
  ),
  el([0x16, 0x54, 0xae, 0x6b], Buffer.alloc(0)),
]);

function readDuration(b: Buffer): number | null {
  const at = b.indexOf(Buffer.from([0x44, 0x89, 0x88]));
  return at < 0 ? null : b.readDoubleBE(at + 3);
}

describe('webm duration', () => {
  const file = Buffer.concat([HEAD, cluster(0, 50), cluster(1000, 50)]);

  it('reads Opus frame lengths', () => {
    expect(opusPacketMs(Buffer.from([0x08]))).toBe(20);
    expect(opusPacketMs(Buffer.from([0x09]))).toBe(40);
    expect(opusPacketMs(Buffer.from([0x0b, 0x03]))).toBe(60);
    expect(opusPacketMs(Buffer.alloc(0))).toBe(0);
  });

  it('computes the end of the last block', () => {
    expect(computeDurationMs(file)).toBe(2000);
  });

  it('ignores a corrupt tail splice by scanning back to a parseable cluster', () => {
    const torn = Buffer.concat([
      file,
      Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x00]),
    ]);
    expect(computeDurationMs(torn)).toBe(2000);
  });

  it('injects Duration without moving anything after Info', () => {
    const fixed = injectDuration(file, 2000);
    expect(readDuration(fixed)).toBe(2000);
    const delta = fixed.length - file.length;
    expect(delta).toBe(11);
    expect(
      fixed.subarray(HEAD.length + delta).equals(file.subarray(HEAD.length))
    ).toBe(true);
    // Re-injecting replaces the old value rather than adding a second one.
    const again = injectDuration(fixed, 1500);
    expect(again.length).toBe(fixed.length);
    expect(readDuration(again)).toBe(1500);
  });

  it('refuses input that is not a timeslice WebM', () => {
    expect(withDuration(Buffer.from('not webm at all'), 4)).toBeNull();
    expect(withDuration(Buffer.alloc(0), 0)).toBeNull();
  });

  it('keeps the part index in step when finalizing, and after a late splice', () => {
    const chunk0 = Buffer.concat([HEAD, cluster(0, 50)]);
    const c1 = cluster(1000, 50);
    const c2 = cluster(2000, 25);
    const first = withPlayableDuration(
      spliceSegments(null, [
        { index: 0, data: chunk0 },
        { index: 2, data: c2 },
      ])
    );
    expect(readDuration(first.data)).toBe(2500);
    expect(first.index[0].bytes).toBe(chunk0.length + 11);

    const late = withPlayableDuration(
      spliceSegments(
        {
          data: first.data,
          metadata: { segments: encodeSegmentIndex(first.index) },
        },
        [{ index: 1, data: c1 }]
      )
    );
    expect(readDuration(late.data)).toBe(2500);
    expect(late.data.length).toBe(chunk0.length + 11 + c1.length + c2.length);
    expect(
      late.data.subarray(late.index[0].bytes).equals(Buffer.concat([c1, c2]))
    ).toBe(true);
  });

  it('leaves a part without its header chunk untouched', () => {
    const c1 = cluster(1000, 5);
    const out = withPlayableDuration(
      spliceSegments(null, [{ index: 1, data: c1 }])
    );
    expect(out.data.equals(c1)).toBe(true);
  });
});
